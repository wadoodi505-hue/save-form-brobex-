import axios, { type AxiosResponse } from 'axios';
import type { Readable } from 'node:stream';
import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import ytDlp from 'yt-dlp-exec';

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT || 8787);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cookiesPath = path.resolve(__dirname, 'cookies.txt');
const hasCookies = fs.existsSync(cookiesPath);

if (hasCookies) {
  console.log('🔒 YouTube cookies detected! Using native authenticated session.');
} else {
  console.log('⚠️ No cookies.txt found in server/. Running with unauthenticated fallback.');
}

const clientOrigin =
  process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.disable('x-powered-by');

app.use(
  cors({
    origin: clientOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  }),
);

app.use(express.json({ limit: '12kb', strict: true }));

// --------------------------------------------------
// Rate limiting
// --------------------------------------------------

const buckets = new Map<
  string,
  { count: number; resetAt: number }
>();

function rateLimit(limit: number, windowMs: number) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 0,
        resetAt: now + windowMs,
      };

      buckets.set(key, bucket);
    }

    bucket.count++;

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, limit - bucket.count)),
    );

    if (bucket.count > limit) {
      res.setHeader(
        'Retry-After',
        String(Math.ceil((bucket.resetAt - now) / 1000)),
      );

      res.status(429).json({
        error: 'Too many requests. Please wait and try again.',
      });

      return;
    }

    next();
  };
}

setInterval(() => {
  const now = Date.now();

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60_000).unref();

// --------------------------------------------------
// Validation Schemas
// --------------------------------------------------

const submittedUrlSchema = z
  .object({
    url: z.string().trim().min(1).max(2048).url(),
    formatId: z.string().trim().max(50).regex(/^[a-zA-Z0-9+_/-]+$/).optional(),
  })
  .strict();

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get('/api/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    service: 'save-from-brobex-api',
  });
});

// --------------------------------------------------
// YouTube Info Preview Endpoint
// --------------------------------------------------
app.post(
  '/api/info',
  rateLimit(20, 60_000),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = submittedUrlSchema.pick({ url: true }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Please provide a valid URL under 2,048 characters.',
      });
      return;
    }

    const { url } = parsed.data;

    try {
      const ytOptions: Record<string, any> = {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        ignoreConfig: true,
        noPlaylist: true,
      };

      if (hasCookies) {
        ytOptions.cookies = cookiesPath;
      } else {
        ytOptions.extractorArgs = 'youtube:player_client=android';
      }

      const output: any = await ytDlp(url, ytOptions);

      let formats = (output.formats || [])
        .filter((f: any) => f.ext === 'mp4' && f.height)
        .map((f: any) => ({
          format_id: f.format_id,
          resolution: `${f.height}p`,
          fps: f.fps || 30,
          filesize: f.filesize ? Math.round(f.filesize / (1024 * 1024)) + ' MB' : (f.filesize_approx ? Math.round(f.filesize_approx / (1024 * 1024)) + ' MB' : 'Unknown size'),
        }));

      const seenResolutions = new Set();
      formats = formats.filter((f: any) => {
        if (seenResolutions.has(f.resolution)) return false;
        seenResolutions.add(f.resolution);
        return true;
      });

      if (formats.length === 0) {
        formats = [{
          format_id: 'best[ext=mp4]/best',
          resolution: 'Best Available (MP4)',
          fps: 30,
          filesize: 'Unknown size',
        }];
      }

      const videoInfo = {
        title: output.title || 'Untitled Video',
        thumbnail: output.thumbnail || '',
        duration: output.duration_string || 'Unknown',
        uploader: output.uploader || 'Unknown',
        formats,
      };

      res.json(videoInfo);
    } catch (error: any) {
      console.error('--- YT-DLP INFO ERROR ---');
      console.error(error.stderr || error.message || error);
      
      res.status(500).json({
        error: error.stderr || 'Failed to fetch video information. Ensure the link is public and valid.',
      });
    }
  },
);

// --------------------------------------------------
// YouTube Video Download Endpoint
// --------------------------------------------------
app.post(
  '/api/download',
  rateLimit(10, 60_000),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = submittedUrlSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid URL or format ID provided.' });
      return;
    }

    const { url, formatId } = parsed.data;
    const targetFormat = formatId ? `${formatId}+140/best[ext=mp4]/best` : 'best[ext=mp4]/best';

    let ytProcess: any;
    try {
      const downloadOptions: Record<string, any> = {
        format: targetFormat,
        output: '-',
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        ignoreConfig: true,
        noPlaylist: true,
      };

      if (hasCookies) {
        downloadOptions.cookies = cookiesPath;
      } else {
        downloadOptions.extractorArgs = 'youtube:player_client=android';
      }

      ytProcess = ytDlp(url, downloadOptions);
    } catch (err) {
      console.error('Download spawn error:', err);
      res.status(500).json({ error: 'Failed to start video stream process.' });
      return;
    }

    let headersSent = false;
    let errorOutput = '';

    ytProcess.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      errorOutput += msg;
      console.error(`yt-dlp stderr: ${msg}`);
    });

    ytProcess.stdout.on('data', (chunk: Buffer) => {
      if (!headersSent) {
        headersSent = true;
        res.setHeader('Content-Disposition', 'attachment; filename="brobex-video.mp4"');
        res.setHeader('Content-Type', 'video/mp4');
      }
      res.write(chunk);
    });

    ytProcess.on('close', (code: number | null) => {
      if (code !== 0 && !headersSent) {
        console.error('yt-dlp failed completely with exit code', code, 'Error:', errorOutput);
        res.status(500).json({ error: errorOutput || 'Download failed. Ensure the link is valid.' });
      } else {
        if (!res.writableEnded) {
          res.end();
        }
      }
    });

    req.on('close', () => {
      if (ytProcess && typeof ytProcess.kill === 'function' && !ytProcess.killed) {
        ytProcess.kill('SIGTERM');
      }
    });
  },
);

// --------------------------------------------------
// Contact endpoint
// --------------------------------------------------
const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    subject: z.string().trim().min(3).max(150),
    message: z.string().trim().min(10).max(5000),
  })
  .strict();

app.post(
  '/api/contact',
  rateLimit(5, 60 * 60_000),
  (req: Request, res: Response): void => {
    const parsed = contactSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Please check your name, email, subject, and message.',
      });
      return;
    }

    res.status(503).json({
      error:
        'Contact delivery is not configured. Please email brobex.ffx@gmail.com directly.',
    });
  },
);

// --------------------------------------------------
// Direct HTTPS MP4 downloader with SSRF Guard
// --------------------------------------------------
const MAX_DIRECT_MP4_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 3;

async function validatePublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error('Please enter a valid video URL.');
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error('Use a valid public HTTPS video URL without credentials or a custom port.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('This video host is not allowed.');
  }

  const addresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  if (!addresses.length) {
    throw new Error('The video host could not be resolved.');
  }

  for (const item of addresses) {
    const parsedIp = ipaddr.parse(item.address);
    const range = parsedIp.range();
    if (range !== 'unicast' && range !== ('global' as string)) {
      throw new Error('This video host is not publicly accessible.');
    }
  }

  return url;
}

app.get(
  '/api/media/download',
  rateLimit(10, 60_000),
  async (req: Request, res: Response): Promise<void> => {
    const input = req.query.url;

    if (typeof input !== 'string' || input.length > 4096) {
      res.status(400).json({
        error: 'Please provide one direct HTTPS MP4 URL in the url parameter.',
      });
      return;
    }

    let upstream: AxiosResponse<Readable> | undefined;

    try {
      let target = await validatePublicHttpsUrl(input);

      for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
        upstream = await axios.get<Readable>(target.toString(), {
          responseType: 'stream',
          timeout: 20_000,
          maxRedirects: 0,
          proxy: false,
          validateStatus: () => true,
          headers: {
            'User-Agent': 'SaveFromBrobex/1.0',
          },
        });

        const status = upstream.status;

        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = upstream.headers.location;
          upstream.data.destroy();

          if (!location || attempt === MAX_REDIRECTS) {
            res.status(502).json({
              error: 'Too many or invalid video redirects.',
            });
            return;
          }

          target = await validatePublicHttpsUrl(
            new URL(location, target).toString(),
          );
          continue;
        }

        break;
      }

      if (!upstream || upstream.status !== 200) {
        upstream?.data.destroy();
        res.status(502).json({
          error: 'The video server did not provide a downloadable file.',
        });
        return;
      }

      const contentType = String(upstream.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();

      const pathLooksLikeMp4 = target.pathname.toLowerCase().endsWith('.mp4');
      const isMp4 =
        contentType === 'video/mp4' ||
        (contentType === 'application/octet-stream' && pathLooksLikeMp4);

      if (!isMp4) {
        upstream.data.destroy();
        res.status(415).json({
          error: 'This URL does not appear to be a direct MP4 file.',
        });
        return;
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="brobex-video.mp4"');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      let receivedBytes = 0;
      const sizeLimiter = new Transform({
        transform(chunk, _encoding, callback) {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_DIRECT_MP4_BYTES) {
            callback(new Error('Video exceeds the 100 MB limit.'));
            return;
          }
          callback(null, chunk);
        },
      });

      await pipeline(upstream.data, sizeLimiter, res);
    } catch (error) {
      upstream?.data?.destroy();
      if (!res.headersSent) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Unable to download this MP4 file.',
        });
      } else {
        res.destroy();
      }
    }
  },
);

// --------------------------------------------------
// Unknown API routes
// --------------------------------------------------
app.use('/api', (_req: Request, res: Response): void => {
  res.status(404).json({
    error: 'API endpoint not found.',
  });
});

// --------------------------------------------------
// Serve static client assets in production
// --------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(dirname, '../dist');

  app.use(
    express.static(dist, {
      index: false,
      maxAge: '1h',
    }),
  );

  app.get('*path', (_req: Request, res: Response): void => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// --------------------------------------------------
// Generic error handler
// --------------------------------------------------
app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    console.error('Unhandled request error:', err);

    if (res.headersSent) {
      res.destroy();
      return;
    }

    res.status(500).json({
      error: 'An unexpected server error occurred.',
    });
  },
);

app.listen(port, () => {
  console.log(`Save From Brobex API listening on port ${port}`);
});