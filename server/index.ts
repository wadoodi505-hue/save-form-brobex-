
import axios from 'axios';
import type { Readable } from 'node:stream';
import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';
import { pipeline } from 'node:stream/promises';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT || 8787);

const clientOrigin = process.env.CLIENT_ORIGIN || '*';

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

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, limit - bucket.count)),
    );

    if (bucket.count > limit) {
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
      );
      res.status(429).json({
        error: 'Too many requests. Please wait and try again.',
      });
      return;
    }

    next();
  };
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60_000);

cleanupTimer.unref();

// --------------------------------------------------
// Request validation
// --------------------------------------------------

const submittedUrlSchema = z
  .object({
    url: z.string().trim().min(1).max(2048).url(),
    formatId: z
      .string()
      .trim()
      .max(50)
      .regex(/^[a-zA-Z0-9+_/-]+$/)
      .optional(),
  })
  .strict();

function isYouTubeHost(hostname: string): boolean {
  return [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
  ].includes(hostname.toLowerCase());
}

function extractYouTubeVideoId(input: string): string | null {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !isYouTubeHost(url.hostname)
  ) {
    return null;
  }

  let videoId = '';

  if (url.hostname.toLowerCase() === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  } else {
    const parts = url.pathname.split('/').filter(Boolean);

    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') || '';
    } else if (parts[0] === 'shorts' || parts[0] === 'embed') {
      videoId = parts[1] || '';
    }
  }

  return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
}

// --------------------------------------------------
// Public URL validation for direct MP4 files
// --------------------------------------------------

async function isPublicHttpsMp4(input: string): Promise<boolean> {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return false;
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !/\.mp4$/i.test(url.pathname)
  ) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    return false;
  }

  try {
    if (ipaddr.isValid(hostname)) {
      return ipaddr.process(hostname).range() === 'unicast';
    }

    const addresses = await lookup(hostname, {
      all: true,
      verbatim: true,
    });

    if (addresses.length === 0) {
      return false;
    }

    return addresses.every(
      (entry) =>
        ipaddr.isValid(entry.address) &&
        ipaddr.process(entry.address).range() === 'unicast',
    );
  } catch {
    return false;
  }
}

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
// YouTube preview using public oEmbed metadata
// --------------------------------------------------

app.post(
  '/api/info',
  rateLimit(30, 60_000),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = submittedUrlSchema
      .pick({ url: true })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Please provide a valid URL under 2,048 characters.',
      });
      return;
    }

    const videoId = extractYouTubeVideoId(parsed.data.url);

    if (!videoId) {
      res.status(400).json({
        error: 'Enter a valid YouTube video, Shorts, or youtu.be URL.',
      });
      return;
    }

    try {
      const oembedUrl = new URL('https://www.youtube.com/oembed');

      oembedUrl.searchParams.set(
        'url',
        `https://www.youtube.com/watch?v=${videoId}`,
      );
      oembedUrl.searchParams.set('format', 'json');

      const response = await axios.get<{
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      }>(oembedUrl.toString(), {
        timeout: 10_000,
        maxRedirects: 0,
        maxContentLength: 256 * 1024,
        headers: {
          Accept: 'application/json',
        },
      });

      res.json({
        title: response.data.title || 'YouTube Video',
        thumbnail: response.data.thumbnail_url || '',
        duration: 'Watch on YouTube',
        uploader: response.data.author_name || 'YouTube Creator',
        videoId,
        formats: [],
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.warn(
          'YouTube preview request failed:',
          error.response?.status || error.code || 'request failed',
        );
      } else {
        console.warn('YouTube preview request failed.');
      }

      res.status(502).json({
        error:
          'YouTube could not provide this preview. The video may be private, unavailable, or unsupported.',
      });
    }
  },
);

// --------------------------------------------------
// Direct HTTPS MP4 download
// This does not extract or download YouTube videos.
// --------------------------------------------------

app.post(
  '/api/download',
  rateLimit(15, 60_000),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = submittedUrlSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Please provide a valid download URL.',
      });
      return;
    }

    const { url } = parsed.data;

    // Never use this endpoint to extract YouTube content.
    if (extractYouTubeVideoId(url)) {
      res.status(403).json({
        error:
          'YouTube downloads are not supported. Use the official YouTube player to watch the video.',
      });
      return;
    }

    const safeUrl = await isPublicHttpsMp4(url);

    if (!safeUrl) {
      res.status(400).json({
        error:
          'Only publicly accessible HTTPS URLs ending in .mp4 are supported.',
      });
      return;
    }

    let upstream: Awaited<
      ReturnType<typeof axios.get<Readable>>
    > | undefined;

    try {
      upstream = await axios.get<Readable>(url, {
        responseType: 'stream',
        timeout: 30_000,
        maxRedirects: 0,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: (status) => status === 200,
        headers: {
          Accept: 'video/mp4, application/octet-stream',
          'User-Agent': 'Save-From-Brobex/1.0',
        },
      });

      const contentType = String(
        upstream.headers['content-type'] || '',
      ).toLowerCase();

      if (
        !contentType.startsWith('video/mp4') &&
        !contentType.startsWith('application/octet-stream')
      ) {
        upstream.data.destroy();

        res.status(415).json({
          error: 'The source did not return an MP4-compatible file.',
        });
        return;
      }

      res.status(200);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="brobex-video.mp4"',
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');

      const contentLength = upstream.headers['content-length'];

if (
  typeof contentLength === 'string' ||
  typeof contentLength === 'number'
) {
  res.setHeader('Content-Length', String(contentLength));
}

      await pipeline(upstream.data, res);
    } catch (error) {
      upstream?.data?.destroy();

      if (!res.headersSent) {
        const status =
          axios.isAxiosError(error) && error.response?.status === 404
            ? 404
            : 502;

        res.status(status).json({
          error:
            status === 404
              ? 'The MP4 file was not found.'
              : 'Could not retrieve the MP4 file. Check the URL and try again.',
        });
      } else {
        res.destroy(
          error instanceof Error ? error : new Error('Download stream failed.'),
        );
      }
    }
  },
);

// --------------------------------------------------
// JSON error handling
// --------------------------------------------------

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    if (res.headersSent) {
      res.end();
      return;
    }

    const isPayloadError =
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large';

    res.status(isPayloadError ? 413 : 400).json({
      error: isPayloadError
        ? 'Request body is too large.'
        : 'Invalid request.',
    });
  },
);

const server = app.listen(port, () => {
  console.log(`Save From Brobex API listening on port ${port}`);
});

server.requestTimeout = 120_000;
