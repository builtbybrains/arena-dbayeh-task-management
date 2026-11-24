// Persistence boundary. Two implementations:
//
// - sampleRepository: the presentation demo. Fictional data, this browser only.
// - cloudRepository: the real workspace. Every change is sent as individual
//   records to the tiny sync API (worker/index.js, Cloudflare D1 free plan),
//   and every phone pulls what changed since its last pull. A copy is kept in
//   the browser so the app opens instantly and keeps working offline.
//
// Moving to Supabase later means writing a third implementation of this
// interface; the screens do not change (see README).

import { create } from "zustand";
import { COLLECTIONS, type Collection, type Database } from "./types";

export interface DataRepository {
  kind: "sample" | "cloud";
  load(): Database | null;
  /** Persist `next`. `prev` lets the cloud version send only what changed. */
  save(next: Database, prev: Database | null): void;
  clear(): void;
  /** Called when another tab or device changes the data. */
  subscribe(listener: (db: Database) => void): () => void;
}

export function emptyDb(version: number): Database {
  return {
    version,
    seeded_at: new Date().toISOString(),
    workspace: null,
    users: [],
    departments: [],
    restaurants: [],
    tasks: [],
    sessions: [],
    logs: [],
    daily_reports: [],
    executive_reports: [],
    events: [],
    walkins: [],
    revenue: [],
    reminders: [],
    recurring: [],
    mm_pickups: [],
    mm_cash: [],
    mm_transfers: [],
    mm_expenses: [],
  };
}

/** Fills collections added after a copy was saved, so older copies keep working. */
export function normalize(db: Database): Database {
  const empty = emptyDb(db.version);
  let out = db;
  for (const c of COLLECTIONS) {
    if (!Array.isArray(db[c])) {
      if (out === db) out = { ...db };
      (out as unknown as Record<string, unknown>)[c] = empty[c];
    }
  }
  return out;
}

// --- Sample (this browser only) ----------------------------------------------

const SAMPLE_KEY = "arena-os-sample-v3";

export const sampleRepository: DataRepository = {
  kind: "sample",
  load() {
    try {
      const raw = localStorage.getItem(SAMPLE_KEY);
      return raw ? normalize(JSON.parse(raw) as Database) : null;
    } catch {
      return null;
    }
  },
  save(db) {
    try {
      localStorage.setItem(SAMPLE_KEY, JSON.stringify(db));
    } catch {
      // Storage full or blocked: the demo keeps working in memory.
    }
  },
  clear() {
    try {
      localStorage.removeItem(SAMPLE_KEY);
    } catch {
      // nothing to clear
    }
  },
  subscribe(listener) {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SAMPLE_KEY || !e.newValue) return;
      try {
        listener(normalize(JSON.parse(e.newValue) as Database));
      } catch {
        // ignore a half-written value
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
};

// --- Cloud (shared between every phone) ----------------------------------------

/** Where the sync API lives: same site in production, the deployed worker in `next dev`. */
const API = (process.env.NEXT_PUBLIC_SYNC_URL ?? "").replace(/\/$/, "");
const CACHE_KEY = "arena-os-workspace-v1";
const POLL_MS = 8_000;
const BATCH = 300;

interface WireRecord {
  c: Collection | "meta";
  id: string;
  d: string | null;
}

interface Cache {
  epoch: number;
  rev: number;
  db: Database;
  pending: WireRecord[];
}

export type SyncStatus = "loading" | "synced" | "syncing" | "offline" | "error";

/** Sync state for the status dot in the top bar. */
export const useSync = create<{ status: SyncStatus; lastSync: number | null; pending: number }>(() => ({
  status: "loading",
  lastSync: null,
  pending: 0,
}));

const key = (r: { c: string; id: string }) => `${r.c}/${r.id}`;

/** Records that differ between two versions of the database. */
export function diff(prev: Database | null, next: Database): WireRecord[] {
  const out: WireRecord[] = [];
  if (next.workspace && next.workspace !== prev?.workspace) {
    out.push({ c: "meta", id: "workspace", d: JSON.stringify(next.workspace) });
  }
  for (const c of COLLECTIONS) {
    const a = prev?.[c] as { id: string }[] | undefined;
    const b = next[c] as { id: string }[];
    if (a === b) continue;
    const before = new Map((a ?? []).map((x) => [x.id, x]));
    for (const item of b) if (before.get(item.id) !== item) out.push({ c, id: item.id, d: JSON.stringify(item) });
  }
  return out;
}

/** Applies records from the server onto a database, replacing by id. */
function apply(db: Database, records: WireRecord[], skip: Set<string>): Database {
  if (records.length === 0) return db;
  const next: Database = { ...db };
  const touched = new Map<Collection, Map<string, unknown>>();
  for (const r of records) {
    if (skip.has(key(r)) || r.d === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(r.d);
    } catch {
      continue;
    }
    if (r.c === "meta") {
      if (r.id === "workspace") next.workspace = value as Database["workspace"];
      continue;
    }
    if (!(COLLECTIONS as readonly string[]).includes(r.c)) continue;
    let m = touched.get(r.c);
    if (!m) touched.set(r.c, (m = new Map()));
    m.set(r.id, value);
  }
  for (const [c, m] of touched) {
    const list = (db[c] as { id: string }[]).map((x) => {
      const v = m.get(x.id);
      if (v === undefined) return x;
      m.delete(x.id);
      return v as { id: string };
    });
    for (const v of m.values()) list.push(v as { id: string });
    (next as unknown as Record<string, unknown>)[c] = list;
  }
  return next;
}

export function createCloudRepository(version: number): DataRepository & {
  start(): Promise<void>;
  pullNow(): Promise<void>;
  erase(): Promise<void>;
} {
  let cache: Cache = { epoch: 0, rev: 0, db: emptyDb(version), pending: [] };
  let listener: ((db: Database) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let pulling = false;
  let started = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const persist = () => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Storage full: everything still works while the page is open.
    }
  };
  const status = (s: SyncStatus) =>
    useSync.setState({ status: s, pending: cache.pending.length, ...(s === "synced" ? { lastSync: Date.now() } : {}) });

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Cache;
      if (c.db && c.db.version === version) cache = { ...c, db: normalize(c.db), pending: c.pending ?? [] };
    }
  } catch {
    // start fresh
  }

  async function resetTo(epoch: number) {
    cache = { epoch, rev: 0, db: emptyDb(version), pending: [] };
    persist();
    listener?.(cache.db);
  }

  async function pull() {
    if (pulling) return;
    pulling = true;
    try {
      const res = await fetch(`${API}/api/sync?since=${cache.rev}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { epoch: number; rev: number; records: WireRecord[] };
      if (cache.epoch && body.epoch !== cache.epoch) {
        // The Owner erased the workspace: start again from the server.
        await resetTo(body.epoch);
        pulling = false;
        return pull();
      }
      cache.epoch = body.epoch;
      const skip = new Set(cache.pending.map(key));
      const next = apply(cache.db, body.records, skip);
      cache.rev = body.rev;
      const changed = next !== cache.db;
      cache.db = next;
      persist();
      if (changed) listener?.(next);
      failures = 0;
      status(cache.pending.length ? "syncing" : "synced");
    } catch {
      failures++;
      status("offline");
    } finally {
      pulling = false;
    }
  }

  async function flush() {
    if (flushing || cache.pending.length === 0) return;
    flushing = true;
    status("syncing");
    try {
      while (cache.pending.length) {
        const batch = cache.pending.slice(0, BATCH);
        const res = await fetch(`${API}/api/sync`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ epoch: cache.epoch || undefined, records: batch }),
        });
        if (res.status === 409) {
          const body = (await res.json()) as { epoch: number };
          await resetTo(body.epoch);
          break;
        }
        if (!res.ok) throw new Error(String(res.status));
        // Drop exactly what was sent; anything that changed again while this
        // batch was in flight is a new object and stays queued.
        const sent = new Set(batch);
        cache.pending = cache.pending.filter((r) => !sent.has(r));
        persist();
      }
      failures = 0;
      flushing = false;
      await pull();
    } catch {
      failures++;
      flushing = false;
      status("offline");
      scheduleFlush(Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4)));
    }
  }

  function scheduleFlush(delay = 250) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, delay);
  }

  function loop() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!document.hidden) {
        if (cache.pending.length) await flush();
        else await pull();
      }
      loop();
    }, failures ? Math.min(60_000, POLL_MS * 2 ** Math.min(failures, 3)) : POLL_MS);
  }

  return {
    kind: "cloud",
    load: () => cache.db,
    save(next, prev) {
      const records = diff(prev ?? cache.db, next);
      cache.db = next;
      if (records.length) {
        const fresh = new Set(records.map(key));
        cache.pending = [...cache.pending.filter((r) => !fresh.has(key(r))), ...records];
        status("syncing");
        scheduleFlush();
      }
      persist();
    },
    clear() {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        // nothing to clear
      }
    },
    subscribe(l) {
      listener = l;
      return () => {
        if (listener === l) listener = null;
      };
    },
    async start() {
      if (started) return;
      started = true;
      const wake = () => {
        if (!document.hidden) void (cache.pending.length ? flush() : pull());
      };
      document.addEventListener("visibilitychange", wake);
      window.addEventListener("online", wake);
      window.addEventListener("focus", wake);
      if (cache.pending.length) await flush();
      else await pull();
      loop();
    },
    pullNow: pull,
    async erase() {
      const res = await fetch(`${API}/api/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epoch: cache.epoch }),
      });
      if (!res.ok && res.status !== 409) throw new Error("Could not reach the server. Check the connection and try again.");
      const body = (await res.json()) as { epoch: number };
      await resetTo(body.epoch);
    },
  };
}

/** True when this browser already holds a copy of the real workspace. */
export function hasWorkspaceCache(): boolean {
  try {
    return !!localStorage.getItem(CACHE_KEY);
  } catch {
    return false;
  }
}
