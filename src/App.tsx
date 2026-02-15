// App.tsx
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import './styles/materialModal.css';
import Sidebar from './components/Sidebar';
import GalleryGrid from './components/GalleryGrid';
import { InfoButtons } from './components/InfoButtons';
import BlobChatWindow, { type BlobChatMessage } from './components/BlobChatWindow';
import { GALLERIES } from './data/galleryConfig';
import { useBlobChatBridge } from './hooks/useBlobChatBridge';

const R3FViewer = lazy(async () => {
  const module = await import('./r3f/R3FViewer');
  return { default: module.R3FViewer ?? module.default }; // retain support for both exports
});

interface Gallery {
  slug: string;
  configUrl: string;
  title: string;
}

interface PhysicsCollisionEvent {
  a: string;
  b: string;
  point: [number, number, number];
  penetration: number;
  timestamp: number;
}

interface BlobPersona {
  id: string;
  label: string;
  systemPrompt: string;
  collisionPrompt: string;
  chatOnCollision: boolean;
}

interface BlobChatSettings {
  enabled: boolean;
  title: string;
  visitorActorId: string;
  collisionCooldownMs: number;
  blobs: BlobPersona[];
}

const DEFAULT_BLOB_CHAT_SETTINGS: BlobChatSettings = {
  enabled: false,
  title: 'Blob Chat',
  visitorActorId: 'visitor',
  collisionCooldownMs: 4500,
  blobs: [
    {
      id: 'blob_alpha',
      label: 'Blob Alpha',
      systemPrompt:
        'You are Blob Alpha, an art-focused guide in a virtual gallery. Discuss only art, artworks, curation, media, aesthetics, interpretation, and art history.',
      collisionPrompt:
        'A collision happened between Blob Alpha and the visitor in the room. Reply with one short, art-focused message.',
      chatOnCollision: true
    }
  ]
};

function createMessageId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function getBooleanFromQuery(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseBlobPersonas(chat: Record<string, unknown>): BlobPersona[] {
  const blobsRaw = Array.isArray(chat.blobs) ? chat.blobs : null;
  if (blobsRaw && blobsRaw.length > 0) {
    const parsed = blobsRaw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id : '';
        if (!id) return null;
        return {
          id,
          label: typeof record.label === 'string' ? record.label : id,
          systemPrompt:
            typeof record.systemPrompt === 'string'
              ? record.systemPrompt
              : `You are ${typeof record.label === 'string' ? record.label : id}, an art-focused guide in a virtual gallery. Discuss only art.`,
          collisionPrompt:
            typeof record.collisionPrompt === 'string'
              ? record.collisionPrompt
              : `A collision happened between ${typeof record.label === 'string' ? record.label : id} and the visitor. Reply with one short, art-focused message.`,
          chatOnCollision: record.chatOnCollision !== false
        } as BlobPersona;
      })
      .filter((entry): entry is BlobPersona => entry !== null);
    if (parsed.length > 0) return parsed;
  }

  // Backward compatibility with old single-blob keys.
  const legacyId = typeof chat.blobActorId === 'string' ? chat.blobActorId : DEFAULT_BLOB_CHAT_SETTINGS.blobs[0].id;
  const legacyPrompt =
    typeof chat.systemPrompt === 'string' ? chat.systemPrompt : DEFAULT_BLOB_CHAT_SETTINGS.blobs[0].systemPrompt;
  const legacyCollisionPrompt =
    typeof chat.collisionPrompt === 'string' ? chat.collisionPrompt : DEFAULT_BLOB_CHAT_SETTINGS.blobs[0].collisionPrompt;
  const legacyCollisionEnabled =
    typeof chat.blobChatOnCollision === 'boolean' ? chat.blobChatOnCollision : DEFAULT_BLOB_CHAT_SETTINGS.blobs[0].chatOnCollision;

  return [
    {
      id: legacyId,
      label: 'Blob Alpha',
      systemPrompt: legacyPrompt,
      collisionPrompt: legacyCollisionPrompt,
      chatOnCollision: legacyCollisionEnabled
    }
  ];
}

function resolveBlobFromVisitorText(text: string, blobs: BlobPersona[], fallbackBlobId: string | null) {
  const trimmed = text.trim();
  if (!trimmed) return { blob: null as BlobPersona | null, messageText: '' };
  const byId = blobs.find((blob) => trimmed.toLowerCase().startsWith(`@${blob.id.toLowerCase()} `));
  if (byId) {
    return { blob: byId, messageText: trimmed.slice(byId.id.length + 2).trim() };
  }
  const byLabel = blobs.find((blob) => trimmed.toLowerCase().startsWith(`@${blob.label.toLowerCase()} `));
  if (byLabel) {
    return { blob: byLabel, messageText: trimmed.slice(byLabel.label.length + 2).trim() };
  }
  const fallback = blobs.find((blob) => blob.id === fallbackBlobId) || blobs[0] || null;
  return { blob: fallback, messageText: trimmed };
}

function extractLastQuestion(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const matches = normalized.match(/[^?]*\?/g);
  if (!matches || matches.length === 0) return null;
  const candidate = matches[matches.length - 1]?.trim() || '';
  return candidate.length > 1 ? candidate : null;
}

export default function App() {
  const isThumbnailMode = getBooleanFromQuery('thumbnailMode') || getBooleanFromQuery('recordThumb');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const [selectedConfigUrl, setSelectedConfigUrl] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [blobChatSettings, setBlobChatSettings] = useState<BlobChatSettings>(DEFAULT_BLOB_CHAT_SETTINGS);
  const [activeBlobId, setActiveBlobId] = useState<string | null>(DEFAULT_BLOB_CHAT_SETTINGS.blobs[0]?.id || null);
  const [chatMessages, setChatMessages] = useState<BlobChatMessage[]>([]);
  const mainRef = useRef<HTMLElement | null>(null);
  const autoHideTimerRef = useRef<number | null>(null);
  const chatSessionIdRef = useRef<string>('default-session');
  const lastCollisionAtRef = useRef<Map<string, number>>(new Map());
  const requestInFlightRef = useRef(false);
  const { sendMessage: sendToBridge, loading: bridgeLoading, error: bridgeError, available: bridgeAvailable } = useBlobChatBridge();
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
        .replace(/^legacy\/?/i, '')
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
    return () => {
      if (autoHideTimerRef.current !== null) {
        window.clearTimeout(autoHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateViewportFlags = () => {
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const narrowViewport = window.matchMedia('(max-width: 1024px)').matches;
      const portraitNow = window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
      setIsMobileViewport(coarsePointer && narrowViewport);
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
    lastCollisionAtRef.current.clear();
    requestInFlightRef.current = false;
  }, [selectedSlug]);

  useEffect(() => {
    if (!selectedConfigUrl) {
      setBlobChatSettings(DEFAULT_BLOB_CHAT_SETTINGS);
      return;
    }
    const controller = new AbortController();
    fetch(selectedConfigUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const raw = (await response.json()) as Record<string, unknown>;
        const chat = raw.chat && typeof raw.chat === 'object' ? (raw.chat as Record<string, unknown>) : {};
        const blobs = parseBlobPersonas(chat);
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
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [selectedConfigUrl]);

  useEffect(() => {
    if (!blobChatSettings.enabled) return;
    const labels = blobChatSettings.blobs.map((blob) => blob.label).join(', ');
    setChatMessages((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: createMessageId('system'),
          role: 'system',
          text: `${labels || 'Blob'} online. Ask about art. Use @blob_id to pick a blob; collisions trigger blob replies.`,
          createdAt: Date.now()
        }
      ];
    });
  }, [blobChatSettings.blobs, blobChatSettings.enabled]);

  const requestBlobReply = useCallback(
    async ({
      blob,
      trigger,
      messageText,
      collisionEvent
    }: {
      blob: BlobPersona;
      trigger: 'visitor' | 'collision';
      messageText: string;
      collisionEvent?: PhysicsCollisionEvent;
    }) => {
      if (!blobChatSettings.enabled || !bridgeAvailable) {
        return;
      }
      if (requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      const finalUserMessage =
        trigger === 'collision'
          ? messageText.trim()
            ? `Collision trigger. Continue naturally by responding to this prompt:\n${messageText}`
            : `${blob.collisionPrompt}\nTrigger payload: ${messageText}`
          : messageText;
      try {
        const history = chatMessages
          .filter((entry) => (entry.role === 'visitor' || entry.role === 'blob') && entry.blobId === blob.id)
          .slice(-10)
          .map((entry) => ({
            role: entry.role === 'visitor' ? 'user' as const : 'assistant' as const,
            content: entry.text
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
        }
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
      } finally {
        requestInFlightRef.current = false;
      }
    },
    [blobChatSettings.enabled, bridgeAvailable, chatMessages, selectedSlug, sendToBridge]
  );

  const handleChatSend = useCallback(
    async (text: string) => {
      if (!blobChatSettings.enabled) return;
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
      setChatMessages((prev) => [...prev, visitorMessage]);
      await requestBlobReply({ blob, trigger: 'visitor', messageText });
    },
    [activeBlobId, blobChatSettings.blobs, blobChatSettings.enabled, requestBlobReply]
  );

  const handlePhysicsCollision = useCallback(
    (event: PhysicsCollisionEvent) => {
      if (!blobChatSettings.enabled) return;
      const blob =
        blobChatSettings.blobs.find((entry) => entry.id === event.a || entry.id === event.b) || null;
      if (!blob || !blob.chatOnCollision) return;
      const hasVisitor = event.a === blobChatSettings.visitorActorId || event.b === blobChatSettings.visitorActorId;
      if (!hasVisitor) return;
      const now = Date.now();
      const lastAt = lastCollisionAtRef.current.get(blob.id) || 0;
      if (now - lastAt < blobChatSettings.collisionCooldownMs) return;
      lastCollisionAtRef.current.set(blob.id, now);
      setActiveBlobId(blob.id);

      const [x, y, z] = event.point;
      const collisionText = `Collision at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}), penetration ${event.penetration.toFixed(3)}.`;
      const lastBlobMessageForBlob = [...chatMessages]
        .reverse()
        .find((entry) => entry.role === 'blob' && entry.blobId === blob.id);
      const lastBlobQuestion = lastBlobMessageForBlob ? extractLastQuestion(lastBlobMessageForBlob.text) : null;
      const lastVisitorMessageForBlob = [...chatMessages]
        .reverse()
        .find((entry) => entry.role === 'visitor' && entry.blobId === blob.id);
      void requestBlobReply({
        blob,
        trigger: 'collision',
        messageText: lastBlobQuestion || lastVisitorMessageForBlob?.text || collisionText,
        collisionEvent: event
      });
    },
    [blobChatSettings, chatMessages, requestBlobReply]
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
                onPhysicsCollision={handlePhysicsCollision}
              />
            </Suspense>
          ) : null}
        </div>
        {!isThumbnailMode && blobChatSettings.enabled ? (
          <BlobChatWindow
            title={activeBlob ? `${blobChatSettings.title} - ${activeBlob.label}` : blobChatSettings.title}
            messages={chatMessages}
            loading={bridgeLoading}
            error={bridgeError}
            bridgeOnline={bridgeAvailable}
            onSend={handleChatSend}
          />
        ) : null}
      </main>

      {!isThumbnailMode && showHowToModal && (
        <div className="fixed inset-0 z-[1200] bg-black/70 flex items-end md:items-center justify-center p-2 sm:p-3 md:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="How to move instructions"
            className="relative w-full max-w-4xl h-auto max-h-[95dvh] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 text-slate-900 shadow-2xl"
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
                className="w-full h-auto max-h-[calc(95dvh-4rem)] object-contain"
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
