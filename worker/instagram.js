// Instagram watch: every few minutes, look at a page's latest posts through
// Instagram's official API (Business Discovery) and, for each new one, give
// the chosen people an alert, and optionally a "like and repost" task, inside
// Arena OS. Instagram offers no way to like or repost automatically, so a
// person does that part from the link.
//
// The access token is kept in the `meta` table, which the sync API never
// returns. The watch settings (page, who to alert) are an ordinary synced
// record: meta / instagram_watch.

const GRAPH = "https://graph.facebook.com/v27.0";
const KEYS = ["ig_token", "ig_user_id", "ig_account", "ig_seen", "ig_status", "ig_connected_at"];

async function getMeta(db) {
  const { results } = await db.prepare(`SELECT k, v FROM meta WHERE k IN (${KEYS.map(() => "?").join(",")})`).bind(...KEYS).all();
  return Object.fromEntries(results.map((r) => [r.k, r.v]));
}

const setMeta = (db, k, v) => db.prepare("INSERT INTO meta (k, v) VALUES (?1, ?2) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(k, v);

async function graph(path, token) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error?.message ?? `Instagram answered ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

async function readWatch(db) {
  const row = await db.prepare("SELECT d FROM records WHERE c = 'meta' AND id = 'instagram_watch'").first();
  try {
    return row?.d ? JSON.parse(row.d) : null;
  } catch {
    return null;
  }
}

/** The page's latest posts, newest first. */
async function latestPosts(token, igUserId, username) {
  const fields = `business_discovery.username(${username}){username,media.limit(6){id,caption,media_type,media_url,permalink,timestamp,thumbnail_url}}`;
  const body = await graph(`/${igUserId}?fields=${encodeURIComponent(fields)}`, token);
  return body.business_discovery?.media?.data ?? [];
}

/** Records for one new post: a reminder for each person, a task if asked, the task's log line. */
function alertRecords(post, watch, users, now, test = false) {
  const iso = new Date(now).toISOString();
  const handle = `@${watch.username}`;
  const caption = (post.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  const key = test ? `test_${now}` : post.id;
  const out = [];
  const recipients = (watch.recipients ?? []).filter((id) => users.has(id));
  if (recipients.length) {
    out.push({
      c: "reminders",
      id: `ig_${key}`,
      d: JSON.stringify({
        id: `ig_${key}`,
        title: test ? `Test: Instagram alert for ${handle}` : `New post from ${handle}: like and repost it`,
        note: caption,
        at: iso,
        for_user_ids: recipients,
        created_by: watch.set_by ?? recipients[0],
        event_id: null,
        done_by: [],
        created_at: iso,
        deleted_at: null,
        link: post.permalink ?? `https://www.instagram.com/${watch.username}/`,
      }),
    });
  }
  const to = watch.task_to ? users.get(watch.task_to) : null;
  if (to && !test) {
    const id = `igt_${key}`;
    out.push({
      c: "tasks",
      id,
      d: JSON.stringify({
        id,
        title: `Like and repost ${handle}'s new post`,
        description: `${post.permalink ?? ""}\n\n${caption}`.trim(),
        department_id: to.department_id ?? "ops",
        assigned_by: watch.set_by ?? to.id,
        assigned_to: to.id,
        priority: "high",
        status: "pending",
        due_at: new Date(now + 30 * 60_000).toISOString(),
        estimated_duration: 5,
        category: "Instagram",
        internal_notes: null,
        completion_note: null,
        created_at: iso,
        updated_at: iso,
        completed_at: null,
        display_order: null,
        deleted_at: null,
        event_id: null,
        recurring_id: null,
      }),
    });
    out.push({
      c: "logs",
      id: `igl_${key}`,
      d: JSON.stringify({ id: `igl_${key}`, task_id: id, actor_id: watch.set_by ?? to.id, action: "assigned", previous_value: null, new_value: to.id, created_at: iso }),
    });
  }
  return out;
}

async function usersById(db) {
  const { results } = await db.prepare("SELECT id, d FROM records WHERE c = 'users'").all();
  const m = new Map();
  for (const r of results) {
    try {
      const u = JSON.parse(r.d);
      if (u.active_status) m.set(u.id, u);
    } catch {
      // skip a damaged row
    }
  }
  return m;
}

/** Writes records the same way the sync API does: one transaction, one new rev. */
async function writeRecords(db, records) {
  if (!records.length) return;
  const stmts = [db.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev'")];
  const upsert = db.prepare(
    "INSERT INTO records (c, id, d, rev) VALUES (?1, ?2, ?3, (SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'rev')) " +
      "ON CONFLICT (c, id) DO UPDATE SET d = excluded.d, rev = excluded.rev",
  );
  for (const r of records) stmts.push(upsert.bind(r.c, r.id, r.d));
  await db.batch(stmts);
}

/** One check: called by the cron trigger, and right after connecting. */
export async function checkInstagram(db, { seedOnly = false } = {}) {
  const meta = await getMeta(db);
  const watch = await readWatch(db);
  if (!meta.ig_token || !meta.ig_user_id || !watch?.enabled || !watch.username) return { skipped: true };
  const now = Date.now();
  try {
    const posts = await latestPosts(meta.ig_token, meta.ig_user_id, watch.username);
    const seen = new Set(JSON.parse(meta.ig_seen ?? "{}")[watch.username] ?? []);
    const firstLook = seen.size === 0;
    const since = Number(meta.ig_connected_at ?? 0);
    const fresh = posts.filter((p) => !seen.has(p.id) && !firstLook && !seedOnly && Date.parse(p.timestamp) >= since - 60_000);
    const users = await usersById(db);
    const records = fresh.flatMap((p) => alertRecords(p, watch, users, now));
    await writeRecords(db, records);
    const all = JSON.parse(meta.ig_seen ?? "{}");
    all[watch.username] = [...new Set([...posts.map((p) => p.id), ...seen])].slice(0, 60);
    await db.batch([
      setMeta(db, "ig_seen", JSON.stringify(all)),
      setMeta(db, "ig_status", JSON.stringify({ last_check: now, last_error: null, last_post: posts[0]?.timestamp ?? null, alerts: fresh.length })),
    ]);
    return { posts: posts.length, alerts: fresh.length };
  } catch (e) {
    await setMeta(db, "ig_status", JSON.stringify({ last_check: now, last_error: String(e?.message ?? e) })).run();
    return { error: String(e?.message ?? e) };
  }
}

/** Finds the Instagram professional account behind a token and saves it. */
async function connect(db, token) {
  const pages = await graph(`/me/accounts?fields=name,instagram_business_account{id,username}&limit=50`, token);
  const withIg = (pages.data ?? []).filter((p) => p.instagram_business_account?.id);
  if (!withIg.length) throw new Error("No Instagram professional account is linked to the Facebook Pages this token can see.");
  // Prefer Arena's own account when several are linked.
  const pick = withIg.find((p) => /arena/i.test(p.instagram_business_account.username ?? "")) ?? withIg[0];
  const account = pick.instagram_business_account;
  await db.batch([
    setMeta(db, "ig_token", token),
    setMeta(db, "ig_user_id", account.id),
    setMeta(db, "ig_account", JSON.stringify({ username: account.username, page: pick.name, choices: withIg.map((p) => p.instagram_business_account.username) })),
    setMeta(db, "ig_connected_at", String(Date.now())),
    setMeta(db, "ig_seen", "{}"),
  ]);
  return account;
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export async function handleInstagram(request, env, url, cors) {
  const db = env.DB;
  const route = url.pathname.replace("/api/instagram/", "");
  if (route === "status" && request.method === "GET") {
    const meta = await getMeta(db);
    return json(
      {
        connected: !!meta.ig_token,
        account: meta.ig_account ? JSON.parse(meta.ig_account) : null,
        status: meta.ig_status ? JSON.parse(meta.ig_status) : null,
      },
      200,
      cors,
    );
  }
  if (request.method !== "POST") return json({ error: "Not found" }, 404, cors);
  const body = await request.json().catch(() => ({}));
  if (route === "connect") {
    const token = String(body.token ?? "").trim();
    if (token.length < 20) return json({ error: "Paste the full access token." }, 400, cors);
    try {
      const account = await connect(db, token);
      const check = await checkInstagram(db, { seedOnly: true });
      return json({ ok: true, account, check }, 200, cors);
    } catch (e) {
      return json({ error: String(e?.message ?? e) }, 400, cors);
    }
  }
  if (route === "disconnect") {
    await db.batch(["ig_token", "ig_user_id", "ig_account", "ig_status", "ig_seen"].map((k) => db.prepare("DELETE FROM meta WHERE k = ?1").bind(k)));
    return json({ ok: true }, 200, cors);
  }
  if (route === "check") {
    return json(await checkInstagram(db), 200, cors);
  }
  if (route === "test") {
    // Sends an alert now, with the page's latest post if Instagram is connected.
    const watch = await readWatch(db);
    if (!watch?.username || !(watch.recipients ?? []).length) return json({ error: "Save the page and who gets alerts first." }, 400, cors);
    const meta = await getMeta(db);
    let post = { id: "test", caption: "This is what an alert looks like.", permalink: `https://www.instagram.com/${watch.username}/` };
    let note = "Instagram is not connected yet, so this test uses the page link.";
    if (meta.ig_token && meta.ig_user_id) {
      try {
        const posts = await latestPosts(meta.ig_token, meta.ig_user_id, watch.username);
        if (posts[0]) {
          post = posts[0];
          note = "Used the page's latest post.";
        }
      } catch (e) {
        note = `Instagram error: ${String(e?.message ?? e)}`;
      }
    }
    await writeRecords(db, alertRecords(post, watch, await usersById(db), Date.now(), true));
    return json({ ok: true, note }, 200, cors);
  }
  return json({ error: "Not found" }, 404, cors);
}
