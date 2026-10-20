
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
  fps?: number;
  filesize: string;
};

type VideoData = {
  kind: 'youtube' | 'direct-mp4';
  title: string;
  thumbnail: string;
  duration: string;
  uploader?: string;
  formats: VideoFormat[];
  originalUrl: string;
  videoId?: string;
};

const faqs = [
  [
    'Can I download any video from any website?',
    'No. Support depends on the source, its terms, technical access, and whether a permitted integration is available. This website supports direct HTTPS MP4 downloads for media you own or are authorized to download. It does not bypass DRM, login walls, or access restrictions.',
  ],
  [
    'Can I download a YouTube video here?',
    'You can preview supported public YouTube videos using the official embedded player and view their public metadata. This version does not download YouTube videos. Use YouTube’s own download options where available.',
  ],
  [
    'Does submitting a URL guarantee a download?',
    'No. A URL may point to unsupported, private, unavailable, or non-downloadable content. Direct MP4 links must point to an accessible HTTPS file ending in .mp4.',
  ],
  [
    'Is my submitted link private?',
    'Links are processed by the service backend to retrieve supported metadata or validate a media file. Avoid submitting private, confidential, or tokenized URLs.',
  ],
  [
    'Does the website store downloaded videos?',
    'Direct MP4 files are streamed through the backend to your browser rather than stored as a permanent server library.',
  ],
];

function getYouTubeVideoId(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : undefined;
    }

    if (
      host !== 'youtube.com' &&
      host !== 'm.youtube.com' &&
      host !== 'music.youtube.com'
    ) {
      return undefined;
    }

    let id = parsed.searchParams.get('v') || undefined;

    if (!id) {
      const parts = parsed.pathname.split('/').filter(Boolean);

      if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
        id = parts[1];
      }
    }

    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

function getSafeFilename(value: string): string {
  let name = value;

  try {
    name = decodeURIComponent(value);
  } catch {
    // Keep the original filename if URL encoding is malformed.
  }

  return (
    name
      .replace(/\.mp4$/i, '')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 120) || 'video'
  );
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const API_BASE = (
    import.meta.env.VITE_API_URL || 'http://localhost:8787'
  ).replace(/\/+$/, '');

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

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(value);
    } catch {
      setError('Enter a valid URL, including https://.');
      return;
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      setError('Only HTTP and HTTPS URLs are supported.');
      return;
    }

    if (parsedUrl.pathname.toLowerCase().endsWith('.mp4')) {
      if (parsedUrl.protocol !== 'https:') {
        setError('Direct MP4 downloads require an HTTPS URL.');
        return;
      }

      const rawFilename = parsedUrl.pathname.split('/').pop() || 'video.mp4';
      const filename = getSafeFilename(rawFilename);

      setVideoData({
        kind: 'direct-mp4',
        title: filename,
        thumbnail: '',
        duration: 'Original MP4 file',
        uploader: 'Direct media source',
        originalUrl: parsedUrl.toString(),
        formats: [
          {
            format_id: 'direct-mp4',
            resolution: 'Original quality',
            filesize: 'Original file',
          },
        ],
      });

      
      setNotice(
        'MP4 link ready. If you own this media or have permission to use it, select Download MP4 to validate and download the file.',
      );
      return;
    }

    setBusy(true);
    setNotice('Checking the link and retrieving available public metadata...');

    try {
      const response = await fetch(`${API_BASE}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      });

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.includes('application/json')) {
        throw new Error(
          'The backend could not process this link. Please try again shortly.',
        );
      }

      const data = await response.json();
      const videoId = getYouTubeVideoId(value);

      if (videoId) {
        setVideoData({
          kind: 'youtube',
          title: data.title || 'YouTube Video',
          thumbnail:
            data.thumbnail ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: data.duration || 'Available on YouTube',
          uploader: data.uploader || 'YouTube Creator',
          originalUrl: value,
          videoId,
          formats: [],
        });

        setNotice(
          'YouTube preview ready. Play the preview here or open the video on YouTube. Video downloads are not available through this preview.',
        );
      } else {
        setVideoData({
          kind: 'youtube',
          title: data.title || 'Media Preview',
          thumbnail: data.thumbnail || '',
          duration: data.duration || 'Duration unavailable',
          uploader: data.uploader || 'Source information',
          originalUrl: value,
          formats: [],
        });

        setNotice(
          'Metadata retrieved. A playable preview is available only for supported YouTube links. Direct HTTPS MP4 links can be downloaded separately.',
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not retrieve link information. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!videoData || videoData.kind !== 'direct-mp4') {
      setError(
        'Downloads are currently available for supported direct HTTPS MP4 files only.',
      );
      return;
    }

    setDownloading(true);
    setError('');
    setNotice('Validating the MP4 source and preparing your download...');

    try {
      const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoData.originalUrl,
          formatId: 'direct-mp4',
        }),
      });

      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        let message = 'The server could not download this MP4 file.';

        if (contentType.includes('application/json')) {
          const errData = await res.json().catch(() => ({}));
          if (typeof errData.error === 'string') {
            message = errData.error;
          }
        }

        throw new Error(message);
      }

      if (contentType.includes('application/json')) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          typeof errData.error === 'string'
            ? errData.error
            : 'The server returned a message instead of a video file.',
        );
      }

      const blob = await res.blob();

      if (blob.size === 0) {
        throw new Error('The downloaded file was empty. Please check the URL.');
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = downloadUrl;
      anchor.download = `${getSafeFilename(videoData.title)}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);

      setNotice('Your MP4 download has been prepared successfully.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Download failed. Please check the URL and try again.',
      );
      setNotice('');
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
      setError(
        'Clipboard access was blocked. Paste your link into the field instead.',
      );
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
        description="Preview supported YouTube videos and download accessible direct HTTPS MP4 files you are authorized to use."
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
            Preview supported YouTube videos or download accessible direct MP4
            files you are authorized to use. Paste a link to get started.
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
              placeholder="Paste a YouTube link or HTTPS MP4 URL"
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
              <span>{busy ? 'Checking...' : 'Get Media'}</span>
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
              aria-label="Media preview and available actions"
            >
              <div className="media-result-heading">
                <div>
                  <div className="section-kicker">
                    {videoData.kind === 'direct-mp4'
                      ? 'DIRECT MP4'
                      : 'YOUTUBE PREVIEW'}
                  </div>

                  <h2>{videoData.title}</h2>

                  <p>
                    {videoData.duration}
                    {videoData.uploader ? ` • By ${videoData.uploader}` : ''}
                  </p>
                </div>

                <span className="source-icon">
                  {videoData.kind === 'direct-mp4' ? (
                    <FileVideo />
                  ) : (
                    <Youtube />
                  )}
                </span>
              </div>

              {videoData.kind === 'direct-mp4' && (
                <>
                  <div className="my-4 overflow-hidden rounded-xl border border-slate-700">
                    <video
                      src={videoData.originalUrl}
                      controls
                      preload="metadata"
                      className="w-full max-h-[420px] bg-black"
                      aria-label={`Preview of ${videoData.title}`}
                    >
                      Your browser does not support HTML video playback.
                    </video>
                  </div>

                  <div className="flex items-center gap-3 my-4 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                    <FileVideo
                      size={22}
                      className="shrink-0 text-amber-400"
                    />
                    <div>
                      <p className="font-semibold text-white">
                        Original MP4 quality
                      </p>
                      <p className="text-sm text-slate-400">
                        The file is provided in its original available quality.
                      </p>
                    </div>
                  </div>

                  <div className="media-result-actions mt-4 flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={downloading}
                      className="gold-btn flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {downloading ? (
                        <span className="spinner" />
                      ) : (
                        <Download size={18} />
                      )}
                      <span>
                        {downloading ? 'Preparing MP4...' : 'Download MP4'}
                      </span>
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Only download content you own or have permission to use.
                    The server must be able to access the supplied file.
                  </p>
                </>
              )}

              {videoData.kind === 'youtube' && (
                <>
                  {videoData.thumbnail && (
                    <div className="my-4 overflow-hidden rounded-xl border border-slate-700 relative">
                      {isPlaying && videoData.videoId ? (
                        <div className="w-full aspect-video bg-black">
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${videoData.videoId}?autoplay=1`}
                            title={videoData.title}
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="relative block w-full group text-left"
                          onClick={() => {
                            if (videoData.videoId) setIsPlaying(true);
                          }}
                          aria-label={`Play preview of ${videoData.title}`}
                          disabled={!videoData.videoId}
                        >
                          <img
                            src={videoData.thumbnail}
                            alt={`Thumbnail for ${videoData.title}`}
                            className="w-full h-64 object-cover"
                            loading="lazy"
                          />

                          <span className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-all">
                            <span className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center text-slate-950 shadow-lg">
                              <Play
                                size={24}
                                className="ml-1 fill-slate-950"
                              />
                            </span>
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="my-4 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck
                        size={22}
                        className="shrink-0 text-amber-400"
                      />
                      <div>
                        <h3 className="font-semibold text-white">
                          YouTube preview ready
                        </h3>
                        <p className="mt-1 text-sm text-slate-300">
                          Play the embedded video here or open it on YouTube.
                          This preview does not provide a YouTube video
                          download.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="media-result-actions mt-4 flex flex-col sm:flex-row items-stretch gap-3">
                    <button
                      type="button"
                      onClick={() => setIsPlaying(true)}
                      disabled={!videoData.videoId || isPlaying}
                      className="gold-btn flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Play size={18} />
                      <span>{isPlaying ? 'Preview Playing' : 'Play Preview'}</span>
                    </button>

                    <a
                      href={
                        videoData.videoId
                          ? `https://www.youtube.com/watch?v=${videoData.videoId}`
                          : videoData.originalUrl
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-3 font-semibold text-white transition hover:border-amber-400 hover:text-amber-300"
                    >
                      <Youtube size={18} />
                      <span>Watch on YouTube</span>
                      <ArrowUpRight size={16} />
                    </a>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    YouTube playback and availability are controlled by
                    YouTube. Use its own download features where available.
                  </p>
                </>
              )}
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
              <Check size={15} /> Honest results
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
              <small>Preview only</small>
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
            YouTube links provide public metadata and an embedded preview.
            Direct HTTPS MP4 files can be downloaded when you own the media or
            have permission to use it and the source allows access.
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
              The server retrieves supported public metadata or checks whether
              a direct MP4 file is accessible for download.
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
            <h3>Preview or download</h3>
            <p>
              Preview supported YouTube videos or download an authorized direct
              MP4 file in its original available quality.
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
          Explore developer portfolio →
        </a>
      </section>
    </>
  );
}
