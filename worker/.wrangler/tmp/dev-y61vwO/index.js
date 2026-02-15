var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var DEFAULT_ART_GUARD = "You are an art-focused assistant in a virtual gallery. Only discuss art, artworks, curation, media, aesthetics, interpretation, art process, and art history. If asked about unrelated topics, briefly redirect to art perspective.";
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
__name(json, "json");
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
__name(clamp, "clamp");
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
__name(readJson, "readJson");
function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((item) => {
    if (!item || typeof item !== "object") return null;
    const role = item.role;
    const content = item.content;
    if (role !== "user" && role !== "assistant" || typeof content !== "string") return null;
    const text = content.trim();
    if (!text) return null;
    return { role, content: text };
  }).filter((item) => item !== null);
}
__name(normalizeHistory, "normalizeHistory");
async function generateBlobReply(env, payload) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY secret in worker.");
  }
  const history = normalizeHistory(payload.history).slice(-12);
  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const guard = env.ART_ONLY_GUARD || DEFAULT_ART_GUARD;
  const soulPrompt = (env.SOUL_PROMPT || "").trim();
  const messages = [
    { role: "system", content: guard },
    ...soulPrompt ? [{ role: "system", content: soulPrompt }] : [],
    ...payload.systemPrompt?.trim() ? [{ role: "system", content: payload.systemPrompt.trim() }] : [],
    ...history,
    { role: "user", content: payload.text.trim() }
  ];
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7
    })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI HTTP ${response.status}`);
  }
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned empty content.");
  return text;
}
__name(generateBlobReply, "generateBlobReply");
async function insertMessage(env, args) {
  if (!env.DB) {
    throw new Error('D1 binding "DB" is not configured.');
  }
  const result = await env.DB.prepare(
    `INSERT INTO chat_messages (session_id, blob_id, role, content, trigger) VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(args.sessionId, args.blobId, args.role, args.content, args.trigger).run();
  return Number(result.meta.last_row_id || 0);
}
__name(insertMessage, "insertMessage");
function createPrintPlacement(seed) {
  const surfaces = ["north", "south", "east", "west", "floor"];
  const surface = surfaces[Math.abs(seed) % surfaces.length];
  return {
    surface,
    u: Math.random(),
    v: Math.random(),
    rotation: (Math.random() - 0.5) * 0.4,
    scale: clamp(0.8 + Math.random() * 0.8, 0.75, 1.7),
    color: "#ece6dc",
    opacity: clamp(0.68 + Math.random() * 0.25, 0.6, 0.93)
  };
}
__name(createPrintPlacement, "createPrintPlacement");
async function insertPrintFromMessage(env, args) {
  if (!env.DB) {
    throw new Error('D1 binding "DB" is not configured.');
  }
  const placement = createPrintPlacement(args.messageId);
  await env.DB.prepare(
    `INSERT INTO surface_prints
      (message_id, session_id, blob_id, blob_label, text, surface, u, v, rotation, scale, color, opacity)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  ).bind(
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
  ).run();
}
__name(insertPrintFromMessage, "insertPrintFromMessage");
async function listPrints(env, limit) {
  if (!env.DB) {
    throw new Error('D1 binding "DB" is not configured.');
  }
  const safeLimit = clamp(limit, 1, Number(env.DEFAULT_MAX_PRINTS || 1500));
  const cacheKey = `prints:latest:${safeLimit}`;
  const cached = env.CACHE ? await env.CACHE.get(cacheKey) : null;
  if (cached) {
    return JSON.parse(cached);
  }
  const rows = await env.DB.prepare(
    `SELECT id, message_id as messageId, session_id as sessionId, blob_id as blobId, blob_label as blobLabel,
            text, surface, u, v, rotation, scale, color, opacity, created_at as createdAt
     FROM surface_prints
     ORDER BY id DESC
     LIMIT ?1`
  ).bind(safeLimit).all();
  const result = rows.results || [];
  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 });
  }
  return result;
}
__name(listPrints, "listPrints");
async function invalidatePrintCache(env) {
  if (!env.CACHE) return;
  const limits = [100, 250, 500, 1e3, 1500];
  await Promise.all(limits.map((limit) => env.CACHE.delete(`prints:latest:${limit}`)));
}
__name(invalidatePrintCache, "invalidatePrintCache");
var src_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        ok: true,
        mode: "worker-api",
        configured: Boolean(env.OPENAI_API_KEY),
        hasD1: Boolean(env.DB),
        hasKV: Boolean(env.CACHE),
        hasR2: Boolean(env.TEXTURE_BUCKET)
      });
    }
    if (request.method === "GET" && url.pathname === "/api/chat/health") {
      return json({
        ok: true,
        configured: Boolean(env.OPENAI_API_KEY),
        error: env.OPENAI_API_KEY ? null : "Missing OPENAI_API_KEY secret in worker.",
        mode: "worker-api",
        model: env.OPENAI_MODEL || "gpt-4o-mini"
      });
    }
    if (request.method === "GET" && url.pathname === "/api/prints") {
      try {
        const limit = Number(url.searchParams.get("limit") || 500);
        const prints = await listPrints(env, Number.isFinite(limit) ? limit : 500);
        return json({ ok: true, prints });
      } catch (err) {
        return json(
          {
            ok: false,
            error: err instanceof Error ? err.message : "Failed to list prints"
          },
          500
        );
      }
    }
    if (request.method === "POST" && (url.pathname === "/api/chat" || url.pathname === "/api/chat/send")) {
      const payload = await readJson(request);
      if (!payload || !payload.sessionId || !payload.text || !payload.blobId || !payload.blobLabel) {
        return json({ ok: false, error: "Invalid payload." }, 400);
      }
      try {
        const visitorId = await insertMessage(env, {
          sessionId: payload.sessionId,
          blobId: payload.blobId,
          role: "visitor",
          content: payload.text.trim(),
          trigger: payload.trigger
        });
        const reply = await generateBlobReply(env, payload);
        const blobMsgId = await insertMessage(env, {
          sessionId: payload.sessionId,
          blobId: payload.blobId,
          role: "blob",
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
        return json({ ok: false, error: err instanceof Error ? err.message : "Chat failed" }, 502);
      }
    }
    if (request.method === "PUT" && url.pathname.startsWith("/api/textures/")) {
      const key = url.pathname.replace("/api/textures/", "").trim();
      if (!key) return json({ ok: false, error: "Texture key required." }, 400);
      const contentType = request.headers.get("content-type") || "application/octet-stream";
      await env.TEXTURE_BUCKET.put(key, request.body, {
        httpMetadata: { contentType }
      });
      return json({ ok: true, key });
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/textures/")) {
      const key = url.pathname.replace("/api/textures/", "").trim();
      if (!key) return json({ ok: false, error: "Texture key required." }, 400);
      const object = await env.TEXTURE_BUCKET.get(key);
      if (!object) return json({ ok: false, error: "Not found" }, 404);
      return new Response(object.body, {
        headers: {
          "content-type": object.httpMetadata?.contentType || "application/octet-stream",
          "cache-control": "public, max-age=60",
          "access-control-allow-origin": "*"
        }
      });
    }
    return json({ ok: false, error: "Not found" }, 404);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-54swtw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-54swtw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
