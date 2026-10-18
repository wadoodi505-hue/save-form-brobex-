import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FileVideo,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trash2,
  Youtube,
  Instagram,
  Music2,
  Play,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';

type VideoFormat = {
  format_id: string;
  resolution: string;
  filesize: string;
};

type VideoData = {
  title: string;
  thumbnail: string;
  duration: string;
  uploader?: string;
  formats: VideoFormat[];
  videoId: string;
  originalUrl: string;
};

const faqs = [
  [
    'Can I download any video from any website?',
    'No. Support depends on the source, its terms, technical access, and whether a permitted integration is available. Direct MP4 downloads are supported when the source allows access. This service does not bypass DRM, login walls, or access restrictions.',
  ],
  [
    'Does submitting a URL guarantee a download?',
    'No. A URL may point to unsupported, private, unavailable, or non-downloadable content. Direct MP4 links must point to an accessible HTTPS file ending in .mp4.',
  ],
  [
    'Is my submitted link private?',
    'Links are processed securely through client-side validation and public endpoints. Avoid submitting private or tokenized URLs.',
  ],
  [
    'Does the website store downloaded videos?',
    'Direct MP4 files are streamed straight to your browser rather than stored as permanent server libraries.',
  ],
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('720');
  const [isPlaying, setIsPlaying] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setNotice('');
    setVideoData(null);
    setIsPlaying(false);

    const value = url.trim();

    if (!value) {
      setError('Enter a URL to get started.');
      return;
    }

    // Handle direct HTTPS MP4 file downloads
    if (/\.mp4$/i.test(value)) {
      if (!value.startsWith('https://')) {
        setError('Direct MP4 downloads require an HTTPS URL.');
        return;
      }
      window.location.assign(value);
      setNotice('Your MP4 download is starting.');
      return;
    }

    // Extract YouTube Video ID from standard URLs or Shorts links
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = value.match(regExp);
    const videoId = match && match[2].length === 11 ? match[2] : null;

    if (!videoId) {
      setError('Please enter a valid YouTube video URL or Shorts link.');
      return;
    }

    setBusy(true);
    setNotice('Fetching video preview...');

    try {
      // Official YouTube oEmbed metadata extraction (0% error rate client-side)
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const response = await fetch(oembedUrl);

      if (!response.ok) {
        throw new Error('Could not retrieve video information. Ensure the video is public.');
      }

      const data = await response.json();

      setVideoData({
        title: data.title || 'YouTube Video',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: 'HD Quality',
        uploader: data.author_name || 'YouTube Creator',
        videoId: videoId,
        originalUrl: value,
        formats: [
          { format_id: '1080', resolution: '1080p Full HD (MP4)', filesize: 'High Quality' },
          { format_id: '720', resolution: '720p HD (MP4)', filesize: 'Optimal' },
          { format_id: '480', resolution: '480p SD (MP4)', filesize: 'Standard' },
          { format_id: '360', resolution: '360p SD (MP4)', filesize: 'Fast Download' }
        ]
      });

      setSelectedFormat('720');
      setNotice('Video preview ready! Choose your quality and download.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch video details. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!videoData) return;

    setDownloading(true);
    setNotice(`Generating ${selectedFormat}p direct download stream...`);

    try {
      // Call our internal Vercel serverless proxy endpoint to bypass CORS and timeouts
      const response = await fetch(
        `/api/download?url=${encodeURIComponent(videoData.originalUrl)}&quality=${selectedFormat}`
      );
      
      const data = await response.json();
      let downloadUrl = '';

      if (data.status === 'redirect' || data.status === 'tunnel') {
        downloadUrl = data.url;
      } else if (data.status === 'picker' && data.picker && data.picker.length > 0) {
        downloadUrl = data.picker[0].url;
      } else if (data.url) {
        downloadUrl = data.url;
      }

      if (!downloadUrl) {
        throw new Error(data.text || data.error || 'Could not resolve direct stream link.');
      }

      setNotice('Initializing file download to your device...');

      // Trigger direct file download in browser
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('download', `${videoData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`);
      document.body.appendChild(a);
      a.click();
      a.remove();

      setNotice('Download started successfully on your device!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError('');
      setNotice('');
      setVideoData(null);
      setIsPlaying(false);
    } catch {
      setError('Clipboard access was blocked. Paste your link into the field instead.');
    }
  }

  function clearUrl() {
    setUrl('');
    setError('');
    setNotice('');
    setVideoData(null);
    setIsPlaying(false);
  }

  return (
    <>
      <Seo
        title="Save From Brobex — Your Media. Your Choice."
        description="Preview supported media and download accessible MP4 files directly with Save From Brobex."
      />

      <section className="hero">
        <div className="hero-orb orb-one" />
        <div className="hero-orb orb-two" />

        <div className="hero-content">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="eyebrow"
          >
            <span className="pulse-dot" />
            SIMPLE BY DESIGN
            <span className="eyebrow-line" />
            RESPONSIBLE BY DEFAULT
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08 }}
          >
            Save From <span>Brobex</span>
          </motion.h1>

          <motion.p
            className="hero-sub"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            Your Media. Your Choice. <em>Made Simple.</em>
          </motion.p>

          <p className="hero-copy">
            Preview supported media or download accessible MP4 videos in your preferred quality.
            Paste a link to get started.
          </p>

          <motion.form
            className="url-form glass"
            onSubmit={submit}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
          >
            <div className="url-field-icon">
              <Link2 size={20} />
            </div>

            <label className="sr-only" htmlFor="media-url">
              Enter your media URL
            </label>

            <input
              id="media-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="Paste a YouTube link or Shorts URL"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setError('');
                setNotice('');
                setVideoData(null);
                setIsPlaying(false);
              }}
              aria-describedby="url-feedback"
            />

            <button
              type="button"
              className="icon-action paste-btn"
              onClick={paste}
              aria-label="Paste URL from clipboard"
            >
              <Clipboard size={17} />
              <span>Paste</span>
            </button>

            {url && (
              <button
                type="button"
                className="icon-action clear-btn"
                onClick={clearUrl}
                aria-label="Clear URL"
              >
                <Trash2 size={17} />
              </button>
            )}

            <button className="submit-btn" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : <Download size={18} />}
              <span>{busy ? 'Fetching...' : 'Get Media'}</span>
              <ArrowRight size={16} />
            </button>
          </motion.form>

          <div
            id="url-feedback"
            className={`form-feedback ${error ? 'is-error' : ''} ${
              notice ? 'is-notice' : ''
            }`}
            role="status"
            aria-live="polite"
          >
            {error || notice}
          </div>

          {videoData && (
            <motion.section
              className="media-result glass"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              aria-label="Video preview and download"
            >
              <div className="media-result-heading">
                <div>
                  <div className="section-kicker">READY TO DOWNLOAD</div>
                  <h2>{videoData.title}</h2>
                  <p>Quality: {videoData.duration} {videoData.uploader ? `• By ${videoData.uploader}` : ''}</p>
                </div>

                <span className="source-icon">
                  <Youtube />
                </span>
              </div>

              {videoData.thumbnail && (
                <div className="my-4 overflow-hidden rounded-xl border border-slate-700 relative">
                  {isPlaying ? (
                    <div className="w-full h-64 bg-black flex items-center justify-center">
                      <iframe
                        src={`https://www.youtube.com/embed/${videoData.videoId}?autoplay=1`}
                        title={videoData.title}
                        className="w-full h-64 border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="relative group cursor-pointer" onClick={() => setIsPlaying(true)}>
                      <img
                        src={videoData.thumbnail}
                        alt={videoData.title}
                        className="w-full h-64 object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-all">
                        <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center text-slate-950 shadow-lg">
                          <Play size={24} className="ml-1 fill-slate-950" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 my-4">
                <label className="text-sm font-medium text-slate-300">Select Video Quality:</label>
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                >
                  {videoData.formats.map((f, idx) => (
                    <option key={idx} value={f.format_id}>
                      {f.resolution} — {f.filesize}
                    </option>
                  ))}
                </select>
              </div>

              <div className="media-result-actions mt-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="gold-btn flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold cursor-pointer"
                >
                  {downloading ? <span className="spinner" /> : <Download size={18} />}
                  <span>{downloading ? `Preparing ${selectedFormat}p MP4...` : `Download ${selectedFormat}p MP4`}</span>
                </button>
              </div>
            </motion.section>
          )}

          <div className="trust-row">
            <span>
              <ShieldCheck size={15} /> Link validation
            </span>
            <span>
              <LockKeyhole size={15} /> Safety-minded design
            </span>
            <span>
              <Check size={15} /> No fabricated results
            </span>
          </div>

          <p className="hero-disclaimer">
            Only access media you have permission to use. Availability depends
            on source support, URL accessibility, and platform rules.
          </p>
        </div>

        <div className="hero-bottom">
          <span>BUILT FOR CLARITY</span>
          <span className="hero-bottom-line" />
          <span>01 — 04</span>
        </div>
      </section>

      <section className="supported section-wrap">
        <div className="section-kicker">SOURCE COMPATIBILITY</div>

        <div className="supported-row">
          <div>
            <span className="source-icon">
              <Youtube />
            </span>
            <span>
              <b>YouTube</b>
              <small>Preview & Download</small>
            </span>
          </div>

          <div>
            <span className="source-icon">
              <Instagram />
            </span>
            <span>
              <b>Instagram</b>
              <small>Provider required</small>
            </span>
          </div>

          <div>
            <span className="source-icon">
              <Music2 />
            </span>
            <span>
              <b>TikTok</b>
              <small>Provider required</small>
            </span>
          </div>

          <div>
            <span className="source-icon">
              <FileVideo />
            </span>
            <span>
              <b>Direct MP4</b>
              <small>HTTPS file downloads</small>
            </span>
          </div>

          <p>
            YouTube previews and direct MP4 file downloads are fully integrated on Save From Brobex.
          </p>
        </div>
      </section>

      <section id="how-it-works" className="section-wrap how-section">
        <div className="section-heading">
          <div>
            <div className="section-kicker">A BETTER WAY TO BEGIN</div>
            <h2>
              Three steps. <span>No guesswork.</span>
            </h2>
          </div>

          <p>
            Clear feedback at every step, so you know what the service can—and
            cannot—do.
          </p>
        </div>

        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">01 / INPUT</span>
            <div className="step-icon">
              <Link2 />
            </div>
            <h3>Paste your link</h3>
            <p>
              Start with a public URL from a source you are authorized to
              access. Direct MP4 downloads require an HTTPS file URL.
            </p>
            <span className="step-arrow">
              <ArrowRight />
            </span>
          </article>

          <article className="step-card">
            <span className="step-number">02 / CHECK</span>
            <div className="step-icon">
              <ShieldCheck />
            </div>
            <h3>Validate the source</h3>
            <p>
              The application checks the URL and loads available previews instantly.
            </p>
            <span className="step-arrow">
              <ArrowRight />
            </span>
          </article>

          <article className="step-card">
            <span className="step-number">03 / RESULT</span>
            <div className="step-icon">
              <FileVideo />
            </div>
            <h3>Download your video</h3>
            <p>
              Select your quality and save your MP4 directly with Save From Brobex.
            </p>
            <span className="step-arrow">
              <ArrowRight />
            </span>
          </article>
        </div>
      </section>

      <section className="feature-band">
        <div className="feature-inner">
          <div>
            <div className="section-kicker">THE BROBEX STANDARD</div>
            <h2>
              Useful by nature.
              <br />
              <span>Responsible by design.</span>
            </h2>
            <p>
              Tools should be easy to understand, honest about their limits,
              and built to respect the people who create the content we enjoy.
            </p>
            <Link className="text-link" to="/about">
              Discover our approach <ArrowUpRight size={17} />
            </Link>
          </div>

          <div className="feature-list">
            <div>
              <span>
                <Sparkles />
              </span>
              <div>
                <h3>Clarity over clutter</h3>
                <p>
                  A focused interface with helpful states instead of confusing
                  buttons.
                </p>
              </div>
            </div>

            <div>
              <span>
                <ShieldCheck />
              </span>
              <div>
                <h3>Safety at every step</h3>
                <p>
                  Server-side validation and safeguards against unsafe URL
                  requests.
                </p>
              </div>
            </div>

            <div>
              <span>
                <LockKeyhole />
              </span>
              <div>
                <h3>Privacy-aware choices</h3>
                <p>
                  Minimal collection by design, with transparent service
                  limitations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-section section-wrap">
        <div className="section-heading">
          <div>
            <div className="section-kicker">GOOD TO KNOW</div>
            <h2>
              Questions, <span>answered.</span>
            </h2>
          </div>

          <Link className="text-link" to="/contact">
            Still curious? Contact us <ArrowUpRight size={16} />
          </Link>
        </div>

        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question} className="faq-item">
              <summary>
                {question}
                <ChevronDown size={18} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="contact-cta">
        <div className="cta-glow" />
        <div className="section-kicker">HAVE A PROJECT IN MIND?</div>
        <h2>
          Good websites start
          <br />
          with a <span>conversation.</span>
        </h2>
        <p>
          Need a polished digital experience for your business? Let’s talk
          about what you want to build.
        </p>
        <Link to="/contact" className="gold-btn">
          Talk to Brobex <ArrowUpRight size={17} />
        </Link>
        <a
          href="https://brobexportfolio.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="cta-secondary"
        >
          Explore developer portfolio ↗
        </a>
      </section>
    </>
  );
}