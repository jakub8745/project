import { fetchManifest } from '../config/manifestRepository';
import { normalizeManifestShape } from '../config/manifestShape';
import { resolveRuntimeAssetCandidates } from '../config/assetResolution';
import { useState, useEffect, FC } from 'react';
import { createPortal } from 'react-dom';
import { isIpfsUri, getFilename } from '../utils/ipfs';
import { COMMON_ICONS } from '../data/galleryConfig';
import { normalizeConfigUrl, toSafeExternalUrl } from '../utils/url';
import { sanitizeSidebarHtml } from '../utils/sanitizeHtml';
import { InlineFormattedText } from './InlineFormattedText';

export interface InfoItem {
  id: string;
  label: string;
  icon: string;
  content?: string;
  link?: string;
  pdfPath?: string;
  pdfOpenLabel?: string;
  videoPath?: string;
  videoType?: string;
  videoPoster?: string;
  iconCandidates?: string[];
  pdfCandidates?: string[];
  videoCandidates?: string[];
  videoPosterCandidates?: string[];
}

interface InfoButtonsProps {
  configUrl?: string | null;
}

interface SidebarItemConfig {
  id: string;
  label: string;
  icon?: string;
  iconAsset?: string;
  target?: string;
  contentMedia?: string;
  content?: string;
  link?: string;
  pdfPath?: string;
  pdfOpenLabel?: string;
  openLabel?: string;
  videoPath?: string;
  videoType?: string;
  videoPoster?: string;
}

interface ExhibitConfigResponse {
  id?: string;
  metadata?: {
    description?: string;
  };
  assets?: Record<string, { uri?: string; sourceUri?: string; ipfsUri?: string | null; fallbackUris?: string[]; mimeType?: string }>;
  media?: Record<string, {
    kind?: string;
    description?: string;
    text?: string;
    document?: { asset?: string; uri?: string } | string;
    openUri?: string;
    openLabel?: string;
    sources?: Array<{ asset?: string }>;
    poster?: { asset?: string };
  }>;
  sidebar?: {
    items?: SidebarItemConfig[];
  };
}

const sidebarCache = new Map<string, InfoItem[]>();

function normalizePublicAssetUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('public/')) {
    return `/${trimmed.slice('public/'.length)}`;
  }
  if (isIpfsUri(trimmed)) return resolveRuntimeAssetCandidates({ sourceUri: trimmed })[0];
  return normalizeConfigUrl(trimmed);
}

function normalizePublicAssetCandidates(candidates: string[]): string[] {
  return [...new Set(candidates.map((candidate) => normalizePublicAssetUrl(candidate)).filter((url): url is string => Boolean(url)))];
}

function resolvePublicUriCandidates(uri: string | undefined): string[] {
  if (!uri) return [];
  return normalizePublicAssetCandidates(resolveRuntimeAssetCandidates({ sourceUri: uri }));
}

function resolveConfigAssetCandidates(cfg: ExhibitConfigResponse, assetId: string | undefined): string[] {
  if (!assetId) return [];
  return normalizePublicAssetCandidates(resolveRuntimeAssetCandidates(cfg.assets?.[assetId]));
}

function resolveSidebarMediaContent(cfg: ExhibitConfigResponse, mediaId: string | undefined): string | undefined {
  if (!mediaId) return undefined;
  const media = cfg.media?.[mediaId];
  if (!media) return undefined;
  if (media.kind === 'text') return media.text;
  return media.description;
}

function resolveSidebarDocumentPaths(cfg: ExhibitConfigResponse, mediaId: string | undefined): string[] {
  if (!mediaId) return [];
  const media = cfg.media?.[mediaId];
  if (!media || media.kind !== 'document') return [];
  const document = media.document;
  if (!document) return [];
  if (typeof document === 'string') return resolvePublicUriCandidates(document);
  if (document.asset) return resolveConfigAssetCandidates(cfg, document.asset);
  return resolvePublicUriCandidates(document.uri);
}

function resolveSidebarVideoPaths(cfg: ExhibitConfigResponse, mediaId: string | undefined): string[] {
  if (!mediaId) return [];
  const media = cfg.media?.[mediaId];
  if (!media || media.kind !== 'video') return [];
  return resolveConfigAssetCandidates(cfg, media.sources?.[0]?.asset);
}

function resolveSidebarPosterPaths(cfg: ExhibitConfigResponse, mediaId: string | undefined): string[] {
  if (!mediaId) return [];
  const media = cfg.media?.[mediaId];
  if (!media || media.kind !== 'video') return [];
  return resolveConfigAssetCandidates(cfg, media.poster?.asset);
}

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

export const InfoButtons: FC<InfoButtonsProps> = ({ configUrl }) => {
  // ✅ Always declare hooks first
  const [items, setItems] = useState<InfoItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activePdf, setActivePdf] = useState<{ title: string; sources: string[]; index: number; openLabel?: string; failed?: boolean } | null>(null);
  const [activeVideo, setActiveVideo] = useState<{ title: string; sources: string[]; index: number; type?: string; posterSources: string[]; failed?: boolean } | null>(null);
  const [activeVideoPoster, setActiveVideoPoster] = useState<string | undefined>();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

    if (!configUrl) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchUrl = normalizeConfigUrl(configUrl);
    const cached = sidebarCache.get(fetchUrl);
    if (cached) {
      setItems(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchManifest(fetchUrl, controller.signal)
      .then(raw => {
        const cfg = normalizeManifestShape(raw) as ExhibitConfigResponse;
        if (!cfg.sidebar?.items) {
          throw new Error(`No sidebar.items in ${fetchUrl}`);
        }
        const sidebarItems = cfg.sidebar.items;
        // Keep gallery-specific sidebar items, excluding the global help item
        // because help content is shown in the startup modal.
        const merged: Array<InfoItem | SidebarItemConfig> = sidebarItems.filter((item) => item.id !== 'help-icon');
        const normalized: InfoItem[] = merged.map((item) => {
          const mediaId =
            'contentMedia' in item && typeof item.contentMedia === 'string'
              ? item.contentMedia
              : 'target' in item && typeof item.target === 'string'
                ? item.target
                : undefined;
          const iconFromAssetCandidates =
            'iconAsset' in item && typeof item.iconAsset === 'string'
              ? resolveConfigAssetCandidates(cfg, item.iconAsset)
              : [];
          const baseIconCandidates = 'icon' in item && typeof item.icon === 'string'
            ? resolvePublicUriCandidates(item.icon)
            : iconFromAssetCandidates;
          const baseIcon = baseIconCandidates[0] ?? '';
          const link = 'link' in item ? item.link : undefined;
          const content =
            'content' in item && typeof item.content === 'string'
              ? item.content
              : resolveSidebarMediaContent(cfg, mediaId) ??
                (item.id === 'info-icon' ? cfg.metadata?.description : undefined);
          const pdfCandidates = 'pdfPath' in item && typeof item.pdfPath === 'string'
            ? resolvePublicUriCandidates(item.pdfPath)
            : resolveSidebarDocumentPaths(cfg, mediaId);
          const videoCandidates = 'videoPath' in item && typeof item.videoPath === 'string'
            ? resolvePublicUriCandidates(item.videoPath)
            : resolveSidebarVideoPaths(cfg, mediaId);
          const videoType = 'videoType' in item && typeof item.videoType === 'string' ? item.videoType : undefined;
          const videoPosterCandidates = 'videoPoster' in item && typeof item.videoPoster === 'string'
            ? resolvePublicUriCandidates(item.videoPoster)
            : resolveSidebarPosterPaths(cfg, mediaId);
          const pdfOpenLabel =
            'pdfOpenLabel' in item && typeof item.pdfOpenLabel === 'string'
              ? item.pdfOpenLabel
              : 'openLabel' in item && typeof item.openLabel === 'string'
                ? item.openLabel
                : mediaId && cfg.media?.[mediaId]?.openLabel
                  ? cfg.media[mediaId].openLabel
                : undefined;
          // Prefer common icons for well-known ids
          let overrideIcon: string | undefined;
          if (item.id === 'info-icon') overrideIcon = COMMON_ICONS.info;
          // Also map by filename for shared assets regardless of id
          const resolvedBaseIcon = normalizePublicAssetUrl(baseIcon);
          const base = resolvedBaseIcon ? getFilename(resolvedBaseIcon) : '';
          if (!overrideIcon) {
            if (base === 'logo_BPA_256px.gif') overrideIcon = COMMON_ICONS.logoBpa;
            else if (base === 'info.png') overrideIcon = COMMON_ICONS.info;
          }
          // Fallback: BPA links use shared logo
          if (!overrideIcon && link && link.includes('bluepointart.uk')) {
            overrideIcon = COMMON_ICONS.logoBpa;
          }

          const resolvedIconCandidates = overrideIcon ? [overrideIcon] : baseIconCandidates;
          const resolvedIcon = resolvedIconCandidates[0] || resolvedBaseIcon;

          return {
            id: item.id,
            label: item.label,
            icon: resolvedIcon || COMMON_ICONS.info,
            iconCandidates: resolvedIconCandidates.length ? resolvedIconCandidates : [COMMON_ICONS.info],
            content,
            link: toSafeExternalUrl(link) ?? undefined,
            pdfPath: pdfCandidates[0],
            pdfCandidates,
            pdfOpenLabel,
            videoPath: videoCandidates[0],
            videoCandidates,
            videoType,
            videoPoster: videoPosterCandidates[0],
            videoPosterCandidates
          };
        });
        const sanitized: InfoItem[] = normalized.map((item) => ({
          ...item,
          content: sanitizeSidebarHtml(item.content)
        }));
        if (!controller.signal.aborted) {
          sidebarCache.set(fetchUrl, sanitized);
          setItems(sanitized);
        }
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error('[InfoButtons] error:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [configUrl]);

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
  if (!configUrl) return null;
  if (loading) return <div className="text-slate-400 p-4">Loading info…</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;

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
    <div className="flex flex-col items-center space-y-4 mt-4">
      {items.map(item => (
        <div key={item.id || `${item.label}-${item.icon}`} className="w-[95%]">
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center p-3 rounded-full bg-transparent hover:bg-white/10 border border-white/30 transition no-underline"
            >
              <FallbackImage sources={item.iconCandidates ?? [item.icon]} alt="" className="h-6 w-6 mr-3 flex-shrink-0" />
              <span className="text-white text-xl">{item.label}</span>
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
                className="w-full flex items-center p-3 rounded-full bg-transparent hover:bg-white/10 border border-white/30 transition"
              >
                <FallbackImage sources={item.iconCandidates ?? [item.icon]} alt="" className="h-6 w-6 mr-3 flex-shrink-0" />
                <span className="text-white text-xl">{item.label}</span>
              </button>
              {openId === item.id && item.content && (
                <div
                  className="mt-2 p-4 bg-white/10 border border-white/20 rounded-lg text-white text-lg font-light shadow-sm [&_a]:text-cyan-100 [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-cyan-200/80 hover:[&_a]:text-white"
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
