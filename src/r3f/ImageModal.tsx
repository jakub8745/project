import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PointerPopupPayload } from './PointerInteractions';

interface ImageModalProps {
  entry: PointerPopupPayload;
  onClose: () => void;
}

function resolveMetaValue(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === 'string' ? value : undefined;
}

function resolveImageSrc(meta: Record<string, unknown> | undefined, userData: Record<string, unknown>): string | undefined {
  const metaSrc = resolveMetaValue(meta, 'oracleImagePath') || resolveMetaValue(meta, 'imagePath');
  if (metaSrc) return metaSrc;

  const userImagePath = typeof userData['imagePath'] === 'string' ? (userData['imagePath'] as string) : undefined;
  const userOraclePath =
    typeof userData['oracleImagePath'] === 'string' ? (userData['oracleImagePath'] as string) : undefined;
  const userSrc = userOraclePath || userImagePath;
  if (userSrc) return userSrc;

  const metaImg = meta?.img;
  if (metaImg && typeof (metaImg as { src?: unknown }).src === 'string') {
    return (metaImg as { src: string }).src;
  }

  return undefined;
}

export function ImageModal({ entry, onClose }: ImageModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = entry.meta;
  const rawTitle = (entry.userData && typeof entry.userData['title'] === 'string'
    ? (entry.userData['title'] as string)
    : undefined) || resolveMetaValue(meta, 'title');
  const title = rawTitle || entry.key;
  const author =
    resolveMetaValue(meta, 'author') ||
    (entry.userData && typeof entry.userData['author'] === 'string'
      ? (entry.userData['author'] as string)
      : undefined);
  const description =
    resolveMetaValue(meta, 'description') ||
    (entry.userData && typeof entry.userData['description'] === 'string'
      ? (entry.userData['description'] as string)
      : undefined);

  const imageSrc = resolveImageSrc(meta, entry.userData);

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1 text-sm font-semibold hover:bg-white/30"
          onClick={onClose}
        >
          Close
        </button>
        <div className="flex flex-col gap-6 p-6 md:flex-row">
          {imageSrc ? (
            <div className="flex-shrink-0 self-center overflow-hidden rounded-xl bg-slate-800">
              <img src={imageSrc} alt={title ?? 'Artwork'} className="max-h-[60vh] w-full object-contain" />
            </div>
          ) : null}
          <div className="flex-1 space-y-4 overflow-y-auto">
            <h2 className="text-2xl font-semibold">
              {title}
            </h2>
            {author ? <p className="text-sm uppercase tracking-wide text-slate-300">{author}</p> : null}
            {description ? (
              <div
                className="prose prose-invert max-w-none text-slate-200"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default ImageModal;
