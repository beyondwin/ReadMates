# ReadMates Cream Landing — Phase 1 Design

Status: draft (awaiting user review)
Owner: frontend
Last updated: 2026-05-09

## Goal

Add a public landing page at `/` that matches the "Minimal Cream Gallery" concept attached by the user. Today `/` enters a club directly via `publicClubLoader`; the new landing replaces that visual surface while keeping the underlying data flow.

This spec covers a single bounded scope:

- A scoped design subsystem (cream palette + dual ink/sage accents) that lives alongside the existing `tokens.css` without affecting any other route.
- The landing page itself, desktop and mobile, built on top of that subsystem.

A later spec will decide whether to migrate other surfaces to the cream system.

## Non-goals

- Rebrand of `/app`, `/app/host`, `/clubs/:slug`, `/login`, archive, feedback, or any other existing surface.
- Dark theme support for the cream surface (raster-fallback to light).
- New backend fields or schema migrations. Where loader data is missing, the landing renders empty states; backend gaps are tracked as follow-up issues.
- Notification, search, profile-menu behavior. Those controls render but are visual-only on this page.

## Decisions captured during brainstorming

| Topic | Decision |
|---|---|
| What "main page" means | Public landing at `/` (replaces current direct-into-club behavior). |
| Landing content | The supplied mockup, applied as the visual treatment for the existing default-club content. |
| Palette scope | Scoped coexistence — new tokens live behind `data-surface="readmates-cream"`. Existing `tokens.css` and screens are untouched. |
| Primary accent | Ink navy `#0E2540`. Sage `#475B4F` is a secondary accent for status chips, ornaments, soft surfaces. |
| Phasing | Single spec covers tokens + components + the one page. No retrofit of other surfaces. |

## Architecture

Follow the existing route-first dependency direction (`shared → features → src/pages → src/app`).

```
front/
├── shared/styles/
│   └── readmates-cream.css                ← scoped tokens + cream-only utility overrides
├── shared/ui/readmates-cream/
│   ├── cream-brand-mark.tsx
│   ├── cream-top-nav.tsx
│   ├── cream-mobile-header.tsx
│   ├── cream-nav-drawer.tsx
│   ├── cream-hero.tsx
│   ├── cream-club-card.tsx
│   ├── cream-feature-card.tsx
│   ├── cream-segmented.tsx
│   ├── cream-record-card.tsx
│   └── cream-cta-banner.tsx
├── features/public/
│   ├── route/landing-route-data.ts        ← landingLoader
│   ├── route/landing-route.tsx            ← route element
│   ├── ui/landing-page.tsx                ← root, sets data-surface="readmates-cream"
│   └── ui/landing-sections/
│       ├── landing-hero-section.tsx
│       ├── landing-club-card-section.tsx
│       ├── landing-now-reading-section.tsx
│       ├── landing-records-section.tsx
│       └── landing-cta-section.tsx
└── src/pages/
    └── public-home.tsx                    ← thin route shell delegating to LandingRoute
```

Rules:

- `shared/ui/readmates-cream/*` is presentational only. No `fetch`, no router imports, no `shared/api`, no feature API.
- `features/public/ui/*` composes cream primitives and consumes loader data via `useLoaderData`.
- The cream stylesheet is imported once, in `landing-page.tsx` (or `src/main.tsx` if Vite ordering requires it).
- The `data-surface="readmates-cream"` attribute is set exactly once, on `LandingPage`'s outermost element. All cream tokens activate there.

## Token system

File: `front/shared/styles/readmates-cream.css`

Selector: `:where([data-surface="readmates-cream"])`. Low specificity, no leakage outside the surface.

### Surfaces

```
--cream-50:  #FAF7F8   /* page background */
--cream-100: #F2EFE8   /* card / hero panel */
--cream-200: #E7EDE6   /* CTA banner, soft secondary */
--cream-300: #DCE7DC   /* sage-light, hover lines, accent surface */

--bg:        var(--cream-50)
--bg-sub:    var(--cream-100)
--bg-raised: #FFFFFF       /* card-on-card */
--bg-deep:   var(--cream-200)
```

### Ink (text + lines)

```
--ink-900: #0E2540
--ink-700: #2C3E5A
--ink-500: #6B7889
--ink-300: #B8C0CB
--ink-200: #D9DEE4
--ink-100: #ECEFF2

--text:        var(--ink-900)
--text-2:      var(--ink-700)
--text-3:      var(--ink-500)
--line:        var(--ink-200)
--line-soft:   var(--ink-100)
--line-strong: var(--ink-300)
```

### Dual accent

```
--accent-primary:        #0E2540
--accent-primary-hover:  #1A3354
--accent-primary-soft:   color-mix(in oklch, #0E2540 8%, var(--cream-50))
--accent-primary-line:   color-mix(in oklch, #0E2540 18%, var(--cream-100))

--accent-secondary:        #475B4F
--accent-secondary-hover:  #3A4C42
--accent-secondary-soft:   var(--cream-300)
--accent-secondary-line:   color-mix(in oklch, #475B4F 22%, var(--cream-200))

/* Aliases keep .btn-primary, .badge-accent, focus rings working unchanged */
--accent:       var(--accent-primary)
--accent-hover: var(--accent-primary-hover)
--accent-soft:  var(--accent-primary-soft)
--accent-line:  var(--accent-primary-line)
```

### State colors (recalibrated to cream)

```
--ok:     #5A7A66   --ok-soft:     var(--cream-300)
--warn:   #B07636   --warn-soft:   #F4E9D9
--danger: #B8493D   --danger-soft: #F4DCD8
```

Existing semantic aliases (`--success`, `--warning`, `--pending`, etc.) remap to the same values so `.badge-ok`, `.rm-state--success`, etc. render correctly in cream scope.

### Type / radius / shadow

- Font family unchanged: `Pretendard Variable`.
- New display utilities live in cream stylesheet: `.cream-display`, `.cream-h2`, `.cream-eyebrow`. Hero H1 uses `clamp(34px, 6vw, 56px)`. Other headings static.
- New radius tokens: `--r-card: 14px`, `--r-pill: 999px`. Inside cream scope, `.surface { border-radius: var(--r-card); }` overrides the global 8px.
- `--shadow-card: 0 1px 0 rgba(14,37,64,0.04), 0 8px 24px -16px rgba(14,37,64,0.12)`. Single elevation; no hover lift.

### Dark theme

Out of scope. `[data-theme="dark"][data-surface="readmates-cream"]` re-declares the light values so dark-mode users see the cream surface in light. A separate dark variant is a follow-up.

### Breakpoints

| Range | Behavior |
|---|---|
| `≥ 1024px` | 12-col split (hero 7/5), records 6-col grid |
| `768–1023px` | Single column. Sessions row stays 2-col. Records grid 3-col |
| `< 768px` | Single column. Sessions stack vertically. Records become a horizontal scroll-snap rail |

All breakpoints are container-width based (`@media`). No JS detection.

## Components

All under `shared/ui/readmates-cream/`. Props/callback driven, no fetch, no router imports.

| Component | Responsibility | Notable variants |
|---|---|---|
| `CreamBrandMark` | Navy square + book glyph + "ReadMates" wordmark | `size: "sm" \| "md" \| "lg"` |
| `CreamTopNav` | Desktop nav with logo, links, search, bell, profile pill | `authState: { kind: "guest" } \| { kind: "member"; user }` |
| `CreamMobileHeader` | Mobile bar with logo, search icon, hamburger, profile | Same `authState` |
| `CreamNavDrawer` | Mobile menu open/close panel | `open`, `onClose` |
| `CreamHero` | Headline, sub, member chips, primary CTA, still-life photo | Stacks photo-above-text on mobile |
| `CreamClubCard` | Status badge, title, description, host/members/founded/records rows | Sticky on desktop, full-width below hero on mobile/tablet |
| `CreamFeatureCard` | Image + meta + title + sub + ghost button | `variant: "session" \| "book"`. `book` reuses `shared/ui/book-cover` for 3:4 covers |
| `CreamSegmented` | Pill segmented control for record filters | `value`, `onChange`, ARIA tablist + arrow keys |
| `CreamRecordCard` | Photo, kind chip, title, date, like/comment counts | Kind chip color: navy-soft / sage-soft / line by category |
| `CreamCtaBanner` | Leaf icon, two-line copy, navy CTA, side photo | Photo hidden < 768px |

Existing `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm`, `.badge`, `.badge-accent`, `.badge-ok`, `.input`, `.label` are reused inside the cream scope; they pick up cream tokens automatically through the alias re-declarations. `.surface` is overridden inside the scope for the larger card radius and shadow.

## Layout

`landing-page.tsx` composes sections vertically inside a single `data-surface="readmates-cream"` root.

### Desktop (≥1024px)

```
CreamTopNav (sticky, height 72)
└─ container max 1240, padding-inline 32

   Hero block (cream-100 panel, padding 48 64, radius 14)
   ├─ 7-col text + CTA (CreamHero)
   └─ 5-col CreamClubCard (sticky top 88 inside hero scope)

   Sessions row (grid-2, gap 24)
   ├─ CreamFeatureCard variant="session"
   └─ CreamFeatureCard variant="book"

   Records section
   ├─ row: H2 + CreamSegmented + "전체 보기" link
   └─ grid-6 of CreamRecordCard (gap 16)

   CreamCtaBanner (cream-200 surface, padding 32 40)
```

Section spacing: `--space-2xl` (48px).

### Tablet (768–1023px)

- TopNav: same structure, may collapse some links into the hamburger.
- Hero: single column, photo above text. Club card drops below hero, full width.
- Sessions row: keep 2-col, reduce card height.
- Records grid: 3-col.
- CTA: photo retained but smaller.

### Mobile (<768px)

- `CreamMobileHeader` replaces `CreamTopNav`.
- Hero photo full-width on top, then headline / sub / chips / CTA stacked.
- Club card full width below hero.
- Sessions stack vertically (single column).
- Records become a horizontal scroll-snap rail (`scroll-snap-type: x mandatory`, card width `min(64vw, 240px)`, ~1.7 cards visible — matches the mobile frame in the mockup).
- CTA banner shows copy + button only; side photo hidden.

### Auth-state matrix

| Region | Guest (logged out) | Member (logged in) |
|---|---|---|
| Top nav right | "로그인" navy button | Bell + profile pill |
| Hero CTA | "로그인하고 함께하기" → `/login` | Host: "클럽 설정". Member: "내 공간으로" → `/app` |
| Club card member chips | Static count only | Chip click → member list (placeholder href) |
| Bottom CTA | "ReadMates 시작하기" → `/login` | "클럽에 기록 남기기" → `/app/notes/new` |

Host vs member distinction beyond the hero CTA is not handled in this spec.

## Data flow

Single direction: route → loader → UI. UI never fetches.

```
landing-route-data.ts
  landingLoader(args):
    1. Read auth/session (member context, host flag).
    2. Reuse publicClubLoader output for club info.
    3. Pull next session, current book, records preview from existing endpoints.
    4. Compose LandingRouteData.

LandingRouteData = {
  authState: { kind: "guest" } | { kind: "member"; user, isHost },
  club:        { name, description, status, host, memberCount, foundedAt?, recordCount? },
  nextSession: { id, title, date, episodeLabel, image } | null,
  currentBook: { id, title, author, quote?, coverUrl? } | null,
  records:     { items: RecordPreview[]; total: number },
}

landing-route.tsx
  const data = useLoaderData<LandingRouteData>();
  return <LandingPage data={data} />;
```

`foundedAt` and `recordCount` may not be present in the current `publicClubLoader` response. If absent, the corresponding rows render empty-state copy ("준비 중") and the gap is tracked as a follow-up backend ticket. No client-side fallback fetches.

Records preview reuses an existing list endpoint (notes/archive). The exact endpoint is decided in the implementation plan; the loader composes whatever shape `publicClubLoader` and the records endpoint return into `LandingRouteData`.

## Routing changes

| Path | Before | After |
|---|---|---|
| `/` | `<PublicHomePage />` + `publicClubLoader` | `<LandingRoute />` + `landingLoader` |
| `/clubs/:clubSlug` | `<PublicHomePage />` | unchanged |
| `/about`, `/records`, `/sessions/:id`, `/clubs/:slug/...` | unchanged | unchanged |

Only the default `/` route swaps. Club-slug routes keep today's behavior.

## Empty states and errors

- Club data missing: existing `PublicRouteError` still applies — no new error UI.
- `nextSession === null`: feature card renders "다음 모임이 정해지면 안내드릴게요" inside a `surface-quiet`.
- `currentBook === null`: feature card renders "다음 책을 고르고 있어요".
- `records.items` empty: grid replaced with a single "아직 함께 남긴 기록이 없어요" panel (cream-100, dashed line strong).
- Image load failure: book covers fall back to existing `shared/ui/book-cover` fallback. Other photos use a flat cream-200 placeholder.
- A failure in one section does not break the others — each section renders independently from its slice of `LandingRouteData`.

## Accessibility and i18n

- All interactive elements use the `--accent-primary` focus ring style already defined globally.
- Nav links, segmented control, and cards expose appropriate ARIA roles. Segmented uses `role="tablist"` with arrow-key navigation.
- Text wraps with `word-break: keep-all` and `overflow-wrap: break-word` (already in base stylesheet, retained inside cream scope).
- Status is communicated by both color and a textual or dot signal — no color-only state.
- `prefers-reduced-motion` is respected via the existing global rule.

## Verification

Default frontend checks (per `docs/agents/front.md`):

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

New unit tests (vitest):

- Each cream-* primitive: prop variants and accessibility attributes (one suite per file, kept light).
- `landingLoader`: auth-state branching, missing-field fallbacks.
- `<LandingPage />`: guest vs member rendering, empty-state branches.

New e2e test (playwright):

- `/` renders hero, club card, sessions row, records grid, CTA.
- Guest viewport shows "로그인" button in the top right.
- Mobile viewport (390×844) renders the records rail with horizontal scroll snap.

Manual visual review (required, attached to the PR):

- Capture at desktop 1440 / 1280 / 1024, tablet 768, mobile 390.
- Side-by-side comparison with the supplied mockup.
- WCAG AA contrast spot-checks: navy on cream-100, sage on cream-200, text-3 on cream-50.
- Keyboard-only walkthrough of nav drawer, segmented, CTA.

Existing-screen regression (lightweight, since palette is scoped):

- Visit `/login`, `/app`, `/app/host` once and confirm no color change vs. baseline.
- Any visible change indicates token leakage outside the cream scope and blocks the spec.

## Definition of Done

1. `/` route is served by `LandingRoute` with the cream surface applied.
2. Cream tokens and primitives only activate under `data-surface="readmates-cream"`. Visiting any non-cream route shows zero color change vs. the baseline.
3. Desktop, tablet, and mobile viewports match the mockup at the five sample widths above.
4. lint, test, build, and e2e all pass.
5. Missing backend fields render empty states and have follow-up issues filed.
6. `docs/agents/design.md` gains a one-paragraph note describing the cream surface and where it is allowed to apply.

## Open questions for implementation plan

- Hero photo asset: source the still-life images (license-safe) and add to `front/public/landing/`. Sized variants (480/960/1440w) for `<picture>` srcset.
- Records preview endpoint: reuse `notes` list, or extend `publicClubLoader` to include a preview slice. Pick whichever matches existing public read-permissions.
- Search input wiring: visual-only this spec, or hooked to a query param now? Default: visual-only, parked for follow-up.
- Notification bell behavior: render but inert this spec, or hidden for guests? Default: hidden for guests, inert for members (acts as link to `/app/notifications`).
