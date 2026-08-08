# Campaign Companion

Build a marketing email tool with a React frontend and a backend (Node.js/Express or Supabase Edge Functions — whichever Lovable defaults to).

Data model:

- leads: email, name, subscribed (bool), created_at
- campaigns: subject, body_html, status (draft/sent), created_at
- sends: campaign_id, lead_id, sent_at, opened_at (nullable), clicked_at (nullable)

Features:

1. A leads page to add/view leads manually (email + name)
2. A campaign composer: subject line + rich text body, with a placeholder for one offer link
3. On send, call the Resend API (I'll provide RESEND_API_KEY as an environment variable — do not hardcode it) to email every subscribed lead. Send from "onboarding@resend.dev" for now (Resend's shared test domain). Embed a unique tracking pixel (pointing to /track/open?send_id=X) in the email body, and wrap the offer link so clicks go through /track/click?send_id=X before redirecting to the real URL.
4. Backend endpoints /track/open and /track/click that log opened_at / clicked_at on the sends record, then respond with a 1x1 transparent pixel (for open) or a 302 redirect (for click).
5. A dashboard page showing each campaign with sent / open rate / click rate.

Keep the UI clean and simple — no login/auth needed yet, single-user.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f9328437-7e6a-4232-b6bc-aaa83f497f5c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
