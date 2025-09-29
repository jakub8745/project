import { Modal } from 'react-bootstrap';
import type { PointerPopupPayload } from './PointerInteractions';

interface ImageModalProps {
  show: boolean;
  entry: PointerPopupPayload | null;
  onHide: () => void;
}

function resolveString(source: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function resolveImageSrc(entry: PointerPopupPayload | null): string | undefined {
  if (!entry) return undefined;
  const fromMeta =
    resolveString(entry.meta, 'oracleImagePath') ||
    resolveString(entry.meta, 'imagePath') ||
    resolveString(entry.meta, 'url');
  if (fromMeta) return fromMeta;

  const fromUserData =
    resolveString(entry.userData, 'oracleImagePath') ||
    resolveString(entry.userData, 'imagePath') ||
    resolveString(entry.userData, 'url');
  if (fromUserData) return fromUserData;

  const metaImg = entry.meta?.img;
  if (metaImg && typeof metaImg === 'object') {
    const src = (metaImg as Record<string, unknown>).src;
    if (typeof src === 'string' && src.trim()) return src;
  }

  const userImg = entry.userData?.img;
  if (userImg && typeof userImg === 'object') {
    const src = (userImg as Record<string, unknown>).src;
    if (typeof src === 'string' && src.trim()) return src;
  }

  return undefined;
}

function resolveTitle(entry: PointerPopupPayload | null): string {
  if (!entry) return '';
  return (
    resolveString(entry.meta, 'title') ||
    resolveString(entry.userData, 'title') ||
    resolveString(entry.userData, 'name') ||
    entry.key
  );
}

function resolveAuthor(entry: PointerPopupPayload | null): string | undefined {
  if (!entry) return undefined;
  return resolveString(entry.meta, 'author') || resolveString(entry.userData, 'author');
}

function resolveDescription(entry: PointerPopupPayload | null): string | undefined {
  if (!entry) return undefined;
  return (
    resolveString(entry.meta, 'description') ||
    resolveString(entry.userData, 'description') ||
    resolveString(entry.userData, 'content')
  );
}

export function ImageModal({ show, entry, onHide }: ImageModalProps) {
  const imageSrc = resolveImageSrc(entry);
  const title = resolveTitle(entry);
  const author = resolveAuthor(entry);
  const description = resolveDescription(entry);

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      size="sm"
      aria-labelledby="image-modal-title"
      backdrop="static"
    >
      <Modal.Header closeButton>
        <Modal.Title id="image-modal-title">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {imageSrc ? (
          <img src={imageSrc} alt={title} className="img-fluid w-100 mb-3 rounded" />
        ) : null}
        {author ? <p className="text-muted mb-2">{author}</p> : null}
        {description ? (
          <div
            className="text-body-secondary"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        ) : null}
      </Modal.Body>
    </Modal>
  );
}

export default ImageModal;
