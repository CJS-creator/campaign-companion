# Marketing Email Tool

A single-user, no-login tool to collect leads, compose campaigns, send them via Resend, and track opens and clicks.

## Pages

**Leads** (`/leads`)

- Form to add a lead (email + name), with validation and duplicate-email protection
- Table of leads: email, name, subscribed toggle, created date

**Composer** (`/campaigns/new`)

- Subject line input
- Rich text body editor
- One "offer link" URL field; inserting `{{offer_link}}` in the body marks where the tracked link goes
- Save as draft, or Send now (confirmation showing recipient count)

**Dashboard** (`/`)

- One row per campaign: subject, status, sent date, sent count, open rate, click rate
- Click through to a campaign detail view listing individual sends and their open/click state

## Data model

- `leads` — email (unique), name, subscribed (default true), created_at
- `campaigns` — subject, body_html, offer_url, status (draft/sent), created_at, sent_at
- `sends` — campaign_id, lead_id, sent_at, opened_at (nullable), clicked_at (nullable)

## Sending flow

On send, a server function:

1. Loads all subscribed leads
2. Creates one `sends` row per lead (so each has a unique id)
3. Per recipient, renders the body with:
   - the offer link rewritten to `/track/click?send_id=<id>`
   - a 1x1 tracking pixel `<img src="/track/open?send_id=<id>">` appended
4. Calls the Resend API with `from: onboarding@resend.dev`
5. Marks the campaign `sent`

## Tracking endpoints

Public routes (no auth):

- `GET /track/open?send_id=X` — sets `opened_at` if null, returns a 1x1 transparent GIF with no-cache headers
- `GET /track/click?send_id=X` — sets `clicked_at` if null, then 302-redirects to the campaign's offer URL

Both fail silently (still return pixel/redirect) if the id is unknown, so email rendering never breaks.

## Technical notes

- Backend is Lovable Cloud (Postgres) plus TanStack Start server functions; tracking endpoints are file routes under `src/routes/track/`, which are reachable without auth.
- `RESEND_API_KEY` is stored as a project secret and read only inside the server handler — never in client code, never hardcoded.
- No login, so tables get permissive policies for the single-user case; this can be tightened later when auth is added.
- Absolute URLs for pixel/click links are derived from the request origin so tracking works from a real inbox.

## Things to know before sending

- `onboarding@resend.dev` only delivers to the email address that owns the Resend account. Real sends to your leads require a domain verified in Resend; the code will make the from-address a single constant that's easy to swap.
- Because there's no auth, anyone with the URL can add leads and send campaigns. Fine for local/private use — worth adding a login before sharing the link.
