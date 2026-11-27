# Arena OS: tasks, events, walk-ins and reports for Arena Dbayeh

Built by **Brains AI Solutions**.

Arena OS runs on everyone's phone. The Owner hands work to the Operations Manager, who passes it on to the Restaurant and Playground managers and their teams. Everyone sees the event calendar, gets reminders, and logs walk-ins at the door. The Owner sees date-range reports on tasks, events, walk-ins and revenue.

It has two modes, chosen on the first screen:

| Mode | What it is | Where the data lives |
| --- | --- | --- |
| **Arena workspace** | The real thing. It starts empty: the Owner sets it up, then adds people with PINs. | Shared online between every phone (Cloudflare free plan, see below). A copy is kept on each phone so it opens instantly and works offline. |
| **Sample data** | A filled-in demo for presentations. Fictional people, tasks, events and walk-ins, regenerated each day. | This browser only. |

Language: English or Arabic (right-to-left) from the **ع / EN** button, per phone.

## Positions

| Position | Sees | Can do |
| --- | --- | --- |
| **Owner** | Everything, including revenue | Assign to the Operations Manager (the default) or anyone directly · add people and set PINs · book events · all reports · erase the workspace |
| **Operations Manager** | The whole venue, including revenue | Pass tasks to managers and staff · add people below them · book events · recurring tasks · submits the daily venue report |
| **Restaurant / Playground Manager** | Their department | Assign tasks to their team · book events · enter restaurant sales · recurring tasks · submits the daily department report |
| **Staff** (waiters, cooks, attendants, cashier, maintenance…) | Their own tasks, the calendar | Start / pause / complete tasks · log walk-ins · set reminders for themselves |

The Operations Manager runs the **Operations** department (cleaning, maintenance, drivers). Restaurant and Playground each have their own manager. The Owner can add more departments.

## What it does

- **Tasks**: priorities, deadlines, a time allowed per task with an alert when someone runs over, live timers, reassign / reprioritise / escalate. Unchanged from the first demo; see `src/lib/engine.ts`.
- **Calendar**: month view with every event, the tasks due each day and a **how busy** dot (event guests plus the usual walk-ins for that weekday, from the last four weeks). Tap a day for its events, tasks and reminders.
- **Events**: birthday, private party, school trip, corporate, tournament. Each has a date and time, area, kids and adults, client contact, package price and deposit, and a person in charge. When booking, tick the prep / setup / cleanup tasks and who does them; they are assigned automatically with their deadlines. The person in charge and the Operations Manager get a reminder the day before and an hour before. Cancelling an event removes its reminders and unstarted prep tasks.
- **Walk-ins**: the green **Walk-in** button on every screen. Enter kids and adults, the area and the amount paid (filled in from the entry prices), then save. The Walk-ins screen shows the day by hour, the log, and lets managers type in restaurant sales and other income.
- **Reminders**: set for yourself or anyone below you. They pop up in the app at that time, stay in the bell until ticked off, and show as phone notifications if they were turned on (Account menu → Phone notifications; the app must be open in a tab).
- **Recurring tasks**: daily, weekly (chosen days) or monthly. Each one creates its task in the person's queue on the right day.
- **Reports by date**: today, yesterday, this week, last 7 days, this month, last month or any range. Includes tasks per person, events, walk-ins (busiest day and hour, by area) and revenue (door + event packages + restaurant + other). Export to CSV or print / PDF. The original task reports and the daily submission chain (manager → Operations Manager → Owner) are under **Task reports**.

- **Venues**: Arena and Money Mondo share the app but are run separately. Owners switch between them at the top, and the date reports can combine both. Everyone else, including each venue's Operations Manager, only ever sees their own venue.
- **Owner to Owner**: Owners can give tasks and recurring tasks to each other (and recurring tasks to themselves). That work is private: only the Owner who gave it and the Owner who received it see it. The other Owners and the venue teams don't see it, unless it is passed down to someone in the team.
- **Sections**: a department can sit under another one. Arena's Operations has a section (placeholder name "Christian", renamable under Team → People and PINs) with its own manager.
- **Deadlines**: anyone who manages a task can move its deadline until it is done. Once it is overdue, only the person who created it can; everyone above sees an overdue alert naming who that is.
- **Instagram alerts** (Settings): every 3 minutes the server checks a page (by default @quatro.dbayeh) through Instagram's official API. On a new post, the chosen people get an alert with an **Open post** button, and one person can also get a "like and repost" task. Instagram offers no way for apps to like or repost, so a person does that part. Setup: connect once with a Meta access token (the steps are in the panel). The token stays on the server (`meta` table) and is never sent to phones. Code: `worker/instagram.js`.

## First day with the real workspace

1. Open the link and tap **Open the Arena workspace**. On the very first visit you set up the Owner: name and a 4-digit PIN.
2. **Team → People and PINs → Add person**: the Operations Manager, the Restaurant Manager, the Playground Manager, then the staff. Give each one a PIN.
3. Everyone opens the same link on their phone, taps their name and types their PIN. The phone stays signed in.
4. **Walk-ins → Entry prices**: set the price per kid / adult.
5. **Calendar → Recurring tasks**: add the daily opening and closing checklists.

## How data is shared without a backend

There is no server application or paid database. The free Cloudflare plan hosts:

- **The app**: a static Next.js export, bundled into one Cloudflare Worker.
- **A tiny sync API**, `worker/index.js`, plus the Instagram watcher in `worker/instagram.js` (run by a free cron trigger every 3 minutes). It stores every record (person, task, event, walk-in…) as a JSON row in **Cloudflare D1** (free tier: 5 GB, 100,000 writes a day).

Each phone sends only the records it changed and asks every 8 seconds for anything changed since its last check (`src/lib/repository.ts`). If two people change the **same** record at the same moment, the later save wins. Changes made offline are queued and sent when the connection returns.

**Limits of the trial setup.** Anyone who has the link can reach the data. PINs keep colleagues out of each other's screens, but they are not real security. Use it for a trial of a few days; before Arena relies on it, move to a proper backend (next section).

Live: https://arena-dbayeh.julien-a8d.workers.dev

## Run and deploy

```bash
npm install
npm run dev                 # sample data works; the workspace needs the API (below)
```

To use the real workspace in `next dev`, point it at the deployed API:

```bash
NEXT_PUBLIC_SYNC_URL=https://arena-dbayeh.julien-a8d.workers.dev npm run dev
```

Or run the whole thing locally, with a local database that is separate from production:

```bash
npx wrangler@4 d1 execute arena-dbayeh --local --file worker/schema.sql
npm run worker:dev          # http://localhost:8787
```

Deploy (needs Cloudflare credentials for the account in `wrangler.jsonc`):

```bash
npm run deploy
```

The D1 database is `arena-dbayeh`; its tables are in `worker/schema.sql`.

## Moving to a real backend later (Supabase)

The screens never touch storage directly. To move:

1. **Tables**: one per collection in `src/lib/types.ts` (`users`, `departments`, `tasks`, `task_time_sessions`, `task_activity_logs`, `events`, `walkins`, `revenue`, `reminders`, `recurring`, `daily_reports`, `executive_reports`). Field names are already in database style.
2. **Persistence**: write a third `DataRepository` in `src/lib/repository.ts`. The `diff()` there already turns every action into the exact rows that changed.
3. **Import**: read the current records from D1 (`SELECT c, id, d FROM records`) and insert them into the new tables.
4. **Auth**: replace name + PIN with Supabase Auth, and copy the rules in `src/lib/permissions.ts` into row-level security.
5. **Time**: let the database set timestamps for timer events.

## Project map

```
src/lib/types.ts          entities: people, tasks, events, walk-ins, revenue, reminders, recurring tasks
src/lib/permissions.ts    who can see and do what, and each position's navigation
src/lib/engine.ts         task writes: validation, state changes, activity log
src/lib/venue-engine.ts   events, walk-ins, revenue, reminders, recurring tasks, people
src/lib/selectors.ts      task numbers
src/lib/venue.ts          calendar busy levels, walk-in and revenue totals, reminders, date reports
src/lib/repository.ts     sample storage and the cloud sync
src/lib/store.ts          app state, modes, PIN sign-in, actions, alerts
src/lib/i18n.ts           English / Arabic; translations in src/lib/ar/
src/lib/seed.ts           sample data
worker/                   Cloudflare Worker: sync API + the app; D1 schema
scripts/                  bundle the app into the worker; check Arabic coverage
```

Stack: Next.js 16 (App Router, static export), TypeScript, Tailwind CSS 4, Base UI dialogs, Motion, React Three Fiber, Recharts, Zustand, Cloudflare Workers + D1.

Business dates use the Asia/Beirut time zone. Amounts are in US dollars.
