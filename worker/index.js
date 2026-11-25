// Arena OS sync API: the only server code. It stores app records as JSON rows
// in Cloudflare D1 (free plan) and serves the static app, which
// scripts/bundle-assets.mjs packs into assets.gen.js.
//
//   GET  /api/sync?since=REV   -> { epoch, rev, records: [{ c, id, d }] }
//   POST /api/sync { records }  -> { epoch, rev }
//   POST /api/reset { epoch }   -> wipes everything, bumps the epoch
//
// There is no sign-in here: this is a trial setup. Anyone with the link can
// read and write. Move to Supabase (see README) before using it for real.

import ASSETS from "./assets.gen.js";
import { checkInstagram, handleInstagram } from "./instagram.js";

const MAX_BATCH = 400;
const COLLECTIONS = new Set([
  "meta", "venues", "users", "departments", "restaurants", "tasks", "sessions", "logs",
  "daily_reports", "executive_reports", "events", "walkins", "revenue",
  "reminders", "recurring",
]);

const MAX_RECORD = 200_000; // characters of JSON per record

// Allows `next dev` on another origin (NEXT_PUBLIC_SYNC_URL) to use this API.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });

async function readMeta(db) {
  const { results } = await db.prepare("SELECT k, v FROM meta").all();
  const m = Object.fromEntries(results.map((r) => [r.k, r.v]));
  return { epoch: Number(m.epoch ?? 1), rev: Number(m.rev ?? 0) };
}

async function pull(db, url) {
  const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
  const meta = await readMeta(db);
  const { results } = await db
    .prepare("SELECT c, id, d, rev FROM records WHERE rev > ?1 AND rev <= ?2")
    .bind(since, meta.rev)
    .all();
  return json({ ...meta, records: results.map((r) => ({ c: r.c, id: r.id, d: r.d })) });
}

async function push(db, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  const records = Array.isArray(body?.records) ? body.records : [];
  if (records.length === 0) return json(await readMeta(db));
  if (records.length > MAX_BATCH) return json({ error: "Too many records" }, 413);
  for (const r of records) {
    if (!COLLECTIONS.has(r?.c) || typeof r.id !== "string" || r.id.length > 120) {
      return json({ error: "Bad record" }, 400);
    }
    if (r.d !== null && typeof r.d !== "string") return json({ error: "Bad record" }, 400);
    if (typeof r.d === "string" && r.d.length > MAX_RECORD) return json({ error: "Record too large" }, 413);
  }
  const meta = await readMeta(db);
  if (body.epoch && Number(body.epoch) !== meta.epoch) return json({ error: "reset", ...meta }, 409);
  // One transaction: bump the counter, then write every record at that rev.
  const stmts = [db.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev'")];
  const upsert = db.prepare(
    "INSERT INTO records (c, id, d, rev) VALUES (?1, ?2, ?3, (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev')) " +
      "ON CONFLICT (c, id) DO UPDATE SET d = excluded.d, rev = excluded.rev",
  );
  for (const r of records) stmts.push(upsert.bind(r.c, r.id, r.d));
  await db.batch(stmts);
  return json(await readMeta(db));
}

async function reset(db, request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // empty body
  }
  const meta = await readMeta(db);
  if (Number(body.epoch) !== meta.epoch) return json({ error: "Out of date", ...meta }, 409);
  await db.batch([
    db.prepare("DELETE FROM records"),
    db.prepare("DELETE FROM meta WHERE k LIKE 'ig_%'"),
    db.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'epoch'"),
    db.prepare("UPDATE meta SET v = '0' WHERE k = 'rev'"),
  ]);
  return json(await readMeta(db));
}

const decoded = new Map();

function serveAsset(url) {
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith("/")) path += "index.html";
  let file = ASSETS[path];
  if (!file && !path.includes(".")) {
    // /tasks -> /tasks/ (the export uses trailing slashes)
    if (ASSETS[`${path}/index.html`]) return Response.redirect(`${url.origin}${path}/${url.search}`, 308);
  }
  const status = file ? 200 : 404;
  if (!file) file = ASSETS["/404.html"];
  let body = file.s;
  if (body === undefined) {
    if (!decoded.has(path)) decoded.set(path, Uint8Array.from(atob(file.b), (ch) => ch.charCodeAt(0)));
    body = decoded.get(path);
  }
  const immutable = path.startsWith("/_next/static/");
  return new Response(body, {
    status,
    headers: {
      "content-type": file.t,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

export default {
  // Cron trigger (wrangler.jsonc): check the watched Instagram page.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkInstagram(env.DB));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return serveAsset(url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === "/api/sync" && request.method === "GET") return await pull(env.DB, url);
      if (url.pathname === "/api/sync" && request.method === "POST") return await push(env.DB, request);
      if (url.pathname === "/api/reset" && request.method === "POST") return await reset(env.DB, request);
      if (url.pathname.startsWith("/api/instagram/")) return await handleInstagram(request, env, url, CORS);
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: String(e?.message ?? e) }, 500);
    }
  },
};
