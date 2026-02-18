import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFromFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFromFile(path.resolve(process.cwd(), 'server/.env'));
const SOUL_PATH = path.resolve(process.cwd(), 'SOUL.md');

const PORT = Number(process.env.CHAT_BRIDGE_PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 45000);
const CHAT_UNLOCK_PHRASE = (process.env.CHAT_UNLOCK_PHRASE || '').trim();
const CHAT_UNLOCK_TTL_MS = Number(process.env.CHAT_UNLOCK_TTL_MS || 8 * 60 * 60 * 1000);
const CORS_ALLOW_ORIGINS = String(process.env.CORS_ALLOW_ORIGINS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const RATE_LIMIT_CHAT_PER_MIN = Math.max(1, Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 24));
const RATE_LIMIT_UNLOCK_PER_MIN = Math.max(1, Number(process.env.RATE_LIMIT_UNLOCK_PER_MIN || 12));
const MAX_CHAT_TEXT_LENGTH = Math.max(32, Number(process.env.MAX_CHAT_TEXT_LENGTH || 2400));

const MIRROR_TO_TELEGRAM = String(process.env.MIRROR_TO_TELEGRAM || '').toLowerCase() === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_THREAD_ID = process.env.TELEGRAM_THREAD_ID || '';
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : '';
const telegramConfigured = TELEGRAM_BOT_TOKEN.length > 0 && TELEGRAM_CHAT_ID.length > 0;

const ART_ONLY_GUARD =
  'You are an art-focused assistant in a virtual gallery. Only discuss art, artworks, curation, media, aesthetics, interpretation, art process, and art history. If asked about unrelated topics, briefly redirect to art perspective.';

let lastBridgeError = '';
const unlockedSessions = new Map();
const rateBuckets = new Map();

function loadSoulPrompt() {
  try {
    if (!fs.existsSync(SOUL_PATH)) return '';
    return fs.readFileSync(SOUL_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

function getCorsOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (CORS_ALLOW_ORIGINS.length === 0) return '*';
  if (!origin) return CORS_ALLOW_ORIGINS[0] || 'null';
  if (CORS_ALLOW_ORIGINS.includes(origin)) return origin;
  return 'null';
}

function isOriginAllowed(req) {
  if (CORS_ALLOW_ORIGINS.length === 0) return true;
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  return CORS_ALLOW_ORIGINS.includes(origin);
}

function json(req, res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  });
  res.end(body);
}

function fingerprintRequest(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket.remoteAddress || 'unknown-ip';
  const ua = String(req.headers['user-agent'] || 'unknown-ua');
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex');
}

function checkRateLimit(req, action, maxPerMinute) {
  const key = `${action}:${fingerprintRequest(req)}`;
  const now = Date.now();
  const windowMs = 60_000;
  const bucket = rateBuckets.get(key) || [];
  const fresh = bucket.filter((ts) => now - ts < windowMs);
  if (fresh.length >= maxPerMinute) {
    rateBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rateBuckets.set(key, fresh);
  return true;
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function telegramApi(method, body) {
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const jsonBody = await response.json();
  if (!response.ok || !jsonBody.ok) {
    const desc = typeof jsonBody.description === 'string' ? jsonBody.description : `HTTP ${response.status}`;
    throw new Error(desc);
  }
  return jsonBody.result;
}

async function mirrorToTelegram(text) {
  if (!MIRROR_TO_TELEGRAM || !telegramConfigured || !text.trim()) return;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text
  };
  if (TELEGRAM_THREAD_ID) {
    payload.message_thread_id = Number(TELEGRAM_THREAD_ID);
  }
  await telegramApi('sendMessage', payload);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const role = entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : null;
      const content = typeof entry.content === 'string' ? entry.content.trim() : '';
      if (!role || !content) return null;
      return { role, content };
    })
    .filter((entry) => entry !== null);
}

function normalizeUnlockPhrase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isUnlockValid(candidate) {
  if (!CHAT_UNLOCK_PHRASE) return true;
  return normalizeUnlockPhrase(candidate) === normalizeUnlockPhrase(CHAT_UNLOCK_PHRASE);
}

function isSafeSessionId(value) {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(String(value || ''));
}

function unlockKey(sessionId, req) {
  return `${sessionId}:${fingerprintRequest(req)}`;
}

function unlockSession(sessionId, req) {
  if (!sessionId) return;
  const ttl = Number.isFinite(CHAT_UNLOCK_TTL_MS) ? Math.max(60_000, CHAT_UNLOCK_TTL_MS) : 8 * 60 * 60 * 1000;
  unlockedSessions.set(unlockKey(sessionId, req), Date.now() + ttl);
}

function isSessionUnlocked(sessionId, req) {
  if (!CHAT_UNLOCK_PHRASE) return true;
  if (!sessionId) return false;
  const key = unlockKey(sessionId, req);
  const exp = unlockedSessions.get(key);
  if (!exp) return false;
  if (Date.now() > exp) {
    unlockedSessions.delete(key);
    return false;
  }
  return true;
}

async function callOpenAI({ systemPrompt, history, text }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing for chat bridge.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5000, OPENAI_TIMEOUT_MS));
  try {
    const soulPrompt = loadSoulPrompt();
    const messages = [
      { role: 'system', content: ART_ONLY_GUARD },
      ...(soulPrompt ? [{ role: 'system', content: soulPrompt }] : []),
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...history,
      { role: 'user', content: text }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    const jsonBody = await response.json();
    if (!response.ok) {
      const err = jsonBody?.error?.message || `OpenAI HTTP ${response.status}`;
      throw new Error(err);
    }
    const textOut = jsonBody?.choices?.[0]?.message?.content;
    if (typeof textOut === 'string' && textOut.trim()) {
      return textOut.trim();
    }
    throw new Error('OpenAI returned an empty assistant message.');
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    json(req, res, 400, { ok: false, error: 'Bad request' });
    return;
  }
  if (req.method === 'OPTIONS') {
    json(req, res, 200, { ok: true });
    return;
  }
  if (!isOriginAllowed(req)) {
    json(req, res, 403, { ok: false, error: 'Origin not allowed.' });
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/api/chat/health') {
    const soulPrompt = loadSoulPrompt();
    json(req, res, 200, {
      ok: true,
      configured: OPENAI_API_KEY.length > 0,
      error: OPENAI_API_KEY.length > 0 ? null : 'Set OPENAI_API_KEY for chat bridge.',
      lastError: lastBridgeError || null,
      mode: 'openai-art-blob-chat',
      model: OPENAI_MODEL,
      soulLoaded: soulPrompt.length > 0,
      telegramMirror: MIRROR_TO_TELEGRAM && telegramConfigured,
      requiresUnlock: CHAT_UNLOCK_PHRASE.length > 0
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat/unlock') {
    if (!checkRateLimit(req, 'unlock', RATE_LIMIT_UNLOCK_PER_MIN)) {
      json(req, res, 429, { ok: false, unlocked: false, error: 'Too many unlock attempts. Try again shortly.' });
      return;
    }

    const body = await parseBody(req);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const phrase = typeof body.phrase === 'string' ? body.phrase : '';
    if (!isSafeSessionId(sessionId)) {
      json(req, res, 400, { ok: false, unlocked: false, error: 'sessionId is invalid.' });
      return;
    }
    if (!isUnlockValid(phrase)) {
      json(req, res, 403, { ok: false, unlocked: false, error: 'Invalid secret words.' });
      return;
    }
    unlockSession(sessionId, req);
    json(req, res, 200, { ok: true, unlocked: true, requiresUnlock: CHAT_UNLOCK_PHRASE.length > 0 });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat/send') {
    if (!checkRateLimit(req, 'chat_send', RATE_LIMIT_CHAT_PER_MIN)) {
      json(req, res, 429, { ok: false, error: 'Rate limit exceeded. Please wait before sending another message.' });
      return;
    }

    const body = await parseBody(req);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const trigger = body.trigger === 'collision' ? 'collision' : 'visitor';
    const blobId = typeof body.blobId === 'string' ? body.blobId : 'blob_alpha';
    const blobLabel = typeof body.blobLabel === 'string' ? body.blobLabel : blobId;
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : '';
    const history = normalizeHistory(body.history);

    if (!isSafeSessionId(sessionId) || !text || text.length > MAX_CHAT_TEXT_LENGTH) {
      json(req, res, 400, { ok: false, error: `sessionId and text (1..${MAX_CHAT_TEXT_LENGTH}) are required.` });
      return;
    }
    if (!isSessionUnlocked(sessionId, req)) {
      json(req, res, 403, { ok: false, error: 'Chat is locked. Unlock this session first.', code: 'UNAUTHORIZED_CHAT' });
      return;
    }

    try {
      const reply = await callOpenAI({ systemPrompt, history, text });
      if (MIRROR_TO_TELEGRAM && telegramConfigured) {
        const sourceLabel = trigger === 'collision' ? `${blobLabel} collision` : `Visitor -> ${blobLabel}`;
        await mirrorToTelegram(`${sourceLabel}: ${text}`);
        await mirrorToTelegram(`${blobLabel}: ${reply}`);
      }
      lastBridgeError = '';
      json(req, res, 200, { ok: true, text: reply, blobId, blobLabel });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to call OpenAI.';
      lastBridgeError = message;
      json(req, res, 502, { ok: false, error: message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/chat/poll') {
    json(req, res, 200, { ok: true, messages: [], lastId: Number(url.searchParams.get('after') || 0) });
    return;
  }

  json(req, res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[chat-bridge] listening on http://localhost:${PORT}`);
  console.log(`[chat-bridge] mode=openai-art-blob-chat model=${OPENAI_MODEL}`);
  if (!OPENAI_API_KEY) {
    console.warn('[chat-bridge] Missing OPENAI_API_KEY.');
  }
  if (MIRROR_TO_TELEGRAM && !telegramConfigured) {
    console.warn('[chat-bridge] MIRROR_TO_TELEGRAM=true but TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are missing.');
  }
});
