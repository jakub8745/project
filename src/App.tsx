// App.tsx
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import './styles/materialModal.css';
import Sidebar from './components/Sidebar';
import GalleryGrid from './components/GalleryGrid';
import { InfoButtons } from './components/InfoButtons';
import type { BlobChatMessage } from './components/BlobChatWindow';
import {
  DEFAULT_BLOB_CHAT_SETTINGS,
  type BlobChatSettings,
  type BlobPersona,
  type PhysicsCollisionEvent
} from './chat/types';
import {
  extractLastQuestion,
  getLastChatLine,
  parseBlobPersonas,
  resolveBlobFromVisitorText,
  resolveBlobPromptsFromPaths
} from './chat/config';
import { GALLERIES, type GalleryItem } from './data/galleryConfig';
import { useBlobChatBridge } from './hooks/useBlobChatBridge';
import { unlockAudioPlayback } from './modules/audioMeshManager';
import { useExhibitConfig } from './r3f/useExhibitConfig';

const R3FViewer = lazy(async () => {
  const module = await import('./r3f/R3FViewer');
  return { default: module.R3FViewer ?? module.default }; // retain support for both exports
});

const BlobChatWindow = lazy(async () => {
  const module = await import('./components/BlobChatWindow');
  return { default: module.default };
});

interface Gallery {
  slug: string;
  configUrl: string;
  title: string;
}

interface PageMetadata {
  title: string;
  description: string;
  ogImage: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
}

const SITE_ORIGIN = 'https://archive.bluepointart.uk';
const DEFAULT_PAGE_METADATA: PageMetadata = {
  title: 'Blue Point Art Archive',
  description: 'Explore 3D projects in an interactive gallery',
  ogImage: '/og_image_archivum.jpg',
  ogImageWidth: 1200,
  ogImageHeight: 630
};

function createMessageId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function toAbsoluteUrl(path: string): string {
  const cleanPath = path.trim();
  if (!cleanPath) return toAbsoluteUrl(DEFAULT_PAGE_METADATA.ogImage);
  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;
  if (cleanPath.startsWith('//')) return `https:${cleanPath}`;
  const withoutPublic = cleanPath.replace(/^public\//, '');
  const normalized = withoutPublic.startsWith('/') ? withoutPublic : `/${withoutPublic.replace(/^\.\//, '')}`;
  return `${SITE_ORIGIN}${normalized}`;
}

function setMetaContent(selector: string, content: string) {
  if (typeof document === 'undefined') return;
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) {
    el.content = content;
  }
}

function applyPageMetadata(metadata: PageMetadata) {
  if (typeof document === 'undefined') return;
  const title = metadata.title || DEFAULT_PAGE_METADATA.title;
  const description = metadata.description || DEFAULT_PAGE_METADATA.description;
  const image = toAbsoluteUrl(metadata.ogImage || DEFAULT_PAGE_METADATA.ogImage);
  const currentUrl = typeof window !== 'undefined' ? window.location.href : `${SITE_ORIGIN}/`;

  document.title = title;
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[property="og:image"]', image);
  setMetaContent('meta[property="og:url"]', currentUrl);
  setMetaContent('meta[property="og:image:width"]', String(metadata.ogImageWidth ?? DEFAULT_PAGE_METADATA.ogImageWidth));
  setMetaContent('meta[property="og:image:height"]', String(metadata.ogImageHeight ?? DEFAULT_PAGE_METADATA.ogImageHeight));
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);
  setMetaContent('meta[name="twitter:image"]', image);
}

function metadataFromGallery(gallery: GalleryItem | null | undefined): PageMetadata {
  if (!gallery) return DEFAULT_PAGE_METADATA;
  return {
    title: gallery.title || DEFAULT_PAGE_METADATA.title,
    description: gallery.description || DEFAULT_PAGE_METADATA.description,
    ogImage: gallery.ogImage || gallery.thumbnailPoster || DEFAULT_PAGE_METADATA.ogImage,
    ogImageWidth: DEFAULT_PAGE_METADATA.ogImageWidth,
    ogImageHeight: DEFAULT_PAGE_METADATA.ogImageHeight
  };
}

function metadataFromConfig(config: unknown, fallback: PageMetadata): PageMetadata {
  if (!config || typeof config !== 'object') return fallback;
  const record = config as Record<string, unknown>;
  const raw = record.metadata;
  if (!raw || typeof raw !== 'object') return fallback;
  const metadata = raw as Record<string, unknown>;

  return {
    title: typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title : fallback.title,
    description:
      typeof metadata.description === 'string' && metadata.description.trim()
        ? metadata.description
        : fallback.description,
    ogImage: typeof metadata.ogImage === 'string' && metadata.ogImage.trim() ? metadata.ogImage : fallback.ogImage,
    ogImageWidth:
      typeof metadata.ogImageWidth === 'number' && Number.isFinite(metadata.ogImageWidth)
        ? metadata.ogImageWidth
        : fallback.ogImageWidth,
    ogImageHeight:
      typeof metadata.ogImageHeight === 'number' && Number.isFinite(metadata.ogImageHeight)
        ? metadata.ogImageHeight
        : fallback.ogImageHeight
  };
}

function getBooleanFromQuery(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function detectIPadLikeDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouch = navigator.maxTouchPoints || 0;
  return /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouch > 1);
}

export default function App() {
  const isThumbnailMode = getBooleanFromQuery('thumbnailMode') || getBooleanFromQuery('recordThumb');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);
  const [howToModalShownForConfig, setHowToModalShownForConfig] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const [selectedConfigUrl, setSelectedConfigUrl] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [blobChatSettings, setBlobChatSettings] = useState<BlobChatSettings>(DEFAULT_BLOB_CHAT_SETTINGS);
  const [activeBlobId, setActiveBlobId] = useState<string | null>(DEFAULT_BLOB_CHAT_SETTINGS.blobs[0]?.id || null);
  const [chatMessages, setChatMessages] = useState<BlobChatMessage[]>([]);
  const [chatUnlocked, setChatUnlocked] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const autoHideTimerRef = useRef<number | null>(null);
  const audioUnlockAttemptedRef = useRef(false);
  const chatSessionIdRef = useRef<string>('default-session');
  const chatMessagesRef = useRef<BlobChatMessage[]>([]);
  const lastCollisionAtRef = useRef<Map<string, number>>(new Map());
  const requestInFlightRef = useRef(false);
  const {
    sendMessage: sendToBridge,
    loading: bridgeLoading,
    error: bridgeError,
    available: bridgeAvailable,
    requiresUnlock,
    unlockChat
  } = useBlobChatBridge({ enabled: blobChatSettings.enabled });
  const {
    config: exhibitConfig,
    loading: exhibitConfigLoading,
    error: exhibitConfigError
  } = useExhibitConfig(selectedConfigUrl);
  const AUTO_HIDE_DELAY_MS = 5000;
  // ✅ memoized toggle
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(o => !o);
  }, []);

  // Helper: find gallery by slug
  const findGalleryBySlug = useCallback((slug: string) => {
    return GALLERIES.find(g => g.slug === slug);
  }, []);

  // Handle hash-based gallery selection
  useEffect(() => {
    function handleHashChange() {
      const rawHash = window.location.hash.replace('#', '').trim();
      const fallbackGallery = GALLERIES[0];

      const normalizedSlug = rawHash
        .replace(/^r3f\/?/i, '')
        .replace(/^\/+|\/+$/g, '');

      const requestedGallery = normalizedSlug ? findGalleryBySlug(normalizedSlug) : undefined;
      const gallery = requestedGallery ?? fallbackGallery;

      if (!gallery) {
        setSelectedConfigUrl(null);
        setSelectedSlug(null);
        return;
      }

      setSelectedConfigUrl(gallery.configUrl);
      setSelectedSlug(gallery.slug);
    }

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [findGalleryBySlug]);

  // On gallery click, update hash and close sidebar
  const handleGallerySelect = useCallback((gallery: Gallery) => {
    window.location.hash = gallery.slug;
  }, []);

  useEffect(() => {
    setShowHowToModal(false);
    setHowToModalShownForConfig(null);
  }, [selectedConfigUrl]);

  const handleVisitorEntered = useCallback(() => {
    if (!selectedConfigUrl || howToModalShownForConfig === selectedConfigUrl) return;
    setHowToModalShownForConfig(selectedConfigUrl);
    setShowHowToModal(true);
  }, [howToModalShownForConfig, selectedConfigUrl]);

  useEffect(() => {
    const selectedGallery =
      (selectedSlug ? GALLERIES.find((gallery) => gallery.slug === selectedSlug) : null) ??
      GALLERIES.find((gallery) => gallery.configUrl === selectedConfigUrl);
    const fallbackMetadata = metadataFromGallery(selectedGallery);
    applyPageMetadata(metadataFromConfig(exhibitConfig, fallbackMetadata));
  }, [exhibitConfig, selectedConfigUrl, selectedSlug]);

  const scheduleSidebarAutoHide = useCallback(() => {
    if (!sidebarOpen) {
      return;
    }
    if (autoHideTimerRef.current !== null) {
      window.clearTimeout(autoHideTimerRef.current);
    }
    autoHideTimerRef.current = window.setTimeout(() => {
      setSidebarOpen(false);
    }, AUTO_HIDE_DELAY_MS);
  }, [sidebarOpen]);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) {
      return undefined;
    }

    const handleActivity = () => {
      scheduleSidebarAutoHide();
    };

    const events: Array<keyof HTMLElementEventMap> = [
      'pointerdown',
      'pointermove',
      'wheel',
      'touchstart',
      'touchmove',
      'keydown',
    ];

    events.forEach(eventName => {
      mainEl.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(eventName => {
        mainEl.removeEventListener(eventName, handleActivity);
      });
    };
  }, [scheduleSidebarAutoHide]);

  useEffect(() => {
    if (audioUnlockAttemptedRef.current) {
      return undefined;
    }

    const unlockOnFirstGesture = () => {
      if (audioUnlockAttemptedRef.current) {
        return;
      }
      audioUnlockAttemptedRef.current = true;
      void unlockAudioPlayback();
      window.removeEventListener('pointerdown', unlockOnFirstGesture, true);
      window.removeEventListener('touchstart', unlockOnFirstGesture, true);
      window.removeEventListener('keydown', unlockOnFirstGesture, true);
      window.removeEventListener('mousedown', unlockOnFirstGesture, true);
    };

    window.addEventListener('pointerdown', unlockOnFirstGesture, true);
    window.addEventListener('touchstart', unlockOnFirstGesture, true);
    window.addEventListener('keydown', unlockOnFirstGesture, true);
    window.addEventListener('mousedown', unlockOnFirstGesture, true);

    return () => {
      window.removeEventListener('pointerdown', unlockOnFirstGesture, true);
      window.removeEventListener('touchstart', unlockOnFirstGesture, true);
      window.removeEventListener('keydown', unlockOnFirstGesture, true);
      window.removeEventListener('mousedown', unlockOnFirstGesture, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (autoHideTimerRef.current !== null) {
        window.clearTimeout(autoHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateViewportFlags = () => {
      const isIPadLike = detectIPadLikeDevice();
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const narrowViewport = window.matchMedia('(max-width: 1024px)').matches;
      const portraitNow = window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
      setIsMobileViewport((coarsePointer && narrowViewport) || isIPadLike);
      setIsPortrait(portraitNow);
      setIsFullscreen(Boolean(document.fullscreenElement));
      if (!portraitNow) {
        setShowRotateHint(false);
      }
    };

    updateViewportFlags();
    window.addEventListener('resize', updateViewportFlags);
    window.addEventListener('orientationchange', updateViewportFlags);
    document.addEventListener('fullscreenchange', updateViewportFlags);
    return () => {
      window.removeEventListener('resize', updateViewportFlags);
      window.removeEventListener('orientationchange', updateViewportFlags);
      document.removeEventListener('fullscreenchange', updateViewportFlags);
    };
  }, []);

  const requestLandscapeFullscreen = useCallback(async () => {
    const root = document.documentElement;

    try {
      if (!document.fullscreenElement && root.requestFullscreen) {
        await root.requestFullscreen();
      }
    } catch {
      // ignore, fallback message is shown below
    }

    let orientationLocked = false;
    const orientationApi = (screen as Screen & { orientation?: { lock?: (mode: string) => Promise<void> } }).orientation;
    if (orientationApi?.lock) {
      try {
        await orientationApi.lock('landscape');
        orientationLocked = true;
      } catch {
        orientationLocked = false;
      }
    }

    const portraitNow = window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
    setShowRotateHint(!orientationLocked && portraitNow);
  }, []);

  useEffect(() => {
    chatSessionIdRef.current = `${selectedSlug || 'gallery'}-${Date.now()}`;
    setChatMessages([]);
    setChatUnlocked(false);
    lastCollisionAtRef.current.clear();
    requestInFlightRef.current = false;
  }, [selectedSlug]);

  useEffect(() => {
    if (!selectedConfigUrl || !exhibitConfig) {
      setBlobChatSettings(DEFAULT_BLOB_CHAT_SETTINGS);
      setActiveBlobId(DEFAULT_BLOB_CHAT_SETTINGS.blobs[0]?.id || null);
      return;
    }

    const controller = new AbortController();
    const configRecord = exhibitConfig as Record<string, unknown>;
    const chat = configRecord.chat && typeof configRecord.chat === 'object' ? (configRecord.chat as Record<string, unknown>) : {};

    void (async () => {
      const parsedBlobs = parseBlobPersonas(chat);
      const blobs = await resolveBlobPromptsFromPaths(parsedBlobs, controller.signal);
      const next: BlobChatSettings = {
        enabled: chat.enabled === true,
        title: typeof chat.title === 'string' ? chat.title : DEFAULT_BLOB_CHAT_SETTINGS.title,
        visitorActorId:
          typeof chat.visitorActorId === 'string' ? chat.visitorActorId : DEFAULT_BLOB_CHAT_SETTINGS.visitorActorId,
        collisionCooldownMs:
          typeof chat.collisionCooldownMs === 'number' && Number.isFinite(chat.collisionCooldownMs)
            ? Math.max(250, chat.collisionCooldownMs)
            : DEFAULT_BLOB_CHAT_SETTINGS.collisionCooldownMs,
        blobs
      };
      if (!controller.signal.aborted) {
        setBlobChatSettings(next);
        setActiveBlobId(blobs[0]?.id || null);
      }
    })().catch(() => undefined);

    return () => {
      controller.abort();
    };
  }, [exhibitConfig, selectedConfigUrl]);

  useEffect(() => {
    if (!blobChatSettings.enabled) return;
    const labels = blobChatSettings.blobs.map((blob) => blob.label).join(', ');
    setChatMessages((prev) => {
      if (prev.length > 0) return prev;
      const onlineMessage = requiresUnlock && !chatUnlocked
        ? `Blob chat is locked. Enter secret words to unlock. Available: ${labels || 'Blob'}.`
        : `${labels || 'Blob'} online. Ask about art. Use @blob_id to pick a blob; collisions trigger blob replies.`;
      return [
        {
          id: createMessageId('system'),
          role: 'system',
          text: onlineMessage,
          createdAt: Date.now()
        }
      ];
    });
  }, [blobChatSettings.blobs, blobChatSettings.enabled, requiresUnlock, chatUnlocked]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const requestBlobReply = useCallback(
    async ({
      blob,
      trigger,
      messageText,
      collisionEvent,
      historyMessages
    }: {
      blob: BlobPersona;
      trigger: 'visitor' | 'collision';
      messageText: string;
      collisionEvent?: PhysicsCollisionEvent;
      historyMessages?: BlobChatMessage[];
    }): Promise<string | null> => {
      if (!blobChatSettings.enabled || !bridgeAvailable) {
        return null;
      }
      if (requiresUnlock && !chatUnlocked) {
        return null;
      }
      if (requestInFlightRef.current) return null;
      requestInFlightRef.current = true;
      const cleanMessage = messageText.trim();
      const finalUserMessage = [
        'Continue the ongoing discussion theme between Visitor and blobs.',
        'Reply directly to the last chat message in context.',
        'Do not mention collisions, triggers, system mechanics, or game logic.',
        '',
        cleanMessage || 'Continue the current art discussion with a concise response.'
      ].join('\n');
      try {
        const history = (historyMessages ?? chatMessagesRef.current)
          .filter((entry) => entry.role === 'visitor' || entry.role === 'blob')
          .slice(-10)
          .map((entry) => ({
            role: entry.role === 'blob' && entry.blobId === blob.id ? ('assistant' as const) : ('user' as const),
            content:
              entry.role === 'visitor'
                ? `Visitor: ${entry.text}`
                : `${entry.senderLabel || entry.blobId || 'Blob'}: ${entry.text}`
          }));
        const result = await sendToBridge({
          sessionId: chatSessionIdRef.current,
          text: finalUserMessage,
          trigger,
          blobId: blob.id,
          blobLabel: blob.label,
          systemPrompt: blob.systemPrompt,
          history,
          metadata: {
            source: '3d-gallery-explorer',
            trigger,
            exhibit: selectedSlug || 'unknown',
            collision: collisionEvent || null,
            telegramRelay: true
          }
        });
        if (result.text.trim()) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: createMessageId('blob'),
              role: 'blob',
              text: result.text,
              createdAt: Date.now(),
              blobId: blob.id,
              senderLabel: blob.label
            }
          ]);
          return result.text.trim();
        }
        return null;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Chat bridge request failed.';
        setChatMessages((prev) => [
          ...prev,
          {
            id: createMessageId('system'),
            role: 'system',
            text: `Chat bridge error: ${message}`,
            createdAt: Date.now()
          }
        ]);
        return null;
      } finally {
        requestInFlightRef.current = false;
      }
    },
    [blobChatSettings.enabled, bridgeAvailable, selectedSlug, sendToBridge, requiresUnlock, chatUnlocked]
  );

  const handleChatSend = useCallback(
    async (text: string) => {
      if (!blobChatSettings.enabled) return;
      if (requiresUnlock && !chatUnlocked) {
        const phrase = text.trim();
        if (!phrase) return;
        const ok = await unlockChat(chatSessionIdRef.current, phrase);
        if (!ok) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: createMessageId('system'),
              role: 'system',
              text: 'Secret words rejected. Try again.',
              createdAt: Date.now()
            }
          ]);
          return;
        }
        setChatUnlocked(true);
        setChatMessages((prev) => [
          ...prev,
          {
            id: createMessageId('system'),
            role: 'system',
            text: 'Chat unlocked. You can now talk to the blobs.',
            createdAt: Date.now()
          }
        ]);
        return;
      }
      const { blob, messageText } = resolveBlobFromVisitorText(text, blobChatSettings.blobs, activeBlobId);
      if (!blob || !messageText) return;
      setActiveBlobId(blob.id);
      const visitorMessage: BlobChatMessage = {
        id: createMessageId('visitor'),
        role: 'visitor',
        text: messageText,
        createdAt: Date.now(),
        blobId: blob.id
      };
      const nextMessages = [...chatMessagesRef.current, visitorMessage];
      chatMessagesRef.current = nextMessages;
      setChatMessages(nextMessages);
      await requestBlobReply({ blob, trigger: 'visitor', messageText, historyMessages: nextMessages });
    },
    [activeBlobId, blobChatSettings.blobs, blobChatSettings.enabled, requestBlobReply, requiresUnlock, chatUnlocked, unlockChat]
  );

  const handlePhysicsCollision = useCallback(
    (event: PhysicsCollisionEvent) => {
      if (!blobChatSettings.enabled) return;
      if (requiresUnlock && !chatUnlocked) return;
      const blobA = blobChatSettings.blobs.find((entry) => entry.id === event.a) || null;
      const blobB = blobChatSettings.blobs.find((entry) => entry.id === event.b) || null;
      const hasVisitor = event.a === blobChatSettings.visitorActorId || event.b === blobChatSettings.visitorActorId;

      void (async () => {
        const latestMessages = chatMessagesRef.current;
        if (blobA && blobB && blobA.id !== blobB.id) {
          if (!blobA.chatOnCollision && !blobB.chatOnCollision) return;
          const pairKey = blobA.id < blobB.id ? `${blobA.id}__${blobB.id}` : `${blobB.id}__${blobA.id}`;
          const now = Date.now();
          const lastAt = lastCollisionAtRef.current.get(pairKey) || 0;
          if (now - lastAt < blobChatSettings.collisionCooldownMs) return;
          lastCollisionAtRef.current.set(pairKey, now);

          const lastLine = getLastChatLine(latestMessages);
          const themedSeed = lastLine
            ? `${lastLine.speaker}: ${lastLine.text}\nReply to this message and continue the same art discussion theme.`
            : 'Continue the current art discussion theme with one concise response.';
          const first = blobA.chatOnCollision
            ? await requestBlobReply({
                blob: blobA,
                trigger: 'collision',
                messageText: themedSeed,
                collisionEvent: event
              })
            : null;
          if (!blobB.chatOnCollision) return;
          const secondPrompt = first
            ? `${blobA.label}: ${first}\nReply to this message and continue the same art discussion theme.`
            : themedSeed;
          await requestBlobReply({
            blob: blobB,
            trigger: 'collision',
            messageText: secondPrompt,
            collisionEvent: event
          });
          setActiveBlobId(blobB.id);
          return;
        }

        if (!hasVisitor) return;
        const blob =
          blobChatSettings.blobs.find((entry) => entry.id === event.a || entry.id === event.b) || null;
        if (!blob || !blob.chatOnCollision) return;

        const now = Date.now();
        const lastAt = lastCollisionAtRef.current.get(blob.id) || 0;
        if (now - lastAt < blobChatSettings.collisionCooldownMs) return;
        lastCollisionAtRef.current.set(blob.id, now);
        setActiveBlobId(blob.id);

        const lastLine = getLastChatLine(latestMessages);
        const lastBlobMessageForBlob = [...latestMessages].reverse().find((entry) => entry.role === 'blob' && entry.blobId === blob.id);
        const lastBlobQuestion = lastBlobMessageForBlob ? extractLastQuestion(lastBlobMessageForBlob.text) : null;
        const seed = lastLine
          ? `${lastLine.speaker}: ${lastLine.text}\nReply to this message and continue the same art discussion theme.`
          : 'Continue the current art discussion theme with one concise response.';
        await requestBlobReply({
          blob,
          trigger: 'collision',
          messageText: lastBlobQuestion || seed,
          collisionEvent: event
        });
      })();
    },
    [blobChatSettings, requestBlobReply, requiresUnlock, chatUnlocked]
  );

  const activeBlob = blobChatSettings.blobs.find((blob) => blob.id === activeBlobId) || blobChatSettings.blobs[0] || null;

  return (
    <div className="flex h-screen overflow-hidden bg-gallery-dark">
      {!isThumbnailMode ? (
        <Sidebar
          open={sidebarOpen}
          onToggle={toggleSidebar}   // ✅ stable reference
          logoText="Blue Point Art Gallery [Archive]"
        >
          <section className="p-4 bg-slate-500/35 border-b border-slate-400/40 text-white">
            {/* Exhibit info section (expandable items) */}
            {selectedConfigUrl && (
              <InfoButtons configUrl={selectedConfigUrl} />
            )}
          </section>

          <section className="p-4 bg-slate-500/35 text-white">
            <h2 className="text-xl font-bold mb-4">Choose an exhibit</h2>
            <GalleryGrid
              onSelect={handleGallerySelect} // ✅ memoized
              sidebarOpen={sidebarOpen}
              onToggleSidebar={toggleSidebar} // ✅ stable reference
              selectedSlug={selectedSlug ?? undefined}
            />
          </section>
        </Sidebar>
      ) : null}

      <main ref={mainRef} className="flex-1 relative">
        <div className="h-full">
          {selectedConfigUrl ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-white/70">
                  Loading viewer…
                </div>
              }
            >
              <R3FViewer
                configUrl={selectedConfigUrl}
                config={exhibitConfig}
                loading={exhibitConfigLoading}
                error={exhibitConfigError}
                onVisitorEntered={handleVisitorEntered}
                onPhysicsCollision={handlePhysicsCollision}
              />
            </Suspense>
          ) : null}
        </div>
        {!isThumbnailMode && blobChatSettings.enabled ? (
          <Suspense fallback={null}>
            <BlobChatWindow
              title={activeBlob ? `${blobChatSettings.title} - ${activeBlob.label}` : blobChatSettings.title}
              messages={chatMessages}
              loading={bridgeLoading}
              error={bridgeError}
              bridgeOnline={bridgeAvailable}
              locked={requiresUnlock && !chatUnlocked}
              placeholder={activeBlob ? `Send a message to ${activeBlob.label}...` : 'Send a message...'}
              onSend={handleChatSend}
            />
          </Suspense>
        ) : null}
      </main>

      {!isThumbnailMode && showHowToModal && (
        <div className="fixed inset-x-0 bottom-6 z-[1200] flex justify-center px-3 pointer-events-none">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="How to move instructions"
            className="pointer-events-auto relative w-full max-w-2xl h-auto max-h-[70dvh] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 text-slate-900 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setShowHowToModal(false)}
              className="absolute top-2 right-2 z-10 rounded-full border border-slate-400 bg-white px-3 py-1 text-lg font-bold leading-none text-slate-800"
              aria-label="Close help modal"
            >
              X
            </button>
            <div className="p-3 pt-12 sm:p-4 sm:pt-14">
              <img
                src="/icons/archive_how_to_move_icons.jpg"
                alt="How to move in the gallery instructions"
                className="w-full h-auto max-h-[calc(70dvh-4rem)] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {!isThumbnailMode && isMobileViewport && !isFullscreen && (
        <button
          type="button"
          onClick={requestLandscapeFullscreen}
          className="fixed bottom-3 right-3 z-[1300] rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900 shadow-lg"
          aria-label="Enter fullscreen landscape mode"
        >
          Fullscreen landscape
        </button>
      )}

      {!isThumbnailMode && isMobileViewport && isPortrait && showRotateHint && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[1400] rounded-lg border border-slate-400 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
          Rotate device to landscape.
        </div>
      )}
    </div>
  );
}
