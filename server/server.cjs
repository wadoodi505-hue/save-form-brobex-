const express = require('express');
const cors = require('cors');
const ytDlp = require('yt-dlp-exec');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Endpoint to get video info for preview & quality selection
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const output = await ytDlp(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
        });

        // Extract relevant metadata for the preview card
        const videoInfo = {
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration_string,
            uploader: output.uploader,
            formats: output.formats
                .filter(f => f.ext === 'mp4' && f.height) // filter standard MP4 formats with video resolution
                .map(f => ({
                    format_id: f.format_id,
                    resolution: `${f.height}p`,
                    fps: f.fps,
                    filesize: f.filesize ? Math.round(f.filesize / (1024 * 1024)) + ' MB' : 'Unknown',
                }))
        };

        res.json(videoInfo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch video information.' });
    }
});

// 2. Endpoint to handle video streaming and downloading
app.post('/api/download', (req, res) => {
    const { url, formatId } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');

    const args = [
        url,
        '-f', formatId ? `${formatId}+140` : 'best[ext=mp4]',
        '-o', '-'
    ];

    const ytProcess = spawn('yt-dlp', args);

    ytProcess.stdout.pipe(res);

    ytProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    ytProcess.on('close', (code) => {
        if (code !== 0 && !res.headersSent) {
            res.status(500).json({ error: 'Download processing failed.' });
        }
    });
});

// 3. Start the server
app.listen(5000, () => console.log('Backend running on http://localhost:5000'));