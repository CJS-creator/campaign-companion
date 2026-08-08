# Campaign Companion — Full Review (updated after your 2 changes)

## The one thing blocking everything

**None of the last three migrations were ever applied to the live database.** I checked the actual schema, and it is still the original one:

- `leads`: id, email, name, subscribed, created_at
- `campaigns`: id, subject, body_html, offer_url, status, sent_at, created_at
- `sends`: id, campaign_id, lead_id, sent_at, opened_at, clicked_at, created_at

There is no `settings` table, no `audit_logs`, no `events`, no consent or suppression columns, no `body_text`, no `scheduled_for`, and no `sends.status` / `attempt_count` / `failure_reason`. There are no database functions, so `claim_queued_sends` is missing too.

The new code depends on all of it. So right now: saving a campaign fails (`body_text` doesn't exist), the pre-send checklist reads settings that don't exist, scheduling fails, and the send queue and retry paths fail on the first write. The three SQL files on disk are drafts that never ran.

Two further problems inside those drafts, which must be fixed before applying them:

1. The Phase 0 migration adds `provider_message_id` / `attempt_history` to `sends` but assumes the earlier migration's `status`, `attempt_count`, `failure_reason`, `last_attempt_at` already exist. Applied out of order or alone, the queue still breaks.
2. Its campaign status constraint allows `draft, approved, scheduled, queued, sending, completed, cancelled` — but the worker writes `sent`. Every campaign completion would be rejected by the constraint.
3. No `GRANT` statements on the three new tables, so even with RLS policies the app can't reach them.

## Review by area

**Lead management** — Strong. Manual add, spreadsheet import with header matching and duplicate skipping, CSV export. Missing: the consent fields the compliance work assumes, and there's no unsubscribe surface yet.

**Campaign creation & sending** — Composer, clone, preview, merge tags, throttled batches with adaptive backoff on 429/503, and a scheduling UI. But scheduling has no runner: `scheduled_for` is written and nothing ever picks it up. And the worker is launched as a fire-and-forget promise inside the request, so a large list can be cut off when the request ends.

**Email delivery** — Still hardcoded to `onboarding@resend.dev`, which only delivers to the Resend account owner. `settings.sender_domain` exists in the draft schema but nothing uses it. The bounce webhook is unauthenticated and unverified: anyone who knows the URL can POST a fake `email.bounced` and unsubscribe any lead.

**Link safety** — Genuinely good. Static checks plus live reachability, enforced in the composer and re-checked server-side before Resend is called.

**Analytics** — Sent / open / click only. No bounce, unsubscribe, or delivery-failure reporting, no time series, no per-recipient timeline. Open tracking will over-report because of image proxies; there's no bot-open filtering.

**Compliance** — The checklist claims "RFC 8058 One-Click List-Unsubscribe & footer ready" and "plain-text fallback enabled", but neither is actually implemented in the send path. That's a green tick that isn't true, which is worse than a red one. No unsubscribe route, no `List-Unsubscribe` header, no footer injection, no audit writes.

**Security** — There's a `login.tsx` and an `auth.server.ts`, but the tables still carry `ALL / true / true` policies for `anon`, so the data is fully readable and writable by anyone with the project URL regardless of the login screen. The worker endpoint falls back to "no key configured = open".

**Advanced** — No segmentation, drip, or A/B testing. Personalization is `{{name}}` only.

## Prioritized plan

### Phase 1 — Get the database and the code back in sync (must be first)

1. Write one consolidated migration that applies delivery-status columns, the claim function, and the Phase 0 tables in the right order, with `sent` added to the campaign status constraint and `GRANT`s on `settings`, `audit_logs`, `events`.
2. Walk every code path that touches the new columns and confirm it works against the real schema: save draft, send, retry, schedule, campaign detail.

### Phase 2 — Make the checklist honest

3. Implement the unsubscribe route (signed token, reusing the existing HMAC helper), auto-append the footer with business name and postal address, and set the `List-Unsubscribe` / `List-Unsubscribe-Post` headers on every send.
4. Send a real plain-text part alongside the HTML.
5. Write consent and suppression data on lead add/import, and audit rows on send/schedule/unsubscribe.

### Phase 3 — Close the security holes

6. Verify the Resend webhook signature before it can unsubscribe anyone; reject unsigned requests.
7. Require a real secret on the worker endpoint instead of failing open.
8. Move the tables off the fully public policies — real auth with owner-scoped RLS, not a client-side login screen over open tables.

### Phase 4 — Make sending reliable at size

9. Drain the queue from a scheduled job rather than a background promise, and have that same job pick up scheduled campaigns when their time arrives.
10. Enforce the daily/monthly caps in the worker, not just as a checklist warning.
11. Use the configured sender domain instead of the hardcoded test address.

### Phase 5 — Depth

12. Bounce/unsubscribe/failure rates and opens-over-time on the dashboard; per-recipient activity on the campaign page.
13. Tags and segments, send-to-segment.
14. A/B subject testing, then drip sequences.

## Technical notes

- Migration ordering matters: `sends.status` must exist before `attempt_history` and before the claim function is created.
- Unsubscribe and webhook verification both belong under `src/routes/api/public/*` so external callers reach them, with signature checks inside the handler.
- The scheduled runner should be a single authenticated endpoint that both drains the queue and promotes due `scheduled` campaigns, called on a cron.
- Adding real auth means rewriting every policy on `leads`, `campaigns`, `sends`, plus the new tables, and re-checking each server function that currently relies on the admin client.
