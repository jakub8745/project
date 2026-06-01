import { useState, useEffect, FC } from 'react';
import { createPortal } from 'react-dom';
import { isIpfsUri, resolveOracleUrl, getFilename } from '../utils/ipfs';
import { COMMON_ICONS } from '../data/galleryConfig';
import { normalizeConfigUrl, toSafeExternalUrl } from '../utils/url';
import { sanitizeSidebarHtml } from '../utils/sanitizeHtml';

export interface InfoItem {
  id: string;
  label: string;
  icon: string;
  content?: string;
  link?: string;
  pdfPath?: string;
}

interface InfoButtonsProps {
  configUrl?: string | null;
}

interface SidebarItemConfig {
  id: string;
  label: string;
  icon?: string;
  content?: string;
  link?: string;
  pdfPath?: string;
}

interface ExhibitConfigResponse {
  id?: string;
  sidebar?: {
    items?: SidebarItemConfig[];
  };
}

const sidebarCache = new Map<string, InfoItem[]>();

export const InfoButtons: FC<InfoButtonsProps> = ({ configUrl }) => {
  // ✅ Always declare hooks first
  const [items, setItems] = useState<InfoItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activePdf, setActivePdf] = useState<{ title: string; src: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpenId(null);

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

    fetch(fetchUrl, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(raw => {
        const cfg = raw as ExhibitConfigResponse;
        if (!cfg.sidebar?.items) {
          throw new Error(`No sidebar.items in ${fetchUrl}`);
        }
        const bucket = cfg.id;
        const sidebarItems = cfg.sidebar.items;
        // Keep gallery-specific sidebar items, excluding the global help item
        // because help content is shown in the startup modal.
        const merged: Array<InfoItem | SidebarItemConfig> = sidebarItems.filter((item) => item.id !== 'help-icon');
        const normalized: InfoItem[] = merged.map((item) => {
          const baseIcon = 'icon' in item ? item.icon ?? '' : '';
          const link = 'link' in item ? item.link : undefined;
          const content = 'content' in item ? item.content : undefined;
          const pdfPath = 'pdfPath' in item && typeof item.pdfPath === 'string' ? item.pdfPath : undefined;
          // Prefer common icons for well-known ids
          let overrideIcon: string | undefined;
          if (item.id === 'info-icon') overrideIcon = COMMON_ICONS.info;
          // Also map by filename for shared assets regardless of id
          const base = baseIcon ? getFilename(baseIcon) : '';
          if (!overrideIcon) {
            if (base === 'logo_BPA_256px.gif') overrideIcon = COMMON_ICONS.logoBpa;
            else if (base === 'info.png') overrideIcon = COMMON_ICONS.info;
          }
          // Fallback: BPA links use shared logo
          if (!overrideIcon && link && link.includes('bluepointart.uk')) {
            overrideIcon = COMMON_ICONS.logoBpa;
          }

          const resolvedIcon = overrideIcon
            ? overrideIcon
            : baseIcon && isIpfsUri(baseIcon) && bucket
            ? resolveOracleUrl(baseIcon, bucket)
            : baseIcon;

          return {
            id: item.id,
            label: item.label,
            icon: resolvedIcon || COMMON_ICONS.info,
            content,
            link: toSafeExternalUrl(link) ?? undefined,
            pdfPath,
          };
        });
        const sanitized: InfoItem[] = normalized.map((item) => ({
          ...item,
          content: sanitizeSidebarHtml(item.content)
        }));
        sidebarCache.set(fetchUrl, sanitized);
        if (!controller.signal.aborted) {
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
                      <iframe className="mmodal__pdf" src={activePdf.src} title={activePdf.title} />
                    </div>
                    <div className="mmodal__desc">
                      <h3>{activePdf.title}</h3>
                      <p>
                        <a href={activePdf.src} target="_blank" rel="noreferrer noopener">Open PDF in new tab</a>
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
              <img src={item.icon} alt="" className="h-6 w-6 mr-3 flex-shrink-0" />
              <span className="text-white text-xl">{item.label}</span>
            </a>
          ) : (
            <div>
              <button
                onClick={() => {
                  if (item.pdfPath) {
                    setActivePdf({ title: item.label || 'PDF document', src: item.pdfPath });
                    return;
                  }
                  setOpenId(openId === item.id ? null : item.id);
                }}
                className="w-full flex items-center p-3 rounded-full bg-transparent hover:bg-white/10 border border-white/30 transition"
              >
                <img src={item.icon} alt="" className="h-6 w-6 mr-3 flex-shrink-0" />
                <span className="text-white text-xl">{item.label}</span>
              </button>
              {openId === item.id && item.content && (
                <div
                  className="mt-2 p-4 bg-white/10 border border-white/20 rounded-lg text-white text-lg font-light shadow-sm"
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
              )}
            </div>
          )}
        </div>
      ))}
      {pdfModal}
    </div>
  );
};
