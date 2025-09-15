import { useState, useEffect, FC } from 'react';
import { isIpfsUri, resolveOracleUrl, getFilename } from '../utils/ipfs';
import { COMMON_HELP_ITEM, COMMON_ICONS } from '../data/galleryConfig';

export interface InfoItem {
  id: string;
  label: string;
  icon: string;
  content?: string;
  link?: string;
}

interface InfoButtonsProps {
  configUrl?: string | null;
}

export const InfoButtons: FC<InfoButtonsProps> = ({ configUrl }) => {
  // ✅ Always declare hooks first
  const [items, setItems] = useState<InfoItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configUrl) return;

    setLoading(true);
    setError(null);

    const fetchUrl = configUrl.startsWith('/') ? configUrl : `/${configUrl}`;

    fetch(fetchUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(cfg => {
        if (!cfg.sidebar?.items) {
          throw new Error(`No sidebar.items in ${fetchUrl}`);
        }
        const bucket = cfg.id;
        // Merge global help item in front; avoid duplicates by id
        const merged = [COMMON_HELP_ITEM, ...cfg.sidebar.items.filter((i: any) => i.id !== 'help-icon')];
        const normalized = merged.map((item: InfoItem) => {
          // Prefer common icons for well-known ids
          let overrideIcon: string | undefined;
          if (item.id === 'help-icon') overrideIcon = COMMON_HELP_ITEM.icon;
          if (item.id === 'info-icon') overrideIcon = COMMON_ICONS.info;
          // Also map by filename for shared assets regardless of id
          const base = item.icon ? getFilename(item.icon) : '';
          if (!overrideIcon) {
            if (base === 'logo_BPA_256px.gif') overrideIcon = COMMON_ICONS.logoBpa;
            else if (base === 'how_to_move.png') overrideIcon = COMMON_HELP_ITEM.icon;
            else if (base === 'info.png') overrideIcon = COMMON_ICONS.info;
          }
          // Fallback: BPA links use shared logo
          if (!overrideIcon && item.link && item.link.includes('bluepointart.uk')) {
            overrideIcon = COMMON_ICONS.logoBpa;
          }

          const nextIcon = overrideIcon
            ? overrideIcon
            : isIpfsUri(item.icon)
            ? resolveOracleUrl(item.icon, bucket)
            : item.icon;
          return { ...item, icon: nextIcon } as InfoItem;
        });
        setItems(normalized);
      })
      .catch(err => {
        console.error('[InfoButtons] error:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [configUrl]);

  // ✅ Conditional rendering can go *after* hook declarations
  if (!configUrl) return null;
  if (loading) return <div className="text-gray-400 p-4">Loading info…</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;

  return (
    <div className="flex flex-col items-center space-y-4 mt-4">
      {items.map(item => (
        <div key={item.id || `${item.label}-${item.icon}`} className="w-[95%]">
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center p-3 rounded-full bg-gray-800 hover:bg-gray-700 transition no-underline"
            >
              <img src={item.icon} alt="" className="h-6 w-6 mr-3 flex-shrink-0" />
              <span className="text-white text-xl">{item.label}</span>
            </a>
          ) : (
            <div>
              <button
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
                className="w-full flex items-center p-3 rounded-full bg-gray-800 hover:bg-gray-700 transition"
              >
                <img src={item.icon} alt="" className="h-6 w-6 mr-3 flex-shrink-0" />
                <span className="text-white text-xl">{item.label}</span>
              </button>
              {openId === item.id && item.content && (
                <div
                  className="mt-2 p-4 bg-gray-800 rounded-lg text-white text-lg font-light"
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
