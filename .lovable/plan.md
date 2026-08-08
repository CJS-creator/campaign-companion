# Campaign Companion — Phased Design Enhancement Plan

An end-to-end design lifecycle plan for the existing app (Dashboard, Campaigns, Leads, Analytics, Events, Diagnostics, Settings, Login), from audit through post-launch iteration.

## Phase 0 — Design Audit & Research Synthesis (Week 1)

- Screenshot-capture every route at mobile (375), tablet (768), and desktop (1440) widths in both light and dark themes; catalogue inconsistencies in spacing, card treatment, table density, and empty/loading/error states.
- Gap analysis against what exists today: 8 top-level routes and 17 custom components, several 400–600 line route files mixing layout, data, and presentation. Accessibility spot-check shows aria-labels appear in only a handful of files, so icon-only buttons and the single-`<main>` rule need a full sweep.
- User research synthesis: single-owner operator persona. Map the three core jobs — grow the list, get a campaign out safely, understand what happened after — and note where the current IA makes each job slow.
- Brand alignment: confirm the Inter / Plus Jakarta Sans pairing and indigo primary are intentional, or pick a distinct direction.

Deliverable: audit deck with prioritized findings, severity-ranked.

## Phase 1 — Design System Update (Week 2)

- Consolidate tokens in `src/styles.css`: add semantic status tokens (success, warning, info) alongside the existing destructive, so delivery/bounce/complaint states stop relying on ad-hoc colors.
- Define elevation, density, and motion scales; standardise the glass-panel and shimmer utilities into documented classes.
- Component contracts: one `PageHeader`, one `DataTable` shell (filter bar + empty + loading + pagination), one `StatCard`, one `StatusBadge`, one `EmptyState`. Every route consumes these rather than re-rolling markup.
- Accessibility baseline: AA contrast in both themes, aria-labels on all icon-only buttons, 44px tap targets, single `<main>` in `__root.tsx`, visible focus rings.

Deliverable: token set + primitives merged, with a `/design` internal reference route optional.

## Phase 2 — UI/UX Refinement (Weeks 3–5)

Milestone 2a — Core flows
- Dashboard: campaign list reworked around status-first scanning; sent/open/click as inline sparkline-backed stats.
- Composer: split into Content → Links → Recipients → Review steps, with the pre-send checklist as the persistent right rail rather than a block at the bottom.
- Leads: unified toolbar for add/import/export, bulk selection, suppression state made visible.

Milestone 2b — Insight surfaces
- Analytics: hierarchy of headline health (bounce/complaint risk) above detail metrics; consistent chart palette from chart tokens.
- Events: filter chips, saved views, per-send timeline drawer.

Milestone 2c — Configuration & trust
- Settings: grouped into Sender, Limits, Security, with the live DNS/verification panel as the primary card and inline remediation copy.
- Login and Diagnostics: reduce to calm, single-purpose screens.

## Phase 3 — Consistency, Review, Handoff (Week 6)

- Cross-device pass: 375/768/1024/1440 plus dark mode, on all 8 routes; fix overflow in tables and dialogs.
- Cross-state pass: loading, empty, error, permission-denied, and long-content variants for each new primitive.
- Stakeholder checkpoints: end of Phase 1 (tokens), mid Phase 2 (core flows), end of Phase 3 (release candidate).
- Handoff protocol: each component ships with prop contract, states matrix, and an accessibility note; changes land behind small PR-sized increments, never a single big rewrite.

## Phase 4 — QA & Launch (Week 7)

- Visual regression screenshots per route/theme/breakpoint.
- Keyboard-only and screen-reader walkthrough of send, import, and settings flows.
- Performance: route bundle check after splitting the large route files; verify no layout shift on dashboard load.
- Launch with the theme toggle defaulting to system and a rollback point.

## Phase 5 — Post-Launch Iteration (Weeks 8–12, then ongoing)

- Feedback: in-app "was this clear?" prompt on the composer and settings verification panel; a lightweight issue log on the diagnostics page.
- Success metrics: time-to-first-send, composer abandonment rate, settings verification completion rate, support/error events per week, accessibility violations at zero, and Lighthouse a11y ≥ 95.
- Roadmap cadence: two-week iteration cycles, one metric-driven improvement plus one debt item per cycle.

## Timeline summary

| Phase | Duration |
|---|---|
| 0 Audit & research | 1 week |
| 1 Design system | 1 week |
| 2 UI/UX refinement | 3 weeks |
| 3 Consistency & handoff | 1 week |
| 4 QA & launch | 1 week |
| 5 Post-launch iteration | ongoing, 2-week cycles |

## Cross-functional resources

- Design: 1 product designer full-time Phases 0–3, half-time after.
- Product: owner for prioritisation, present at the three checkpoints.
- Engineering: 1 frontend engineer full-time Phases 1–4; backend involvement only where settings/analytics data shape changes.
- QA: half-time Phase 3, full-time Phase 4, regression sweep each iteration.

## Risk mitigation

- Scope creep into backend behaviour — hard rule: this programme changes presentation only unless a data-shape gap is formally accepted.
- Token migration breaking dark mode — migrate one route at a time, screenshot both themes per PR.
- Large route files causing merge pain — extract primitives before restyling, so refinement edits are small.
- Accessibility treated as a final pass — enforce at the primitive level in Phase 1 so routes inherit it.
- Review bottlenecks — checkpoints are timeboxed; no reply within 48h means the default direction proceeds.

## Technical notes

- Tokens live in `src/styles.css` under `:root` / `.dark`; add success/warning/info as oklch pairs plus foreground variants and register them in the `@theme inline` block.
- New primitives under `src/components/patterns/`; shadcn primitives stay untouched in `src/components/ui/`.
- No hardcoded color utilities in routes; all status color flows through the new tokens.
- Route files above ~400 lines get their view sections extracted into local components before restyling.
