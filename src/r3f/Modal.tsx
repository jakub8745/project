import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { MaterialModalContext, type MaterialModalContextValue } from './materialModalContext';

const ipfsGateways = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/'
];

export type ModalImageMeta = {
  title: string;
  description?: string;
  author?: string;
  img?: { src: string };
  imagePath?: string;
  oracleImagePath?: string;
  ipfsImagePath?: string;
  pdfPath?: string;
  pdfOpenPath?: string;
  pdfExternalUrl?: string;
  oraclePdfPath?: string;
  ipfsPdfPath?: string;
};

export type ModalImageMap = Record<string, ModalImageMeta>;

export type ModalOpenPayload = Record<string, unknown> & { name?: string };

type ModalState = {
  isOpen: boolean;
  name: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  mediaType: 'image' | 'pdf' | null;
  imageSrc: string | null;
  pdfSrc: string | null;
  pdfOpenSrc: string | null;
  pdfEmbedBlocked: boolean;
  pendingSources: string[];
  contentWidth: number | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string | null;
};

type MaterialModalProviderProps = {
  children: ReactNode;
  initialImages?: ModalImageMap;
};

const defaultState = (): ModalState => ({
  isOpen: false,
  name: null,
  title: null,
  description: null,
  author: null,
  mediaType: null,
  imageSrc: null,
  pdfSrc: null,
  pdfOpenSrc: null,
  pdfEmbedBlocked: false,
  pendingSources: [],
  contentWidth: null,
  status: 'idle',
  message: null
});

function ipfsToGateway(ipfsUrl: string, gatewayIndex: number) {
  const cid = ipfsUrl.replace(/^ipfs:\/\//, '');
  const gateway = ipfsGateways[gatewayIndex] ?? ipfsGateways[0];
  return `${gateway}${cid}`;
}

function isZenodoUrl(url: string) {
  try {
    return new URL(url, window.location.origin).hostname === 'zenodo.org';
  } catch {
    return false;
  }
}

function dispatchMaterialModalState(open: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('material-modal-state', {
      detail: { open }
    })
  );
}

export function MaterialModalProvider({ children, initialImages }: MaterialModalProviderProps) {
  const [images, setImagesState] = useState<ModalImageMap | undefined>(initialImages);
  const [state, setState] = useState<ModalState>(() => defaultState());
  const imageCache = useRef(new Map<string, string>());
  const activeNameRef = useRef<string | null>(null);
  const imageWidthsRef = useRef(new Map<string, number>());
  const modalRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pdfLoadTimeoutRef = useRef<number | null>(null);

  const setImages = useCallback((map: ModalImageMap | undefined) => {
    setImagesState(map);
    if (!map) {
      imageCache.current.clear();
      return;
    }
    const valid = new Set(Object.keys(map));
    for (const key of imageCache.current.keys()) {
      if (!valid.has(key)) {
        imageCache.current.delete(key);
      }
    }
  }, []);

  useEffect(() => {
    if (initialImages !== undefined) {
      setImages(initialImages);
    }
  }, [initialImages, setImages]);

  const syncModalWidth = useCallback(() => {
    if (!state.isOpen) return;
    const contentEl = contentRef.current;
    const imgEl = imgRef.current;
    if (!contentEl || !imgEl) return;
    if (!imgEl.complete || imgEl.naturalWidth === 0) return;
    const rect = imgEl.getBoundingClientRect();
    if (rect.width === 0) return;
    const width = Math.round(rect.width + 20);
    const currentName = activeNameRef.current;
    if (currentName && width > 0) {
      imageWidthsRef.current.set(currentName, width);
    }
    if (contentEl.style.width !== `${width}px`) {
      contentEl.style.width = `${width}px`;
    }
    if (currentName && width > 0) {
      setState((prev) => {
        if (prev.name !== currentName || prev.contentWidth === width) return prev;
        return {
          ...prev,
          contentWidth: width
        };
      });
    }
  }, [state.isOpen]);

  useEffect(() => {
    if (!state.isOpen) return;
    const resizeHandler = () => syncModalWidth();
    window.addEventListener('resize', resizeHandler, { passive: true });
    return () => window.removeEventListener('resize', resizeHandler);
  }, [state.isOpen, syncModalWidth]);

  const hideModal = useCallback(() => {
    activeNameRef.current = null;
    if (pdfLoadTimeoutRef.current !== null) {
      window.clearTimeout(pdfLoadTimeoutRef.current);
      pdfLoadTimeoutRef.current = null;
    }
    if (contentRef.current) {
      contentRef.current.style.width = '';
    }
    dispatchMaterialModalState(false);
    setState(() => defaultState());
  }, []);

  useEffect(() => {
    return () => {
      dispatchMaterialModalState(false);
    };
  }, []);

  useEffect(() => {
    if (!state.isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hideModal, state.isOpen]);

  useEffect(() => {
    if (!state.isOpen) return;
    const frame = window.requestAnimationFrame(() => syncModalWidth());
    return () => window.cancelAnimationFrame(frame);
  }, [state.isOpen, state.imageSrc, syncModalWidth]);

  useEffect(() => {
    if (pdfLoadTimeoutRef.current !== null) {
      window.clearTimeout(pdfLoadTimeoutRef.current);
      pdfLoadTimeoutRef.current = null;
    }

    if (!state.isOpen || state.mediaType !== 'pdf' || !state.pdfSrc || state.pdfEmbedBlocked || isZenodoUrl(state.pdfSrc)) {
      return undefined;
    }

    pdfLoadTimeoutRef.current = window.setTimeout(() => {
      setState((prev) => {
        if (!prev.isOpen || prev.mediaType !== 'pdf' || prev.pdfEmbedBlocked) return prev;
        return {
          ...prev,
          pdfEmbedBlocked: true,
          message: 'This PDF could not be embedded here. Open it in a new tab.'
        };
      });
      pdfLoadTimeoutRef.current = null;
    }, 4000);

    return () => {
      if (pdfLoadTimeoutRef.current !== null) {
        window.clearTimeout(pdfLoadTimeoutRef.current);
        pdfLoadTimeoutRef.current = null;
      }
    };
  }, [state.isOpen, state.mediaType, state.pdfSrc, state.pdfEmbedBlocked]);

  const showModal = useCallback((payload: ModalOpenPayload) => {
    const name = typeof payload?.name === 'string' ? payload.name : undefined;
    if (!name) return;
    const meta = images?.[name];
    if (!meta) return;

    activeNameRef.current = name;

    const pdfDirectUrl = meta.pdfPath ?? meta.oraclePdfPath ?? undefined;
    const pdfOpenUrl = meta.pdfOpenPath ?? meta.pdfExternalUrl ?? undefined;
    const pdfIpfsUrl = meta.ipfsPdfPath ?? (pdfDirectUrl?.startsWith('ipfs://') ? pdfDirectUrl : undefined);
    const hasPdf = Boolean(pdfDirectUrl || pdfIpfsUrl);

    const cachedSrc = hasPdf ? null : (imageCache.current.get(name) ?? meta.img?.src ?? null);
    if (cachedSrc) {
      imageCache.current.set(name, cachedSrc);
    }

    const storedWidth = imageWidthsRef.current.get(name) ?? null;
    const fallbackWidth = typeof window !== 'undefined'
      ? Math.round(Math.min(window.innerWidth * 0.6, window.innerHeight * 0.6, 480))
      : 480;
    const initialWidth = storedWidth ?? fallbackWidth;
    const sources: string[] = [];
    const addSource = (src?: string | null) => {
      if (!src) return;
      if (sources.includes(src)) return;
      sources.push(src);
    };

    if (hasPdf) {
      if (pdfDirectUrl && !pdfDirectUrl.startsWith('ipfs://')) {
        addSource(pdfDirectUrl);
      }

      if (meta.oraclePdfPath && !meta.oraclePdfPath.startsWith('ipfs://')) {
        addSource(meta.oraclePdfPath);
      }

      if (pdfIpfsUrl) {
        for (let i = 0; i < ipfsGateways.length; i += 1) {
          addSource(ipfsToGateway(pdfIpfsUrl, i));
        }
      }

      if (pdfDirectUrl && pdfDirectUrl.startsWith('ipfs://')) {
        addSource(pdfDirectUrl);
      }
    } else {
      addSource(cachedSrc);

      const directUrl = meta.imagePath ?? meta.oracleImagePath ?? undefined;
      if (directUrl && !directUrl.startsWith('ipfs://')) {
        addSource(directUrl);
      }

      if (meta.oracleImagePath && !meta.oracleImagePath.startsWith('ipfs://')) {
        addSource(meta.oracleImagePath);
      }

      const ipfsUrl = meta.ipfsImagePath ?? (directUrl?.startsWith('ipfs://') ? directUrl : undefined);
      if (ipfsUrl) {
        for (let i = 0; i < ipfsGateways.length; i += 1) {
          addSource(ipfsToGateway(ipfsUrl, i));
        }
      }

      if (directUrl && directUrl.startsWith('ipfs://')) {
        // Ensure we try the raw ipfs URI last in case a gateway handler exists
        addSource(directUrl);
      }
    }

    const [initialSource, ...nextSources] = sources;
    const isCached = Boolean(cachedSrc && cachedSrc === initialSource);
    const hasSource = Boolean(initialSource);
    const mediaType = hasPdf ? 'pdf' : 'image';
    const isZenodoPdf = mediaType === 'pdf' && Boolean(initialSource && isZenodoUrl(initialSource));
    const pdfWidth = typeof window !== 'undefined'
      ? Math.round(Math.min(window.innerWidth - 20, 960))
      : 960;

    setState({
      isOpen: true,
      name,
      title: meta.title,
      description: meta.description ?? null,
      author: meta.author ?? null,
      mediaType,
      imageSrc: mediaType === 'image' ? initialSource ?? null : null,
      pdfSrc: mediaType === 'pdf' ? initialSource ?? null : null,
      pdfOpenSrc: mediaType === 'pdf' ? pdfOpenUrl ?? initialSource ?? null : null,
      pdfEmbedBlocked: isZenodoPdf,
      pendingSources: nextSources,
      contentWidth: mediaType === 'pdf' ? pdfWidth : initialWidth,
      status: mediaType === 'pdf' ? (hasSource ? 'ready' : 'error') : (isCached ? 'ready' : hasSource ? 'loading' : 'error'),
      message: !hasSource
        ? `⚠️ Could not load ${mediaType === 'pdf' ? 'PDF' : 'image'}.`
        : isZenodoPdf
          ? 'This Zenodo PDF cannot be embedded here. Open it in a new tab.'
          : isCached || mediaType === 'pdf'
            ? null
            : 'Loading image…'
    });
    dispatchMaterialModalState(true);

    window.requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.style.width = `${mediaType === 'pdf' ? pdfWidth : initialWidth}px`;
      }
      syncModalWidth();
    });
  }, [images, syncModalWidth]);

  const handleBackdropClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target === modalRef.current) {
      hideModal();
    }
  }, [hideModal]);

  const contextValue = useMemo<MaterialModalContextValue>(
    () => ({ setImages, showModal, hideModal }),
    [hideModal, setImages, showModal]
  );

  useEffect(() => {
    if (state.status === 'ready') {
      const frame = window.requestAnimationFrame(() => syncModalWidth());
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [state.status, syncModalWidth]);

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const currentName = activeNameRef.current;
      if (!currentName) return;
      const currentSrc = event.currentTarget.currentSrc || event.currentTarget.src;
      if (!currentSrc) return;
      imageCache.current.set(currentName, currentSrc);
      const rawWidth = Math.round(event.currentTarget.getBoundingClientRect().width || event.currentTarget.naturalWidth || 0);
      const paddedWidth = rawWidth > 0 ? rawWidth + 20 : 0;
      if (paddedWidth > 0) {
        imageWidthsRef.current.set(currentName, paddedWidth);
      }
      setState((prev) => {
        if (prev.name !== currentName) return prev;
        return {
          ...prev,
          imageSrc: currentSrc,
          pendingSources: [],
          contentWidth: paddedWidth || prev.contentWidth,
          status: 'ready',
          message: null
        };
      });
      setImagesState((prev) => {
        if (!prev) return prev;
        const existing = prev[currentName];
        if (!existing) return prev;
        if (existing.img?.src === currentSrc) return prev;
        return {
          ...prev,
          [currentName]: {
            ...existing,
            img: { src: currentSrc }
          }
        };
      });
      window.requestAnimationFrame(() => syncModalWidth());
    },
    [setImagesState, syncModalWidth]
  );

  const handleImageError = useCallback(() => {
    const currentName = activeNameRef.current;
    if (!currentName) return;
    setState((prev) => {
      if (prev.name !== currentName) return prev;
      if (prev.pendingSources.length > 0) {
        const [nextSource, ...rest] = prev.pendingSources;
        return {
          ...prev,
          imageSrc: prev.mediaType === 'image' ? nextSource : prev.imageSrc,
          pdfSrc: prev.mediaType === 'pdf' ? nextSource : prev.pdfSrc,
          pendingSources: rest,
          status: prev.mediaType === 'pdf' ? 'ready' : 'loading',
          message: prev.mediaType === 'pdf' ? null : 'Loading image…'
        };
      }
      return {
        ...prev,
        status: 'error',
        message: `⚠️ Could not load ${prev.mediaType === 'pdf' ? 'PDF' : 'image'}.`
      };
    });
  }, []);

  const handlePdfLoad = useCallback(() => {
    if (pdfLoadTimeoutRef.current !== null) {
      window.clearTimeout(pdfLoadTimeoutRef.current);
      pdfLoadTimeoutRef.current = null;
    }
    setState((prev) => {
      if (prev.mediaType !== 'pdf' || prev.pdfEmbedBlocked) return prev;
      if (prev.message === null) return prev;
      return {
        ...prev,
        message: null
      };
    });
  }, []);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  return (
    <MaterialModalContext.Provider value={contextValue}>
      {children}
      {portalTarget
        ? createPortal(
            <div
              aria-hidden={state.isOpen ? 'false' : 'true'}
              aria-modal="true"
              className={`mmodal mmodal__bg${state.isOpen ? ' mmodal--active' : ''}`}
              id="r3f-art-modal"
              onMouseDown={handleBackdropClick}
              ref={modalRef}
              role="dialog"
            >
              <div className="mmodal__dialog">
                <div
                  className={`mmodal__content${state.isOpen ? ' mmodal__content--active' : ''}`}
                  ref={contentRef}
                  style={state.contentWidth ? { width: `${state.contentWidth}px` } : undefined}
                >
                  <button className="mmodal__close" onClick={hideModal} type="button" aria-label="Close modal">
                    ×
                  </button>
                  <div className="mmodal__body">
                    <div className="mmodal__image-wrap">
                      {state.mediaType === 'pdf' ? (
                        state.pdfSrc && !state.pdfEmbedBlocked && !isZenodoUrl(state.pdfSrc) ? (
                          <iframe
                            className="mmodal__pdf"
                            src={state.pdfSrc}
                            title={state.title ?? 'PDF document'}
                            onLoad={handlePdfLoad}
                          />
                        ) : null
                      ) : (
                        <img
                          alt={state.title ?? 'modal image'}
                          hidden={state.status !== 'ready'}
                          ref={imgRef}
                          src={state.imageSrc ?? ''}
                          onLoad={handleImageLoad}
                          onError={handleImageError}
                        />
                      )}
                    </div>
                    <div className="mmodal__desc">
                      {state.title ? <h3>{state.title}</h3> : null}
                      {state.mediaType === 'pdf' && state.pdfOpenSrc ? (
                        <p>
                          <a href={state.pdfOpenSrc} target="_blank" rel="noreferrer noopener">
                            {isZenodoUrl(state.pdfOpenSrc) ? 'Open PDF on Zenodo' : 'Open PDF in new tab'}
                          </a>
                        </p>
                      ) : null}
                      {state.description ? <p>{state.description}</p> : null}
                      {state.author ? (
                        <p>
                          <em>{state.author}</em>
                        </p>
                      ) : null}
                      {state.message ? (
                        <p className={state.status === 'loading' ? 'loading-msg animate-flash' : ''} style={state.status === 'error' ? { color: 'red' } : undefined}>
                          {state.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            portalTarget
          )
        : null}
    </MaterialModalContext.Provider>
  );
}

export default MaterialModalProvider;
