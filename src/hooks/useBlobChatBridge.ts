import { useCallback, useEffect, useState } from 'react';
import { chatApiUrl } from '../utils/chatApi';

export type BlobChatBridgeRole = 'user' | 'assistant';

export interface BlobChatBridgeHistoryItem {
  role: BlobChatBridgeRole;
  content: string;
}

interface BlobChatBridgeSendPayload {
  sessionId: string;
  text: string;
  trigger: 'visitor' | 'collision';
  blobId: string;
  blobLabel: string;
  systemPrompt: string;
  history?: BlobChatBridgeHistoryItem[];
  metadata?: Record<string, unknown>;
}

interface UseBlobChatBridgeOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
}

export function useBlobChatBridge({
  enabled = true,
  pollIntervalMs = 12_000
}: UseBlobChatBridgeOptions = {}) {
  const [available, setAvailable] = useState(false);
  const [requiresUnlock, setRequiresUnlock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readJsonSafe = useCallback(async (response: Response) => {
    const raw = await response.text();
    if (!raw.trim()) return {} as Record<string, unknown>;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: raw } as Record<string, unknown>;
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch(chatApiUrl('/api/chat/health'));
      const payload = (await readJsonSafe(response)) as {
        ok?: boolean;
        configured?: boolean;
        error?: string;
        requiresUnlock?: boolean;
      };
      setAvailable(Boolean(response.ok && payload.ok && payload.configured));
      setRequiresUnlock(payload.requiresUnlock === true);
      if (!response.ok || payload.ok === false) {
        setError(payload.error || 'Chat bridge is unavailable.');
      } else {
        setError(null);
      }
    } catch (err) {
      setAvailable(false);
      setRequiresUnlock(false);
      setError(err instanceof Error ? err.message : 'Chat bridge is unavailable.');
    }
  }, [readJsonSafe]);

  useEffect(() => {
    if (!enabled) {
      setAvailable(false);
      setRequiresUnlock(false);
      setError(null);
      return undefined;
    }

    const isPageVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
    const checkHealthIfVisible = () => {
      if (!isPageVisible()) return;
      void checkHealth();
    };

    void checkHealth();
    const timer = window.setInterval(checkHealthIfVisible, pollIntervalMs);
    const handleVisibilityChange = () => {
      if (isPageVisible()) {
        void checkHealth();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkHealth, enabled, pollIntervalMs]);

  const sendMessage = useCallback(async (payload: BlobChatBridgeSendPayload): Promise<{ text: string }> => {
    setLoading(true);
    try {
      const response = await fetch(chatApiUrl('/api/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = (await readJsonSafe(response)) as { ok?: boolean; error?: string; text?: string };
      if (!response.ok || json.ok === false) {
        throw new Error(json.error || `Bridge send failed (${response.status})`);
      }
      setError(null);
      return { text: typeof json.text === 'string' ? json.text : '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bridge send failed.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [readJsonSafe]);

  const unlockChat = useCallback(async (sessionId: string, phrase: string): Promise<boolean> => {
    try {
      const response = await fetch(chatApiUrl('/api/chat/unlock'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, phrase })
      });
      const json = (await readJsonSafe(response)) as {
        ok?: boolean;
        unlocked?: boolean;
        error?: string;
        requiresUnlock?: boolean;
      };
      setRequiresUnlock(json.requiresUnlock === true);
      if (!response.ok || json.ok === false || json.unlocked !== true) {
        setError(json.error || 'Invalid secret words.');
        return false;
      }
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock request failed.');
      return false;
    }
  }, [readJsonSafe]);

  return {
    available,
    requiresUnlock,
    loading,
    error,
    sendMessage,
    unlockChat,
    refreshHealth: checkHealth
  };
}
