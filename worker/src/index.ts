export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  TEXTURE_BUCKET: R2Bucket;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  ART_ONLY_GUARD?: string;
  SOUL_PROMPT?: string;
  DEFAULT_MAX_PRINTS?: string;
  CHAT_UNLOCK_PHRASE?: string;
  CHAT_UNLOCK_TTL_SEC?: string;
  CORS_ALLOW_ORIGINS?: string;
  TEXTURE_WRITE_TOKEN?: string;
  RATE_LIMIT_CHAT_PER_MIN?: string;
  RATE_LIMIT_UNLOCK_PER_MIN?: string;
  RATE_LIMIT_TEXTURE_PUT_PER_MIN?: string;
  MAX_CHAT_TEXT_LENGTH?: string;
  MAX_SYSTEM_PROMPT_LENGTH?: string;
  MAX_TEXTURE_UPLOAD_BYTES?: string;
}

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

type ChatPayload = {
  sessionId: string;
  text: string;
  trigger: 'visitor' | 'collision';
  blobId: string;
  blobLabel: string;
  systemPrompt?: string;
  history?: ChatHistoryItem[];
  unlockPhrase?: string;
};

const DEFAULT_ART_GUARD =
  'You are an art-focused assistant in a virtual gallery. Only discuss art, artworks, curation, media, aesthetics, interpretation, art process, and art history. If asked about unrelated topics, briefly redirect to art perspective.';

const DEFAULT_CHAT_RATE_LIMIT_PER_MIN = 24;
const DEFAULT_UNLOCK_RATE_LIMIT_PER_MIN = 12;
const DEFAULT_TEXTURE_PUT_RATE_LIMIT_PER_MIN = 20;
const DEFAULT_CHAT_TEXT_MAX_CHARS = 2400;
const DEFAULT_SYSTEM_PROMPT_MAX_CHARS = 4000;
const DEFAULT_TEXTURE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

const unlockedSessionMemory = new Map<string, number>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-api-key'
    }
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseIntEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Math.floor(parsed), min, max);
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function normalizeHistory(history: unknown): ChatHistoryItem[] {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const role = (item as Record<string, unknown>).role;
      const content = (item as Record<string, unknown>).content;
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
      const text = content.trim();
      if (!text) return null;
      return { role, content: text } as ChatHistoryItem;
    })
    .filter((item): item is ChatHistoryItem => item !== null);
}

function normalizeUnlockPhrase(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isUnlockValid(env: Env, candidate: unknown): boolean {
  const configured = normalizeUnlockPhrase(env.CHAT_UNLOCK_PHRASE || '');
  if (!configured) return true;
  return normalizeUnlockPhrase(candidate) === configured;
}

function unlockTtlSec(env: Env): number {
  const parsed = Number(env.CHAT_UNLOCK_TTL_SEC || 8 * 60 * 60);
  if (!Number.isFinite(parsed)) return 8 * 60 * 60;
  return Math.max(60, Math.floor(parsed));
}

function getAllowedOrigins(env: Env): string[] {
  return String(env.CORS_ALLOW_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const allowed = getAllowedOrigins(env);
  if (allowed.length === 0) return true;
  const origin = (request.headers.get('origin') || '').trim();
  if (!origin) return true;
  return allowed.includes(origin);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getClientFingerprint(request: Request): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown-ip';
  const ua = request.headers.get('user-agent') || 'unknown-ua';
  return sha256Hex(`${ip}|${ua}`);
}

function unlockCacheKey(sessionId: string, clientFingerprint: string): string {
  return `chat:unlock:${sessionId}:${clientFingerprint}`;
}

async function markSessionUnlocked(env: Env, sessionId: string, clientFingerprint: string): Promise<void> {
  const ttl = unlockTtlSec(env);
  const key = unlockCacheKey(sessionId, clientFingerprint);
  if (env.CACHE) {
    await env.CACHE.put(key, '1', { expirationTtl: ttl });
    return;
  }
  unlockedSessionMemory.set(key, Date.now() + ttl * 1000);
}

async function isSessionUnlocked(env: Env, sessionId: string, clientFingerprint: string): Promise<boolean> {
  const configured = normalizeUnlockPhrase(env.CHAT_UNLOCK_PHRASE || '');
  if (!configured) return true;
  if (!sessionId || !clientFingerprint) return false;
  const key = unlockCacheKey(sessionId, clientFingerprint);
  if (env.CACHE) {
    const val = await env.CACHE.get(key);
    return val === '1';
  }
  const exp = unlockedSessionMemory.get(key);
  if (!exp) return false;
  if (Date.now() > exp) {
    unlockedSessionMemory.delete(key);
    return false;
  }
  return true;
}

function isSafeSessionId(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function isSafeStorageKey(key: string): boolean {
  if (!key || key.length > 200) return false;
  if (key.includes('..') || key.startsWith('/')) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(key);
}

function normalizeContentType(raw: string | null): string {
  return String(raw || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

function isAllowedTextureContentType(contentType: string): boolean {
  if (!contentType) return true;
  if (contentType.startsWith('image/')) return true;
  return [
    'application/octet-stream',
    'application/ktx2',
    'model/gltf-binary',
    'model/gltf+json',
    'application/gltf-buffer'
  ].includes(contentType);
}

function readBearerOrApiKey(request: Request): string {
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return (request.headers.get('x-api-key') || '').trim();
}

function isTextureWriteAuthorized(request: Request, env: Env): boolean {
  const configured = (env.TEXTURE_WRITE_TOKEN || '').trim();
  if (!configured) return false;
  const provided = readBearerOrApiKey(request);
  return Boolean(provided) && provided === configured;
}

async function checkRateLimit(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  if (!env.CACHE) return true;
  const current = Number(await env.CACHE.get(key) || '0');
  const next = current + 1;
  await env.CACHE.put(key, String(next), { expirationTtl: windowSec });
  return next <= limit;
}

async function guardRateLimit(
  env: Env,
  request: Request,
  action: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  const fingerprint = await getClientFingerprint(request);
  return checkRateLimit(env, `rate:${action}:${fingerprint}`, limit, windowSec);
}

async function generateBlobReply(env: Env, payload: ChatPayload): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret in worker.');
  }
  const history = normalizeHistory(payload.history).slice(-12);
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';
  const guard = env.ART_ONLY_GUARD || DEFAULT_ART_GUARD;
  const soulPrompt = (env.SOUL_PROMPT || '').trim();
  const messages = [
    { role: 'system', content: guard },
    ...(soulPrompt ? [{ role: 'system', content: soulPrompt }] : []),
    ...(payload.systemPrompt?.trim() ? [{ role: 'system', content: payload.systemPrompt.trim() }] : []),
    ...history,
    { role: 'user', content: payload.text.trim() }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7
    })
  });
  const body = await response.json<{
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  }>();
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI HTTP ${response.status}`);
  }
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned empty content.');
  return text;
}

async function insertMessage(env: Env, args: {
  sessionId: string;
  blobId: string;
  role: 'visitor' | 'blob';
  content: string;
  trigger: 'visitor' | 'collision';
}) {
  if (!env.DB) {
    throw new Error('D1 binding "DB" is not configured.');
  }
  const result = await env.DB.prepare(
    `INSERT INTO chat_messages (session_id, blob_id, role, content, trigger) VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(args.sessionId, args.blobId, args.role, args.content, args.trigger)
    .run();
  return Number(result.meta.last_row_id || 0);
}

function createPrintPlacement(seed: number) {
  const surfaces = ['north', 'south', 'east', 'west', 'floor'] as const;
  const surface = surfaces[Math.abs(seed) % surfaces.length];
  return {
    surface,
    u: Math.random(),
    v: Math.random(),
    rotation: (Math.random() - 0.5) * 0.4,
    scale: clamp(0.8 + Math.random() * 0.8, 0.75, 1.7),
    color: '#ece6dc',
    opacity: clamp(0.68 + Math.random() * 0.25, 0.6, 0.93)
  };
}

async function insertPrintFromMessage(env: Env, args: {
  messageId: number;
  sessionId: string;
  blobId: string;
  blobLabel: string;
  text: string;
}) {
  if (!env.DB) {
    throw new Error('D1 binding "DB" is not configured.');
  }
  const placement = createPrintPlacement(args.messageId);
  await env.DB.prepare(
    `INSERT INTO surface_prints
      (message_id, session_id, blob_id, blob_label, text, surface, u, v, rotation, scale, color, opacity)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  )
    .bind(
      args.messageId,
      args.sessionId,
      args.blobId,
      args.blobLabel,
      args.text,
      placement.surface,
      placement.u,
      placement.v,
      placement.rotation,
      placement.scale,
      placement.color,
      placement.opacity
    )
    .run();
}

async function listPrints(env: Env, limit: number) {
  if (!env.DB) {
    throw new Error('D1 binding "DB" is not configured.');
  }
  const safeLimit = clamp(limit, 1, Number(env.DEFAULT_MAX_PRINTS || 1500));
  const cacheKey = `prints:latest:${safeLimit}`;
  const cached = env.CACHE ? await env.CACHE.get(cacheKey) : null;
  if (cached) {
    return JSON.parse(cached) as Array<Record<string, unknown>>;
  }
  const rows = await env.DB.prepare(
    `SELECT id, message_id as messageId, session_id as sessionId, blob_id as blobId, blob_label as blobLabel,
            text, surface, u, v, rotation, scale, color, opacity, created_at as createdAt
     FROM surface_prints
     ORDER BY id DESC
     LIMIT ?1`
  )
    .bind(safeLimit)
    .all<Record<string, unknown>>();
  const result = rows.results || [];
  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 });
  }
  return result;
}

async function invalidatePrintCache(env: Env) {
  if (!env.CACHE) return;
  const limits = [100, 250, 500, 1000, 1500];
  await Promise.all(limits.map((limit) => env.CACHE.delete(`prints:latest:${limit}`)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return json({ ok: true });
    }

    if (!isOriginAllowed(request, env)) {
      return json({ ok: false, error: 'Origin not allowed.' }, 403);
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({
        ok: true,
        mode: 'worker-api',
        configured: Boolean(env.OPENAI_API_KEY),
        hasD1: Boolean(env.DB),
        hasKV: Boolean(env.CACHE),
        hasR2: Boolean(env.TEXTURE_BUCKET)
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/chat/health') {
      return json({
        ok: true,
        configured: Boolean(env.OPENAI_API_KEY),
        error: env.OPENAI_API_KEY ? null : 'Missing OPENAI_API_KEY secret in worker.',
        mode: 'worker-api',
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
        requiresUnlock: normalizeUnlockPhrase(env.CHAT_UNLOCK_PHRASE || '').length > 0
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/chat/unlock') {
      const unlockLimit = parseIntEnv(env.RATE_LIMIT_UNLOCK_PER_MIN, DEFAULT_UNLOCK_RATE_LIMIT_PER_MIN, 1, 1200);
      const unlockAllowed = await guardRateLimit(env, request, 'unlock', unlockLimit, 60);
      if (!unlockAllowed) {
        return json({ ok: false, unlocked: false, error: 'Too many unlock attempts. Try again shortly.' }, 429);
      }

      const payload = await readJson<{ sessionId?: string; phrase?: string }>(request);
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : '';
      if (!isSafeSessionId(sessionId)) {
        return json({ ok: false, unlocked: false, error: 'sessionId is invalid.' }, 400);
      }
      if (!isUnlockValid(env, payload?.phrase || '')) {
        return json({ ok: false, unlocked: false, error: 'Invalid secret words.' }, 403);
      }
      const clientFingerprint = await getClientFingerprint(request);
      await markSessionUnlocked(env, sessionId, clientFingerprint);
      return json({
        ok: true,
        unlocked: true,
        requiresUnlock: normalizeUnlockPhrase(env.CHAT_UNLOCK_PHRASE || '').length > 0
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/prints') {
      try {
        const limit = Number(url.searchParams.get('limit') || 500);
        const prints = await listPrints(env, Number.isFinite(limit) ? limit : 500);
        return json({ ok: true, prints });
      } catch (err) {
        return json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'Failed to list prints'
          },
          500
        );
      }
    }

    if (request.method === 'POST' && (url.pathname === '/api/chat' || url.pathname === '/api/chat/send')) {
      const chatLimit = parseIntEnv(env.RATE_LIMIT_CHAT_PER_MIN, DEFAULT_CHAT_RATE_LIMIT_PER_MIN, 1, 1200);
      const chatAllowed = await guardRateLimit(env, request, 'chat_send', chatLimit, 60);
      if (!chatAllowed) {
        return json({ ok: false, error: 'Rate limit exceeded. Please wait before sending another message.' }, 429);
      }

      const payload = await readJson<ChatPayload>(request);
      if (!payload || !payload.sessionId || !payload.text || !payload.blobId || !payload.blobLabel) {
        return json({ ok: false, error: 'Invalid payload.' }, 400);
      }

      const sessionId = payload.sessionId.trim();
      const text = payload.text.trim();
      const blobId = payload.blobId.trim();
      const blobLabel = payload.blobLabel.trim();
      const chatTextMax = parseIntEnv(env.MAX_CHAT_TEXT_LENGTH, DEFAULT_CHAT_TEXT_MAX_CHARS, 32, 12000);
      const systemPromptMax = parseIntEnv(env.MAX_SYSTEM_PROMPT_LENGTH, DEFAULT_SYSTEM_PROMPT_MAX_CHARS, 128, 16000);

      if (!isSafeSessionId(sessionId)) {
        return json({ ok: false, error: 'sessionId is invalid.' }, 400);
      }
      if (!text || text.length > chatTextMax) {
        return json({ ok: false, error: `text must be 1..${chatTextMax} characters.` }, 400);
      }
      if (!blobId || blobId.length > 80 || !/^[A-Za-z0-9._:-]+$/.test(blobId)) {
        return json({ ok: false, error: 'blobId is invalid.' }, 400);
      }
      if (!blobLabel || blobLabel.length > 120) {
        return json({ ok: false, error: 'blobLabel is invalid.' }, 400);
      }
      if (payload.systemPrompt && payload.systemPrompt.length > systemPromptMax) {
        return json({ ok: false, error: `systemPrompt exceeds ${systemPromptMax} characters.` }, 400);
      }

      const clientFingerprint = await getClientFingerprint(request);
      if (!(await isSessionUnlocked(env, sessionId, clientFingerprint))) {
        return json({ ok: false, error: 'Chat is locked. Unlock this session first.', code: 'UNAUTHORIZED_CHAT' }, 403);
      }

      const safePayload: ChatPayload = {
        ...payload,
        sessionId,
        text,
        blobId,
        blobLabel,
        systemPrompt: payload.systemPrompt?.trim()
      };

      try {
        const visitorId = await insertMessage(env, {
          sessionId: safePayload.sessionId,
          blobId: safePayload.blobId,
          role: 'visitor',
          content: safePayload.text,
          trigger: safePayload.trigger
        });
        const reply = await generateBlobReply(env, safePayload);
        const blobMsgId = await insertMessage(env, {
          sessionId: safePayload.sessionId,
          blobId: safePayload.blobId,
          role: 'blob',
          content: reply,
          trigger: safePayload.trigger
        });
        await insertPrintFromMessage(env, {
          messageId: blobMsgId,
          sessionId: safePayload.sessionId,
          blobId: safePayload.blobId,
          blobLabel: safePayload.blobLabel,
          text: reply
        });
        await invalidatePrintCache(env);
        return json({ ok: true, text: reply, visitorMessageId: visitorId, blobMessageId: blobMsgId });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : 'Chat failed' }, 502);
      }
    }

    if (request.method === 'PUT' && url.pathname.startsWith('/api/textures/')) {
      const textureWriteLimit = parseIntEnv(
        env.RATE_LIMIT_TEXTURE_PUT_PER_MIN,
        DEFAULT_TEXTURE_PUT_RATE_LIMIT_PER_MIN,
        1,
        1200
      );
      const textureWriteAllowed = await guardRateLimit(env, request, 'texture_put', textureWriteLimit, 60);
      if (!textureWriteAllowed) {
        return json({ ok: false, error: 'Rate limit exceeded for texture uploads.' }, 429);
      }

      if (!isTextureWriteAuthorized(request, env)) {
        return json({ ok: false, error: 'Unauthorized texture upload.' }, 401);
      }

      const key = url.pathname.replace('/api/textures/', '').trim();
      if (!isSafeStorageKey(key)) {
        return json({ ok: false, error: 'Texture key is invalid.' }, 400);
      }
      if (!request.body) {
        return json({ ok: false, error: 'Missing upload body.' }, 400);
      }

      const maxTextureBytes = parseIntEnv(
        env.MAX_TEXTURE_UPLOAD_BYTES,
        DEFAULT_TEXTURE_UPLOAD_MAX_BYTES,
        1024,
        1024 * 1024 * 256
      );
      const contentLength = Number(request.headers.get('content-length') || '0');
      if (Number.isFinite(contentLength) && contentLength > 0 && contentLength > maxTextureBytes) {
        return json({ ok: false, error: `Texture exceeds ${maxTextureBytes} bytes.` }, 413);
      }

      const contentType = normalizeContentType(request.headers.get('content-type'));
      if (!isAllowedTextureContentType(contentType)) {
        return json({ ok: false, error: `Unsupported content-type: ${contentType}` }, 415);
      }

      await env.TEXTURE_BUCKET.put(key, request.body, {
        httpMetadata: { contentType }
      });
      return json({ ok: true, key });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/textures/')) {
      const key = url.pathname.replace('/api/textures/', '').trim();
      if (!isSafeStorageKey(key)) return json({ ok: false, error: 'Texture key is invalid.' }, 400);
      const object = await env.TEXTURE_BUCKET.get(key);
      if (!object) return json({ ok: false, error: 'Not found' }, 404);
      return new Response(object.body, {
        headers: {
          'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
          'cache-control': 'public, max-age=60',
          'access-control-allow-origin': '*'
        }
      });
    }

    return json({ ok: false, error: 'Not found' }, 404);
  }
};
