import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

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
const MIRROR_TO_TELEGRAM = String(process.env.MIRROR_TO_TELEGRAM || '').toLowerCase() === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_THREAD_ID = process.env.TELEGRAM_THREAD_ID || '';
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : '';
const telegramConfigured = TELEGRAM_BOT_TOKEN.length > 0 && TELEGRAM_CHAT_ID.length > 0;

const ART_ONLY_GUARD =
  'You are an art-focused assistant in a virtual gallery. Only discuss art, artworks, curation, media, aesthetics, interpretation, art process, and art history. If asked about unrelated topics, briefly redirect to art perspective.';

let lastBridgeError = '';

function loadSoulPrompt() {
  try {
    if (!fs.existsSync(SOUL_PATH)) return '';
    return fs.readFileSync(SOUL_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
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
    json(res, 400, { ok: false, error: 'Bad request' });
    return;
  }
  if (req.method === 'OPTIONS') {
    json(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/api/chat/health') {
    const soulPrompt = loadSoulPrompt();
    json(res, 200, {
      ok: true,
      configured: OPENAI_API_KEY.length > 0,
      error: OPENAI_API_KEY.length > 0 ? null : 'Set OPENAI_API_KEY for chat bridge.',
      lastError: lastBridgeError || null,
      mode: 'openai-art-blob-chat',
      model: OPENAI_MODEL,
      soulLoaded: soulPrompt.length > 0,
      telegramMirror: MIRROR_TO_TELEGRAM && telegramConfigured
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat/send') {
    const body = await parseBody(req);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const trigger = body.trigger === 'collision' ? 'collision' : 'visitor';
    const blobId = typeof body.blobId === 'string' ? body.blobId : 'blob_alpha';
    const blobLabel = typeof body.blobLabel === 'string' ? body.blobLabel : blobId;
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : '';
    const history = normalizeHistory(body.history);
    if (!sessionId || !text) {
      json(res, 400, { ok: false, error: 'sessionId and text are required.' });
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
      json(res, 200, { ok: true, text: reply, blobId, blobLabel });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to call OpenAI.';
      lastBridgeError = message;
      json(res, 502, { ok: false, error: message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/chat/poll') {
    json(res, 200, { ok: true, messages: [], lastId: Number(url.searchParams.get('after') || 0) });
    return;
  }

  json(res, 404, { ok: false, error: 'Not found' });
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
