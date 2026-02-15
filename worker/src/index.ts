export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  TEXTURE_BUCKET: R2Bucket;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  ART_ONLY_GUARD?: string;
  SOUL_PROMPT?: string;
  DEFAULT_MAX_PRINTS?: string;
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
};

const DEFAULT_ART_GUARD =
  'You are an art-focused assistant in a virtual gallery. Only discuss art, artworks, curation, media, aesthetics, interpretation, art process, and art history. If asked about unrelated topics, briefly redirect to art perspective.';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type'
    }
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
  // Small namespace, cheap brute-force invalidation pattern key range is not available.
  // We only use a few known limits.
  const limits = [100, 250, 500, 1000, 1500];
  await Promise.all(limits.map((limit) => env.CACHE.delete(`prints:latest:${limit}`)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return json({ ok: true });
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
        model: env.OPENAI_MODEL || 'gpt-4o-mini'
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
      const payload = await readJson<ChatPayload>(request);
      if (!payload || !payload.sessionId || !payload.text || !payload.blobId || !payload.blobLabel) {
        return json({ ok: false, error: 'Invalid payload.' }, 400);
      }

      try {
        const visitorId = await insertMessage(env, {
          sessionId: payload.sessionId,
          blobId: payload.blobId,
          role: 'visitor',
          content: payload.text.trim(),
          trigger: payload.trigger
        });
        const reply = await generateBlobReply(env, payload);
        const blobMsgId = await insertMessage(env, {
          sessionId: payload.sessionId,
          blobId: payload.blobId,
          role: 'blob',
          content: reply,
          trigger: payload.trigger
        });
        await insertPrintFromMessage(env, {
          messageId: blobMsgId,
          sessionId: payload.sessionId,
          blobId: payload.blobId,
          blobLabel: payload.blobLabel,
          text: reply
        });
        await invalidatePrintCache(env);
        return json({ ok: true, text: reply, visitorMessageId: visitorId, blobMessageId: blobMsgId });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : 'Chat failed' }, 502);
      }
    }

    if (request.method === 'PUT' && url.pathname.startsWith('/api/textures/')) {
      const key = url.pathname.replace('/api/textures/', '').trim();
      if (!key) return json({ ok: false, error: 'Texture key required.' }, 400);
      const contentType = request.headers.get('content-type') || 'application/octet-stream';
      await env.TEXTURE_BUCKET.put(key, request.body, {
        httpMetadata: { contentType }
      });
      return json({ ok: true, key });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/textures/')) {
      const key = url.pathname.replace('/api/textures/', '').trim();
      if (!key) return json({ ok: false, error: 'Texture key required.' }, 400);
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
