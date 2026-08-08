# Plan: get Campaign Companion sending reliably

Goal: close every gap from the 10-point list so a real campaign can go out, be tracked, and stay compliant.

## Phase 1 — Sender identity (the current blocker)

1. Finish domain verification for `notify.designforge.me` (DNS records are shown in Cloud → Emails). Nothing else unblocks sending.
2. Pick one delivery path and remove the other from the send code so behaviour is consistent:
   - **Resend** (current code, keeps webhooks/open/click tracking as built), or
   - **Lovable's built-in email** (managed domain, suppression and unsubscribe handled for us, but campaign-style bulk sending is not supported).
   Recommendation: stay on Resend for campaigns.
3. Set the Settings sender address to `campaigns@notify.designforge.me` and add a "sender not verified yet" state that surfaces the real reason (domain unverified vs. address missing), instead of one generic message.
4. Add a live sender health check in Settings that calls Resend's domains API and shows verified / pending per record, replacing the currently hardcoded DNS record list.

## Phase 2 — Publish and prove the backend path

5. Publish so the current schema, auth, RLS, queue worker and sender validation are live (preview-only changes do not run for cron).
6. Re-run the cron worker check: private worker key succeeds, publishable key returns 401.
7. Confirm the Resend webhook endpoint accepts a signed test event and writes an `events` row.

## Phase 3 — Data quality before the first real send

8. Validate leads on import and on save: syntax, duplicate collapse, and skip anything already suppressed.
9. Require subject, body, and a link-checked offer URL before a campaign can leave draft; block send when any lead batch would exceed the configured daily/monthly cap.

## Phase 4 — Compliance in the send path

10. Inject the footer (business name + postal address) and a working unsubscribe link into every outgoing email.
11. Set `List-Unsubscribe` and `List-Unsubscribe-Post` headers, and send a real plain-text part alongside the HTML.
12. Make the pre-send checklist read actual state rather than asserting these are done.

## Phase 5 — Deliverability and the controlled test

13. Add DMARC (`p=none` to start) alongside the verified SPF/DKIM.
14. Warm-up: cap the first sends low (25/day, then 50, 100…) via the existing daily cap, and keep the throttle between individual sends.
15. Run one test send to an address you control and verify, end to end: delivery, open pixel, click redirect, bounce handling, and the campaign page reporting the right counts.

## Phase 6 — Monitoring

16. Surface bounce / complaint / unsubscribe rates on the dashboard, not just opens and clicks.
17. Alert (banner) when the bounce rate crosses 2% or complaints cross 0.1%, since either will damage the domain's reputation quickly.

## Technical notes

- Sender resolution should live in one place (`src/lib/sender.ts`) and be the single source used by campaign send, test send, and the queue worker.
- Footer/unsubscribe injection belongs in the send path in `src/lib/campaigns.functions.ts` and the cron worker, so scheduled sends get it too.
- The unsubscribe route already exists at `src/routes/track/unsubscribe.ts`; it needs the signed token and the header wiring.
- The DNS record list in `src/lib/settings.functions.ts` is currently static sample data and must be replaced with a live Resend lookup before it is trusted.

## What needs you, not me

- Completing the DNS records for `notify.designforge.me` at your registrar.
- Clicking Publish once Phase 1 is in place.
- Choosing the address you want campaigns to come from.
