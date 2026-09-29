import type { InfoItem } from '../config/contextualActions';
import { useState, useEffect, FC } from 'react';
import { createPortal } from 'react-dom';
import { InlineFormattedText } from './InlineFormattedText';

const FallbackImage: FC<{ sources: string[]; alt: string; className: string }> = ({ sources, alt, className }) => {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setIndex(0); setFailed(false); }, [sources]);
  if (!sources.length || failed) return null;
  return <img
    src={sources[Math.min(index, sources.length - 1)]}
    alt={alt}
    className={className}
    onError={() => {
      if (index < sources.length - 1) setIndex(index + 1);
      else setFailed(true);
    }}
  />;
};

interface InfoButtonsProps {
  items: InfoItem[];
  compact?: boolean;
  viewerToolbar?: boolean;
}

export const InfoButtons: FC<InfoButtonsProps> = ({ items, compact = false, viewerToolbar = false }) => {
  // ✅ Always declare hooks first
  const [openId, setOpenId] = useState<string | null>(null);
  const [activePdf, setActivePdf] = useState<{ title: string; sources: string[]; index: number; openLabel?: string; failed?: boolean } | null>(null);
  const [activeVideo, setActiveVideo] = useState<{ title: string; sources: string[]; index: number; type?: string; posterSources: string[]; failed?: boolean } | null>(null);
  const [activeVideoPoster, setActiveVideoPoster] = useState<string | undefined>();

  useEffect(() => {
    if (typeof window === 'undefined' || !activeVideo?.posterSources.length) {
      setActiveVideoPoster(undefined);
      return undefined;
    }
    let cancelled = false;
    let index = 0;
    const tryPoster = () => {
      if (cancelled || index >= activeVideo.posterSources.length) return;
      const source = activeVideo.posterSources[index++];
      const probe = new Image();
      probe.onload = () => { if (!cancelled) setActiveVideoPoster(source); };
      probe.onerror = tryPoster;
      probe.src = source;
    };
    setActiveVideoPoster(undefined);
    tryPoster();
    return () => { cancelled = true; };
  }, [activeVideo?.posterSources]);

  useEffect(() => {
    setOpenId(null);
    setActivePdf(null);
    setActiveVideo(null);
  }, [items]);

  useEffect(() => {
    if (typeof window === 'undefined' || !activeVideo) return undefined;
    window.dispatchEvent(new CustomEvent('video-player-modal-state', { detail: { open: true } }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveVideo(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.dispatchEvent(new CustomEvent('video-player-modal-state', { detail: { open: false } }));
    };
  }, [activeVideo]);

  // ✅ Conditional rendering can go *after* hook declarations

  const pdfModal =
    activePdf && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="mmodal mmodal--active mmodal--align-top mmodal__bg"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setActivePdf(null);
              }
            }}
          >
            <div className="mmodal__shell">
              <button className="mmodal__close" onClick={() => setActivePdf(null)} aria-label="Close modal">×</button>
              <div className="mmodal__panel">
                <div className="mmodal__content mmodal__content--active">
                  <div className="mmodal__body mmodal__body--col">
                    <div className="mmodal__image-wrap">
                      {activePdf.failed ? (
                        <p role="alert" className="p-4 text-red-600">Could not load this document from the configured sources.</p>
                      ) : (
                        <iframe
                          key={activePdf.sources[activePdf.index]}
                          className="mmodal__pdf"
                          src={activePdf.sources[activePdf.index]}
                          title={activePdf.title}
                          onError={() => setActivePdf((current) => {
                            if (!current || current.index >= current.sources.length - 1) return current ? { ...current, failed: true } : current;
                            return { ...current, index: current.index + 1 };
                          })}
                        />
                      )}
                    </div>
                    <div className="mmodal__desc">
                      <h3>{activePdf.title}</h3>
                      <p>
                        <a href={activePdf.sources[activePdf.index]} target="_blank" rel="noreferrer noopener">
                          <InlineFormattedText text={activePdf.openLabel ?? 'Open PDF in new tab'} />
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const videoModal =
    activeVideo && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="video-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={activeVideo.title}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setActiveVideo(null);
              }
            }}
          >
            <div className="video-modal">
              <button className="video-modal__close" onClick={() => setActiveVideo(null)} type="button" aria-label="Close video">×</button>
              {activeVideo.failed ? (
                <p role="alert" className="p-4 text-white">Could not load this video from the configured sources.</p>
              ) : (
                <video
                  key={activeVideo.sources[activeVideo.index]}
                  className="video-modal__video"
                  controls
                  autoPlay
                  playsInline
                  poster={activeVideoPoster}
                  src={activeVideo.sources[activeVideo.index]}
                  onError={() => setActiveVideo((current) => {
                    if (!current || current.index >= current.sources.length - 1) return current ? { ...current, failed: true } : current;
                    return { ...current, index: current.index + 1 };
                  })}
                />
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={compact
      ? 'flex flex-wrap items-center justify-center gap-2'
      : 'flex flex-col items-center space-y-4 mt-4'}>
      {items.map(item => (
        <div key={item.id || `${item.label}-${item.icon}`} className={compact ? 'pointer-events-auto min-w-0 max-w-full' : 'w-[95%]'}>
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.label}
              className={compact
                ? 'flex max-w-full items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 text-sm transition hover:bg-white/10 no-underline'
                : 'w-full flex items-center p-3 rounded-full bg-transparent hover:bg-white/10 border border-white/30 transition no-underline'}
              title={item.label}
            >
              <FallbackImage sources={item.iconCandidates ?? [item.icon]} alt="" className={compact ? 'h-4 w-4 flex-shrink-0' : 'h-6 w-6 mr-3 flex-shrink-0'} />
              <span className={compact
                ? `${viewerToolbar ? 'hidden sm:inline' : 'inline'} max-w-40 truncate text-white`
                : 'text-white text-xl'}>{item.label}</span>
            </a>
          ) : (
            <div>
              <button
                onClick={() => {
                  if (item.pdfCandidates?.length || item.pdfPath) {
                    setActivePdf({ title: item.label || 'PDF document', sources: item.pdfCandidates?.length ? item.pdfCandidates : [item.pdfPath!], index: 0, openLabel: item.pdfOpenLabel });
                    return;
                  }
                  if (item.videoCandidates?.length || item.videoPath) {
                    setActiveVideo({
                      title: item.label || 'Video',
                      sources: item.videoCandidates?.length ? item.videoCandidates : [item.videoPath!],
                      index: 0,
                      type: item.videoType,
                      posterSources: item.videoPosterCandidates?.length ? item.videoPosterCandidates : item.videoPoster ? [item.videoPoster] : []
                    });
                    return;
                  }
                  setOpenId(openId === item.id ? null : item.id);
                }}
                aria-label={compact && item.id === 'info-icon' ? 'About' : item.label}
                className={compact
                  ? 'flex max-w-full items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 text-sm transition hover:bg-white/10'
                  : 'w-full flex items-center p-3 rounded-full bg-transparent hover:bg-white/10 border border-white/30 transition'}
                title={item.label}
              >
                <FallbackImage sources={item.iconCandidates ?? [item.icon]} alt="" className={compact ? 'h-4 w-4 flex-shrink-0' : 'h-6 w-6 mr-3 flex-shrink-0'} />
                <span className={compact
                  ? `${viewerToolbar ? 'hidden sm:inline' : 'inline'} max-w-40 truncate text-white`
                  : 'text-white text-xl'}>{compact && item.id === 'info-icon' ? 'About' : item.label}</span>
              </button>
              {openId === item.id && item.content && (
                <div
                  className={`mt-2 p-4 bg-white/10 border border-white/20 rounded-lg text-white ${compact ? 'w-[min(24rem,calc(100vw-5rem))] max-h-[35vh] overflow-y-auto text-sm' : 'text-lg'} font-light shadow-sm [&_a]:text-cyan-100 [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-cyan-200/80 hover:[&_a]:text-white`}
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
              )}
            </div>
          )}
        </div>
      ))}
      {pdfModal}
      {videoModal}
    </div>
  );
};
