"use client";

// Settings → Instagram alerts: connect Arena's Instagram account once, pick the
// page to watch and who hears about new posts. The checking itself runs on the
// server every 3 minutes (worker/instagram.js), even when every phone is off.

import { Camera, ChevronDown, Link2, Send, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms";
import { Btn, Chip, Panel } from "@/components/kit";
import { t } from "@/lib/i18n";
import { apiUrl } from "@/lib/repository";
import { actions, useApp, useDb, useMe, useNow } from "@/lib/store";
import { fmtAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Status {
  connected: boolean;
  account: { username: string; page: string; choices?: string[] } | null;
  status: { last_check: number; last_error: string | null; last_post?: string | null; alerts?: number } | null;
}

const DEFAULT_PAGE = "quatro.dbayeh";

export function InstagramPanel() {
  const db = useDb();
  const me = useMe();
  const now = useNow();
  const sample = useApp((s) => s.mode === "sample");
  const watch = db.instagram;
  const people = db.users.filter((u) => u.active_status).sort((a, b) => a.name.localeCompare(b.name));
  const [username, setUsername] = useState(watch?.username ?? DEFAULT_PAGE);
  const [enabled, setEnabled] = useState(watch?.enabled ?? true);
  const [recipients, setRecipients] = useState<string[]>(watch?.recipients ?? [me.id]);
  const [taskTo, setTaskTo] = useState(watch?.task_to ?? "");
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  const [refresh, setRefresh] = useState(0);
  const load = useCallback(() => setRefresh((n) => n + 1), []);
  useEffect(() => {
    if (sample) return;
    let alive = true;
    fetch(apiUrl("/api/instagram/status"), { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Status>) : null))
      .then((s) => {
        if (alive && s) setStatus(s);
      })
      .catch(() => {
        // offline: the panel still works for settings
      });
    return () => {
      alive = false;
    };
  }, [sample, refresh]);

  const post = async (route: string, body: object = {}) => {
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/instagram/${route}`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { error?: string; note?: string };
      if (!res.ok || out.error) throw new Error(out.error ?? t("Could not reach the server. Check the connection and try again."));
      return out;
    } finally {
      setBusy(false);
      load();
    }
  };

  const save = () => actions.saveInstagramWatch({ username, enabled, recipients, task_to: taskTo || null });

  return (
    <Panel title={t("Instagram alerts")} icon={<Camera className="size-5" />} className="lg:col-span-2">
      <p className="text-sm leading-relaxed text-paper/70">
        {t("Every 3 minutes Arena OS checks a page on Instagram. When it posts, the people below get an alert with a button to open the post, so they can like and repost it in a few seconds. Instagram does not let apps like or repost by themselves.")}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label={t("Page to watch")} htmlFor="ig-user">
            <div className="flex gap-2">
              <span className="grid h-[42px] place-items-center px-1 text-paper/45">@</span>
              <input id="ig-user" className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={DEFAULT_PAGE} />
            </div>
          </Field>
          <Field label={t("Who gets the alert")}>
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
              {people.map((u) => (
                <Chip key={u.id} active={recipients.includes(u.id)} onClick={() => setRecipients((r) => (r.includes(u.id) ? r.filter((x) => x !== u.id) : [...r, u.id]))}>
                  {u.id === me.id ? t("Me") : u.name}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={t("Also give a “like and repost” task to (optional)")}>
            <select className="field" value={taskTo} onChange={(e) => setTaskTo(e.target.value)}>
              <option value="">{t("No task, alert only")}</option>
              {people
                .filter((u) => u.role !== "owner")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {t(u.title)}
                  </option>
                ))}
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={enabled} onClick={() => setEnabled((v) => !v)}>
              {enabled ? t("Alerts on") : t("Alerts paused")}
            </Chip>
            <Btn variant="primary" onClick={save}>
              {t("Save alerts")}
            </Btn>
            {!sample && (
              <Btn
                disabled={busy || !watch}
                onClick={async () => {
                  try {
                    const out = await post("test");
                    toast.success(t("Test alert sent. It reaches phones within a few seconds."), { description: out.note ? t(out.note) : undefined });
                  } catch (e) {
                    toast.error(t((e as Error).message));
                  }
                }}
              >
                <Send className="size-4" /> {t("Send a test alert")}
              </Btn>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-paper/45 uppercase">{t("Connection to Instagram")}</p>
          {sample ? (
            <p className="text-sm text-paper/60">{t("Connecting Instagram works in the real workspace, not with sample data.")}</p>
          ) : status?.connected ? (
            <>
              <p className="text-sm">
                {t("Connected through")} <span className="font-semibold text-brand">@{status.account?.username}</span>
                {status.account?.page ? <span className="text-paper/50"> · {status.account.page}</span> : null}
              </p>
              {status.status && (
                <p className={cn("text-xs", status.status.last_error ? "text-crit" : "text-paper/55")}>
                  {status.status.last_error
                    ? t("Last check failed: {error}", { error: status.status.last_error })
                    : t("Last checked {ago}.", { ago: fmtAgo(status.status.last_check, now) })}
                </p>
              )}
              {me.role === "owner" && (
                <Btn size="sm" variant="subtle" disabled={busy} onClick={() => void post("disconnect")}>
                  <Unplug className="size-4" /> {t("Disconnect")}
                </Btn>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-paper/65">{t("Not connected yet. Paste the access token from Meta (steps below), then press Connect.")}</p>
              <textarea
                className="field min-h-[70px] font-mono text-xs"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAG…"
                aria-label={t("Access token")}
                autoComplete="off"
                spellCheck={false}
              />
              <Btn
                variant="primary"
                disabled={busy || token.trim().length < 20}
                onClick={async () => {
                  try {
                    await post("connect", { token: token.trim() });
                    setToken("");
                    toast.success(t("Instagram connected."));
                  } catch (e) {
                    toast.error(t((e as Error).message));
                  }
                }}
              >
                <Link2 className="size-4" /> {t("Connect")}
              </Btn>
              <p className="text-xs text-paper/45">{t("The token is kept on the server and is never shown again or sent to phones.")}</p>
            </>
          )}
          <button type="button" onClick={() => setHelp((h) => !h)} className="flex items-center gap-1.5 text-xs font-semibold text-paper/60 hover:text-paper" aria-expanded={help}>
            <ChevronDown className={cn("size-4 transition-transform", help && "rotate-180")} /> {t("How to get the access token (one time, about 15 minutes)")}
          </button>
          {help && (
            <ol className="list-decimal space-y-1.5 ps-5 text-xs leading-relaxed text-paper/70">
              <li>{t("In the Instagram app, make sure Arena's account and @{page} are both Professional accounts (Business or Creator). Settings → Account type and tools.", { page: username || DEFAULT_PAGE })}</li>
              <li>{t("Link Arena's Instagram to Arena's Facebook Page (Meta Business Suite → Settings → Linked accounts).")}</li>
              <li>{t("Go to developers.facebook.com → My Apps → Create app → type Business. Add the product “Instagram” (API setup with Facebook login).")}</li>
              <li>{t("Open Tools → Graph API Explorer, pick the app, and add the permissions instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement, business_management.")}</li>
              <li>{t("Press Generate Access Token and allow Arena's Page. For a token that does not expire, create a System User in Meta Business Suite → Business settings → System users, give it the Page and the app, and generate the token there.")}</li>
              <li>{t("Paste the token above and press Connect. Then press Send a test alert.")}</li>
            </ol>
          )}
        </div>
      </div>
    </Panel>
  );
}
