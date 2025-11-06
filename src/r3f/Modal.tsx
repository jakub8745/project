import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

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
};

export type ModalImageMap = Record<string, ModalImageMeta>;

export type ModalOpenPayload = Record<string, unknown> & { name?: string };

type ModalState = {
  isOpen: boolean;
  name: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  imageSrc: string | null;
  pendingSources: string[];
  contentWidth: number | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string | null;
};

type MaterialModalContextValue = {
  setImages: (images: ModalImageMap | undefined) => void;
  showModal: (payload: ModalOpenPayload) => void;
  hideModal: () => void;
};

type MaterialModalProviderProps = {
  children: ReactNode;
  initialImages?: ModalImageMap;
};

const MaterialModalContext = createContext<MaterialModalContextValue | null>(null);

const defaultState = (): ModalState => ({
  isOpen: false,
  name: null,
  title: null,
  description: null,
  author: null,
  imageSrc: null,
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

export function MaterialModalProvider({ children, initialImages }: MaterialModalProviderProps) {
  const [images, setImagesState] = useState<ModalImageMap | undefined>(initialImages);
  const [state, setState] = useState<ModalState>(() => defaultState());
  const imageCache = useRef(new Map<string, string>());
  const activeNameRef = useRef<string | null>(null);
  const imageWidthsRef = useRef(new Map<string, number>());
  const modalRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

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
    if (contentRef.current) {
      contentRef.current.style.width = '';
    }
    setState(() => defaultState());
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

  const showModal = useCallback((payload: ModalOpenPayload) => {
    const name = typeof payload?.name === 'string' ? payload.name : undefined;
    if (!name) return;
    const meta = images?.[name];
    if (!meta) return;

    activeNameRef.current = name;

    const cachedSrc = imageCache.current.get(name) ?? meta.img?.src ?? null;
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

    const [initialSource, ...nextSources] = sources;
    const isCached = Boolean(cachedSrc && cachedSrc === initialSource);
    const hasSource = Boolean(initialSource);

    setState({
      isOpen: true,
      name,
      title: meta.title,
      description: meta.description ?? null,
      author: meta.author ?? null,
      imageSrc: initialSource ?? null,
      pendingSources: nextSources,
      contentWidth: initialWidth,
      status: isCached ? 'ready' : hasSource ? 'loading' : 'error',
      message: !hasSource ? '⚠️ Could not load image.' : isCached ? null : 'Loading image…'
    });

    window.requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.style.width = `${initialWidth}px`;
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
          imageSrc: nextSource,
          pendingSources: rest,
          status: 'loading',
          message: 'Loading image…'
        };
      }
      return {
        ...prev,
        status: 'error',
        message: '⚠️ Could not load image.'
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
                      <img
                        alt={state.title ?? 'modal image'}
                        hidden={state.status !== 'ready'}
                        ref={imgRef}
                        src={state.imageSrc ?? ''}
                        onLoad={handleImageLoad}
                        onError={handleImageError}
                      />
                    </div>
                    <div className="mmodal__desc">
                      {state.title ? <h3>{state.title}</h3> : null}
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

export function useMaterialModal() {
  const ctx = useContext(MaterialModalContext);
  if (!ctx) {
    throw new Error('useMaterialModal must be used within a MaterialModalProvider');
  }
  return ctx;
}

export default MaterialModalProvider;
