const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 3000;

// yt-dlp binary path
const ytDlpPath = require('youtube-dl-exec').constants.YOUTUBE_DL_PATH;

console.log('yt-dlp binary:', ytDlpPath);
console.log('ffmpeg binary:', ffmpegPath);

// ============================================================
// Cookie Support: Write YT_COOKIES env var to a file
// ============================================================
const COOKIES_FILE = path.join(os.tmpdir(), 'yt_cookies.txt');

function setupCookies() {
    const cookieData = process.env.YT_COOKIES;
    if (cookieData) {
        fs.writeFileSync(COOKIES_FILE, cookieData, 'utf8');
        console.log('✅ YouTube cookies loaded from environment');
        return true;
    }
    console.log('⚠️  No YT_COOKIES env var found. YouTube may block requests.');
    return false;
}

const hasCookies = setupCookies();

// Base args that every yt-dlp call should include
function getBaseArgs() {
    const args = [
        '--no-check-certificates',
        '--no-warnings',
        '--ffmpeg-location', ffmpegPath,
        '--extractor-args', 'youtube:player_client=web',
    ];
    if (hasCookies) {
        args.push('--cookies', COOKIES_FILE);
    }
    return args;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Helper: run yt-dlp safely using execFile (no shell)
function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        execFile(ytDlpPath, args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout);
            }
        });
    });
}

// Helper: clean YouTube URL
function cleanYouTubeUrl(url) {
    try {
        const u = new URL(url);
        u.searchParams.delete('pp');
        return u.toString();
    } catch {
        return url;
    }
}

// ============================================================
// API: Get video info
// ============================================================
app.get('/api/info', async (req, res) => {
    const rawUrl = req.query.url;

    if (!rawUrl) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const url = cleanYouTubeUrl(rawUrl);

    try {
        console.log('Fetching info for:', url);

        const args = [
            url,
            '--dump-single-json',
            ...getBaseArgs(),
        ];

        const stdout = await runYtDlp(args);
        const output = JSON.parse(stdout);

        const title = output.title || 'Unknown';
        const thumbnail = output.thumbnail || output.thumbnails?.[output.thumbnails.length - 1]?.url || '';
        const duration = formatDuration(output.duration || 0);
        const views = formatViews(output.view_count || 0);
        const author = output.uploader || output.channel || 'Unknown';

        const formats = output.formats || [];

        // Video formats
        const videoFormats = formats
            .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
            .map(f => ({
                formatId: f.format_id,
                quality: f.height ? `${f.height}p` : f.format_note || 'Unknown',
                format: (f.ext || 'mp4').toUpperCase(),
                ext: f.ext || 'mp4',
                hasAudio: !!(f.acodec && f.acodec !== 'none'),
                hasVideo: true,
                size: f.filesize
                    ? formatBytes(f.filesize)
                    : f.filesize_approx
                        ? '~' + formatBytes(f.filesize_approx)
                        : 'Unknown',
                fps: f.fps,
                height: f.height || 0,
                tbr: f.tbr || 0,
            }))
            .reduce((acc, f) => {
                const key = `${f.quality}_${f.format}`;
                const existing = acc.find(x => `${x.quality}_${x.format}` === key);
                if (!existing) {
                    acc.push(f);
                } else if (f.hasAudio && !existing.hasAudio) {
                    acc[acc.indexOf(existing)] = f;
                } else if (f.tbr > existing.tbr) {
                    acc[acc.indexOf(existing)] = f;
                }
                return acc;
            }, [])
            .sort((a, b) => a.height - b.height);

        // Audio formats
        const audioFormats = formats
            .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
            .map(f => ({
                formatId: f.format_id,
                quality: f.abr ? `${Math.round(f.abr)}kbps` : f.format_note || 'Unknown',
                format: (f.ext || 'm4a').toUpperCase(),
                ext: f.ext || 'm4a',
                hasAudio: true,
                hasVideo: false,
                size: f.filesize
                    ? formatBytes(f.filesize)
                    : f.filesize_approx
                        ? '~' + formatBytes(f.filesize_approx)
                        : 'Unknown',
                abr: f.abr || 0,
            }))
            .reduce((acc, f) => {
                const existing = acc.find(x => x.quality === f.quality && x.format === f.format);
                if (!existing) acc.push(f);
                return acc;
            }, [])
            .sort((a, b) => a.abr - b.abr);

        console.log(`✅ Found ${videoFormats.length} video and ${audioFormats.length} audio formats for: ${title}`);

        res.json({
            id: output.id,
            title,
            thumbnail,
            duration,
            durationSeconds: output.duration || 0,
            views,
            author,
            videoFormats,
            audioFormats,
            originalUrl: url,
        });
    } catch (err) {
        console.error('❌ Error fetching video info:', err.message);
        res.status(500).json({ error: 'Failed to fetch video info. Please try again.' });
    }
});

// ============================================================
// API: Download video/audio stream
// ============================================================
app.get('/api/download', (req, res) => {
    const { formatId, title, ext } = req.query;
    const url = cleanYouTubeUrl(req.query.url || '');

    if (!url || !formatId) {
        return res.status(400).json({ error: 'URL and formatId are required' });
    }

    const safeTitle = (title || 'video').replace(/[^\w\s\-()[\]]/g, '').trim().replace(/\s+/g, '_');
    const fileExt = ext || 'mp4';
    const filename = `${safeTitle}.${fileExt}`;

    console.log(`⬇️  Downloading format ${formatId} for: ${url}`);

    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Type', 'application/octet-stream');

    const args = [
        url,
        '-f', formatId,
        '-o', '-',
        ...getBaseArgs(),
    ];

    const proc = spawn(ytDlpPath, args);
    proc.stdout.pipe(res);
    proc.stderr.on('data', (d) => console.error('yt-dlp:', d.toString().trim()));
    proc.on('error', (err) => {
        console.error('Process error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    });
    proc.on('close', (code) => { if (code !== 0) console.error(`yt-dlp exited with code ${code}`); });
    req.on('close', () => { try { proc.kill(); } catch {} });
});

// ============================================================
// API: Download with audio+video merge
// ============================================================
app.get('/api/download-merge', (req, res) => {
    const { formatId, title } = req.query;
    const url = cleanYouTubeUrl(req.query.url || '');

    if (!url || !formatId) {
        return res.status(400).json({ error: 'URL and formatId are required' });
    }

    const safeTitle = (title || 'video').replace(/[^\w\s\-()[\]]/g, '').trim().replace(/\s+/g, '_');
    const filename = `${safeTitle}.mp4`;

    console.log(`⬇️  Downloading+merging format ${formatId} for: ${url}`);

    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Type', 'application/octet-stream');

    const args = [
        url,
        '-f', `${formatId}+bestaudio`,
        '--merge-output-format', 'mp4',
        '-o', '-',
        ...getBaseArgs(),
    ];

    const proc = spawn(ytDlpPath, args);
    proc.stdout.pipe(res);
    proc.stderr.on('data', (d) => console.error('yt-dlp:', d.toString().trim()));
    proc.on('error', (err) => {
        console.error('Process error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    });
    proc.on('close', (code) => { if (code !== 0) console.error(`yt-dlp exited with code ${code}`); });
    req.on('close', () => { try { proc.kill(); } catch {} });
});

// ============================================================
// Helpers
// ============================================================
function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return 'Unknown';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatViews(views) {
    if (!views || isNaN(views)) return '0';
    if (views >= 1e9) return `${(views / 1e9).toFixed(1)}B`;
    if (views >= 1e6) return `${(views / 1e6).toFixed(1)}M`;
    if (views >= 1e3) return `${(views / 1e3).toFixed(1)}K`;
    return views.toString();
}

// ============================================================
// Start
// ============================================================
app.listen(PORT, () => {
    console.log(`\n  ✅ VidGrab server running at http://localhost:${PORT}\n`);
    console.log(`  Open http://localhost:${PORT} in your browser.\n`);
});
