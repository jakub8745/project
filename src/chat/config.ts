import type { BlobPersona } from './types';
import { DEFAULT_BLOB_CHAT_SETTINGS } from './types';

type ChatTranscriptEntry = {
  role: 'system' | 'visitor' | 'blob';
  text: string;
  senderLabel?: string;
};

export function parseBlobPersonas(chat: Record<string, unknown>): BlobPersona[] {
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
          systemPromptPath:
            typeof record.systemPromptPath === 'string' && record.systemPromptPath.trim()
              ? record.systemPromptPath.trim()
              : undefined,
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

  const legacyId = typeof chat.blobActorId === 'string' ? chat.blobActorId : DEFAULT_BLOB_CHAT_SETTINGS.blobs[0].id;
  const legacyPrompt =
    typeof chat.systemPrompt === 'string' ? chat.systemPrompt : DEFAULT_BLOB_CHAT_SETTINGS.blobs[0].systemPrompt;
  const legacyCollisionPrompt =
    typeof chat.collisionPrompt === 'string' ? chat.collisionPrompt : DEFAULT_BLOB_CHAT_SETTINGS.blobs[0].collisionPrompt;
  const legacyCollisionEnabled =
    typeof chat.blobChatOnCollision === 'boolean'
      ? chat.blobChatOnCollision
      : DEFAULT_BLOB_CHAT_SETTINGS.blobs[0].chatOnCollision;

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

export async function resolveBlobPromptsFromPaths(blobs: BlobPersona[], signal: AbortSignal): Promise<BlobPersona[]> {
  const resolved = await Promise.all(
    blobs.map(async (blob) => {
      if (!blob.systemPromptPath) return blob;
      try {
        const response = await fetch(blob.systemPromptPath, { signal });
        if (!response.ok) return blob;
        const text = (await response.text()).trim();
        if (!text) return blob;
        return { ...blob, systemPrompt: text };
      } catch {
        return blob;
      }
    })
  );
  return resolved;
}

export function resolveBlobFromVisitorText(text: string, blobs: BlobPersona[], fallbackBlobId: string | null) {
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

export function extractLastQuestion(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const matches = normalized.match(/[^?]*\?/g);
  if (!matches || matches.length === 0) return null;
  const candidate = matches[matches.length - 1]?.trim() || '';
  return candidate.length > 1 ? candidate : null;
}

export function getLastChatLine(messages: ChatTranscriptEntry[]): { speaker: string; text: string } | null {
  const last = [...messages].reverse().find((entry) => entry.role === 'visitor' || entry.role === 'blob');
  if (!last || !last.text.trim()) return null;
  const speaker = last.role === 'visitor' ? 'Visitor' : (last.senderLabel || 'Blob');
  return { speaker, text: last.text.trim() };
}
