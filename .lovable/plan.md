# Campaign Companion — Review & Next Phase

## Critical finding first

The queue/retry code shipped last turn assumes columns that **do not exist in the live database**. Two migration files sit in the project (`campaign_delivery_status`, `claim_queued_sends_function`) but the database still has `sends` with only `sent_at / opened_at / clicked_at` — no `status`, `attempt_count`, `failure_reason`, `last_attempt_at` — and no `claim_queued_sends` function. Every send, retry, and the campaign detail page will error at runtime until this is applied. Also, `campaigns.status` is set to `queued` by the send path but the intended check constraint only allows draft/sending/sent.

Fixing this is step 1 of any further work.

## Where the app stands

**Strong**
- Lead management: manual add, spreadsheet import with header matching and duplicate skipping, CSV export.
- Link safety: static checks (https-only, private/local hosts, embedded credentials, shorteners, punycode) plus a live reachability/redirect check, enforced both in the composer and again server-side before Resend is called.
- Tracking: signed open pixel and click redirect with HMAC tokens, failing open so email rendering never breaks.
- Throttled batch sending (2 per ~1.1s) with adaptive backoff on 429/503.

**Gaps**
- Sending is single-request-driven; a long list can outlive the request. No cron/scheduled drain of the queue.
- No unsubscribe link, no consent record, no audit trail — a real marketing send would be non-compliant.
- Still sending from `onboarding@resend.dev`, which only delivers to the Resend account owner. No verified domain, no SPF/DKIM, no bounce/complaint webhook.
- No auth at all; tables are world-readable/writable through the public API.
- Analytics stop at sent/open/click counts. No bounce, unsubscribe, per-recipient timeline, or time-series.
- No segmentation, tags, scheduling, drip, or A/B testing. Personalization is a single `{{name}}` token.
- Accessibility and small-screen layout haven't been checked.

## Recommended phases

### Phase 1 — Make it correct (blocking)
1. Apply the pending delivery-status migration and the claim function; widen the campaign status constraint to include `queued`.
2. Verify the whole send → retry → detail-page path end to end against the real schema.
3. Show per-recipient failure reasons on the campaign detail page.

### Phase 2 — Compliance and deliverability
4. Unsubscribe: signed one-click unsubscribe route, link auto-appended to every send, `List-Unsubscribe` header.
5. Consent trail: record source (manual / import / form), consent timestamp, and unsubscribe timestamp per lead.
6. Bounce and complaint handling via a Resend webhook that auto-unsubscribes hard bounces and complaints.
7. Guidance and a settings field for a verified sender domain, replacing the hardcoded test address.

### Phase 3 — Protect the data
8. Add login and move all tables off the permissive "anyone can do anything" policies to owner-scoped access, with a separate roles table if more than one user is expected.

### Phase 4 — Scale the sender
9. Drain the queue from a scheduled job instead of a background promise, so large lists finish reliably.
10. Scheduled sends (send at a chosen time) built on the same queue.

### Phase 5 — Grow the product
11. Tags/segments on leads and send-to-segment.
12. Richer analytics: bounce and unsubscribe rates, opens over time, per-recipient activity.
13. A/B subject-line testing with automatic winner reporting.
14. Drip sequences triggered by signup or by a previous campaign's open/click.

## Technical notes
- Queue draining belongs behind an authenticated `/api/public/*` route callable by pg_cron, replacing the current fire-and-forget `runQueueWorker` promise.
- Unsubscribe tokens reuse the existing HMAC helper in `src/lib/link-safety.ts`.
- Bounce/complaint webhook must verify the Resend signature before writing.
- Adding auth requires rewriting every RLS policy on `leads`, `campaigns`, and `sends` plus the grants; server functions using the admin client keep working but should verify the caller.
