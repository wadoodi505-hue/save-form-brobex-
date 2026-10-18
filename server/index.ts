import { type AxiosResponse } from 'axios';
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

    bucket.count++;

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));

    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
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
// Validation Schema
// --------------------------------------------------
const submittedUrlSchema = z
  .object({
    url: z.string().trim().min(1).max(2048).url(),
    formatId: z.string().trim().max(50).regex(/^[a-zA-Z0-9+_/-]+$/).optional(),
  })
  .strict();

// --------------------------------------------------
// Health Check
// --------------------------------------------------
app.get('/api/health', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', service: 'save-from-brobex-api' });
});

// --------------------------------------------------
// YouTube Info Preview Endpoint
// --------------------------------------------------
app.post(
  '/api/info',
  rateLimit(30, 60_000),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = submittedUrlSchema.pick({ url: true }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid URL under 2,048 characters.' });
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
        ytOptions.extractorArgs = 'youtube:player_client=android,web';
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

      res.json({
        title: output.title || 'Untitled Video',
        thumbnail: output.thumbnail || '',
        duration: output.duration_string || 'Unknown',
        uploader: output.uploader || 'Unknown',
        formats,
      });
    } catch (error: any) {
      console.error('--- YT-DLP INFO ERROR ---', error.stderr || error.message);
      res.status(500).json({ error: error.stderr || 'Failed to fetch video information.' });
    }
  },
);

// --------------------------------------------------
// YouTube Video Download Endpoint
// --------------------------------------------------
app.post(
  '/api/download',
  rateLimit(15, 60_000),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = submittedUrlSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid URL or format ID provided.' });
      return;
    }

    const { url, formatId } = parsed.data;
    
    // Fallback safely to prevent stream breakage on specific format matching
    const targetFormat = formatId ? `${formatId}+bestaudio/best[ext=mp4]/best` : 'best[ext=mp4]/best';

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
        mergeOutputFormat: 'mp4',
      };

      if (hasCookies) {
        downloadOptions.cookies = cookiesPath;
      } else {
        downloadOptions.extractorArgs = 'youtube:player_client=android,web';
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
      errorOutput += data.toString();
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
        console.error('yt-dlp failed with exit code', code, errorOutput);
        res.status(500).json({ error: errorOutput || 'Download failed.' });
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    req.on('close', () => {
      if (ytProcess && typeof ytProcess.kill === 'function' && !ytProcess.killed) {
        ytProcess.kill('SIGTERM');
      }
    });
  },
);

app.listen(port, () => {
  console.log(`Save From Brobex API listening on port ${port}`);
});