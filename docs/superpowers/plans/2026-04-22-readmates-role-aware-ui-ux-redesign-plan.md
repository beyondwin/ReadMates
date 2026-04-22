# ReadMates Role-Aware UI/UX Redesign Implementation Plan

작성일: 2026-04-22
상태: READY FOR REVIEW
기준 컨텍스트: `.impeccable.md`

> **For agentic workers:** Implement task-by-task. Keep route/auth behavior intact unless a task explicitly says otherwise. Update checkboxes as work completes. Preserve unrelated worktree changes.

## Goal

Make ReadMates feel like a real invitation-based reading club product across desktop web and mobile web, not a test site or generic SaaS dashboard.

The redesign must cover all visible role contexts:

1. **Guest:** public introduction, public records, login, invitation entry.
2. **Viewer/Member:** member workspace for current-session preparation, reading records, notes, archive, and personal space.
3. **Host:** member workspace plus host operations workspace, with explicit switching between the two.

Primary outcomes:

1. Public pages feel like a refined literary club journal with real records and clear trust signals.
2. Member pages feel like a personal reading desk focused on preparing for the next session.
3. Host pages feel like an efficient operating ledger, not a generic analytics dashboard.
4. Desktop and mobile have first-class layouts rather than one being a compressed version of the other.
5. Role transitions are explicit, predictable, and visually consistent.
6. Viewer/read-only, active member, suspended/restricted, and host states remain understandable.
7. Redundant buttons and duplicate navigation affordances are removed or converted into contextual actions.
8. List-to-detail navigation preserves context so returning to a list is predictable and smooth.
9. Page-to-page transitions, loading states, tab changes, and workspace switches feel continuous on both desktop and mobile.

## Scope Guardrails

- Do not redesign backend behavior, API contracts, auth rules, or database schema.
- Do not change route structure unless a verified navigation blocker requires it.
- Do not add a new design library or heavy UI dependency.
- Do not invent sample content when API data is empty.
- Do not hide critical functionality on mobile.
- Do not make host screens feel like a separate unrelated admin product.
- Do not use decorative gradient text, glassmorphism, glowing dark UI, or generic SaaS metric-card patterns.
- Do not rely on color alone for permission, status, or completion state.
- Do not duplicate global navigation or workspace switching actions inside page headers unless the page-level action has a distinct contextual purpose.
- Do not add decorative motion. Transitions must clarify state, direction, hierarchy, or perceived loading.
- Do not animate layout-heavy properties such as width, height, padding, or margin; prefer opacity and transform.
- Respect `prefers-reduced-motion` for all new page and state transitions.
- Keep Korean-first product language.

## Current Role And Route Baseline

The current router separates public, member, and host layers:

| Route group | Guest | Viewer | Active member | Host |
| --- | --- | --- | --- | --- |
| `/`, `/about`, `/records`, `/sessions/:sessionId` | Can view | Can view | Can view | Can view |
| `/login`, `/invite/:token` | Can use | Can use when relevant | Can use when relevant | Can use when relevant |
| `/app` | Redirect to login | Can view read-oriented member home | Can use member home | Can use member home |
| `/app/session/current` | Redirect to login | Can read, writes restricted | Can prepare and write | Can prepare and write |
| `/app/notes` | Redirect to login | Can browse | Can browse | Can browse |
| `/app/archive`, `/app/sessions/:sessionId` | Redirect to login | Can browse records | Can browse records | Can browse records |
| `/app/me` | Redirect to login | Can view own space | Can view own space | Can view own space |
| `/app/feedback/:sessionId` | Redirect to login | Locked unless eligible | Attendee-gated | Attendee-gated |
| `/app/host` and children | Redirect to login | Redirect to member app | Redirect to member app | Can use |

Design implication: host is not a separate persona replacing member. Host is an active member with an additional operations workspace.

## Workspace Switching Model

### Desktop

- Public pages use public navigation: `소개`, `클럽`, `공개 기록`, `로그인` or authenticated equivalent.
- Member workspace uses member navigation: `홈`, `이번 세션`, `클럽 노트`, `아카이브`, `내 공간`.
- Active host users in member workspace see a clear `호스트 화면` entry.
- Host workspace uses host navigation: `운영`, `세션 편집`, `멤버 초대`, `멤버 승인`.
- Host workspace always exposes `멤버 화면으로`.
- The brand link should land on the current workspace home:
  - guest: `/`
  - member: `/app`
  - host: `/app/host`
- `aria-current` must identify only the active navigation item.

### Mobile

- Guest uses the public mobile header and public footer.
- Member uses the member mobile header plus the member bottom tab bar.
- Active host users should not get an overcrowded member bottom tab bar. The host entry should live in the mobile header or a high-priority home shortcut.
- Host workspace uses a host-specific mobile header plus a compact host tab bar:
  - `오늘`
  - `세션`
  - `멤버`
  - `기록`
- Host workspace mobile header must provide `멤버 화면으로`.
- Host edit tab must handle current-session loading:
  - current session known: edit current session
  - no current session: create new session
  - loading unknown: non-broken disabled/pending state

### Transition Rules

- Guest to app:
  - unauthenticated app routes go to `/login`.
  - login/invite success leads to the correct member state using existing auth behavior.
- Viewer to active member:
  - viewer state must clearly explain read-only limits and the path to full membership.
- Member to host:
  - only active hosts see host entry points.
  - non-host users should never see host CTAs that route-guard will reject.
- Host to member:
  - host can return to `/app` at all times.
  - host screens should still feel part of ReadMates, not a separate back office.

## Design Direction

Use the existing `Modern editorial · warm neutral · ink blue` foundation, but make it more specific and more premium:

- **Public:** literary journal, published records, calm invitation.
- **Member:** private reading desk, current book, preparation progress, personal archive.
- **Host:** operating ledger, session document, member status list, clear next actions.
- **Mobile:** native reading companion with thumb-friendly primary actions.

Core visual language:

- Paper-like surfaces, ink hierarchy, restrained accent color.
- Fewer generic cards; more lists, ledgers, documents, and archive rows.
- Stronger typography and spacing rhythm.
- Real book covers and records as the main visual material.
- Clear empty, locked, viewer, loading, and disabled states.

## Task 0 - Baseline Inventory And Visual Capture

**Files:** none expected.

- [x] Run `git status --short --branch --untracked-files=all` and record worktree state before Task 0 documentation edits.
  - Current remediation check returned a clean worktree:

```text
## main...origin/main
```

  - The earlier claim that `.github/workflows/deploy-front.yml` was an unrelated pre-existing dirty file could not be verified from the current review output, and this plan no longer treats it as established history.
- [x] Run baseline checks if practical:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

  - Remediation check results: all passed. Evidence and command snippets are recorded in `.tmp/task0-baseline-capture/evidence.md`.
    - `pnpm --dir front lint`: PASS, exit code 0 (`eslint .` completed with no findings).
    - `pnpm --dir front test`: PASS, exit code 0 (37 test files passed, 272 tests passed).
    - `pnpm --dir front build`: PASS, exit code 0 (Vite built 110 modules and emitted `dist/index.html`, CSS, and JS assets).

- [x] Start the local frontend and backend or use existing dev fixtures.
  - Used existing local servers: Vite `http://localhost:5173` (PID 948), Spring `http://localhost:8080` (PID 916), MySQL `readmates`; temporary screenshot auth/invite rows were cleaned up.
- [x] Capture desktop and mobile screenshots for:
  - `/`
  - `/about`
  - `/records`
  - `/sessions/:sessionId`
  - `/login`
  - `/invite/:token`
  - `/app`
  - `/app/session/current`
  - `/app/notes`
  - `/app/archive`
  - `/app/me`
  - `/app/host`
  - `/app/host/sessions/new`
  - `/app/host/members`
  - `/app/host/invitations`
  - Evidence: `.tmp/task0-baseline-capture/evidence.md`, `.tmp/task0-baseline-capture/capture-summary.json`, and 30 route screenshots under `.tmp/task0-baseline-capture/screenshots/`. `/records` redirects to `/sessions/00000000-0000-0000-0000-000000000306` before capture.
- [x] Record visible test-site symptoms:
  - generic repeated cards
  - weak hierarchy
  - unclear role state
  - dead-looking controls
  - duplicate top-nav/page-header buttons
  - duplicate mobile-header/in-body actions
  - unclear list-to-detail return paths
  - lost tab/filter/scroll context after returning from detail
  - abrupt route changes
  - full-page loading text that collapses the previous layout
  - tab or filter changes that feel like unrelated pages
  - mobile header/title/back changes that jump during navigation
  - desktop workspace switching that feels like a separate product
  - mobile overcrowding
  - inconsistent copy
  - empty states that look unfinished
  - Evidence recorded in `.tmp/task0-baseline-capture/evidence.md` and `.tmp/task0-baseline-capture/symptom-probes.md`. Notable findings: desktop `/app` duplicates member/host navigation actions, desktop `/app/host` duplicates `멤버 초대` and `멤버 화면으로`, `/app/archive` has repeated generic `열기 →` actions, `/app/me` repeats `읽기` and `PDF로 저장`, mobile host pages mix header return actions with in-body return copy, `/records` immediately redirects to a detail page, archive browser-back restored URL but lost scroll (`900 -> 0`), and delayed current-session loading collapses to a mostly blank page with only `불러오는 중`.

Expected result: implementation starts with evidence, not guesses.

## Task 1 - Role-Aware App Shell And Navigation

**Files:**

- Modify: `front/src/app/layouts.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/shared/ui/public-mobile-header.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/shared/ui/public-auth-action-state.ts`
- Modify: `front/shared/ui/readmates-copy.ts`
- Modify tests:
  - `front/tests/unit/responsive-navigation.test.tsx`
  - `front/tests/unit/spa-layout.test.tsx`
  - `front/tests/e2e/responsive-navigation-chrome.spec.ts`

- [x] Audit the current shell variants: guest, member, host.
- [x] Keep public, member, and host navigation labels consistent with `readmates-copy.ts`.
- [x] Ensure active hosts see `호스트 화면` from the member workspace on desktop.
- [x] Ensure active hosts see `호스트 화면` from the member workspace on mobile without adding a sixth member tab.
- [x] Ensure host workspace desktop always exposes `멤버 화면으로`.
- [x] Ensure host workspace mobile always exposes `멤버 화면으로`.
- [x] Keep public pages usable while authenticated. If the auth action changes to an app entry, make it explicit and tested.
- [x] Make loading states in mobile host edit navigation non-broken while `currentSessionId` is unknown.
- [x] Keep `RequireMemberApp` and `RequireHost` as the authority for access control.
- [x] Add/update tests for:
  - guest nav
  - member nav
  - viewer/member no host entry
  - active host member-side host entry
  - host-side member return
  - mobile host tab routing

Expected result: every role can tell where they are, what workspace they are in, and how to move to another allowed workspace.

## Task 1A - Action Hierarchy And Duplicate Control Audit

**Files:**

- Modify shared shell/action files as needed:
  - `front/shared/ui/top-nav.tsx`
  - `front/shared/ui/mobile-header.tsx`
  - `front/shared/ui/mobile-tab-bar.tsx`
  - `front/shared/ui/readmates-copy.ts`
- Modify page components that duplicate global navigation or workspace actions:
  - `front/features/public/components/public-home.tsx`
  - `front/features/public/components/public-club.tsx`
  - `front/features/public/components/public-session.tsx`
  - `front/features/member-home/components/member-home.tsx`
  - `front/features/current-session/components/current-session.tsx`
  - `front/features/archive/components/archive-page.tsx`
  - `front/features/archive/components/member-session-detail-page.tsx`
  - `front/features/archive/components/my-page.tsx`
  - `front/features/feedback/components/feedback-document-page.tsx`
  - `front/features/host/components/host-dashboard.tsx`
  - `front/features/host/components/host-session-editor.tsx`
  - `front/features/host/components/host-members.tsx`
  - `front/features/host/components/host-invitations.tsx`
- Modify tests where labels or visible actions change:
  - `front/tests/unit/responsive-navigation.test.tsx`
  - `front/tests/unit/member-home.test.tsx`
  - `front/tests/unit/host-dashboard.test.tsx`
  - `front/tests/unit/host-session-editor.test.tsx`
  - `front/tests/unit/host-invitations.test.tsx`
  - `front/tests/unit/archive-page.test.tsx`
  - `front/tests/unit/member-session-detail-page.test.tsx`

- [x] Audit every route and classify visible actions as:
  - global navigation
  - workspace switch
  - page primary action
  - contextual secondary action
  - destructive/danger action
- [x] Remove page-header buttons that only duplicate a visible top navigation item.
- [x] Remove or demote in-body shortcut cards when the same destination is already obvious in the current shell.
- [x] Keep a page-level button only when it performs a contextual job, not just navigation.
- [x] On member home, keep one dominant current-session action. Demote archive/notes shortcuts if they duplicate the bottom/top navigation and do not add context.
- [x] On host dashboard, avoid repeating `멤버 화면으로`, `멤버 초대`, `세션 편집`, or `새 세션` in multiple adjacent places unless the duplicate is tied to a specific empty state.
- [x] On public pages, avoid repeating `클럽 소개`, `공개 기록`, and login actions in the hero, nav, and section headers at the same visual weight.
- [x] On mobile, choose one workspace switch location per state:
  - header action, or
  - high-priority home shortcut,
  - not both unless each has a different purpose.
- [x] Ensure every page has at most one visual primary CTA in the first viewport.
- [x] Convert retained secondary navigation into quieter text links or contextual rows rather than more primary/ghost buttons.
- [x] Update tests to assert role-specific actions that should remain and absence of duplicated controls where practical.

Expected result: the interface has a clear action hierarchy; users do not see repeated buttons that compete with the top menu or mobile tab bar.

## Task 2 - Visual Foundation And Shared UI Vocabulary

**Files:**

- Modify: `front/shared/styles/tokens.css`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`
- Modify as needed:
  - `front/shared/ui/book-cover.tsx`
  - `front/shared/ui/avatar-chip.tsx`
  - `front/shared/ui/session-identity.tsx`

- [x] Add semantic spacing tokens based on the existing 4pt scale.
- [x] Add semantic surface classes for product concepts:
  - reading desk
  - record row
  - ledger row
  - document panel
  - action cluster
  - empty state
  - locked state
- [x] Reduce dependence on generic `.surface` and `.surface-quiet` for new or touched layouts.
- [x] Keep surface radius at 8px or less where practical unless an existing component requires otherwise.
- [x] Strengthen focus-visible styles for links, buttons, tabs, form fields, and icon buttons.
- [x] Define consistent disabled, pending, success, warning, locked, and read-only treatments.
- [x] Remove or avoid colored side accent stripes and gradient text.
- [x] Review text sizing for Korean and English mixed content.
- [x] Keep body text readable on mobile at 16px-equivalent where possible.
- [x] Preserve reduced-motion support for any new motion.

Expected result: later page work uses a coherent product language instead of one-off inline styles.

## Task 2A - Global Screen Transition And Loading Continuity

**Files:**

- Modify shared routing/layout/data state files as needed:
  - `front/src/app/layouts.tsx`
  - `front/src/app/router.tsx`
  - `front/src/app/router-link.tsx`
  - `front/src/pages/readmates-page.tsx`
  - `front/src/pages/readmates-page-data.ts`
  - `front/src/styles/globals.css`
  - `front/shared/styles/tokens.css`
  - `front/shared/styles/mobile.css`
  - `front/shared/ui/mobile-header.tsx`
  - `front/shared/ui/mobile-tab-bar.tsx`
- Modify tests:
  - `front/tests/unit/spa-layout.test.tsx`
  - `front/tests/unit/responsive-navigation.test.tsx`
  - `front/tests/e2e/responsive-navigation-chrome.spec.ts`

- [x] Audit all primary transition types on desktop and mobile:
  - public page to public page
  - public page to login/invite
  - guest/member/host auth boundary transition
  - member top-nav/bottom-tab transitions
  - host workspace transitions
  - member-to-host and host-to-member workspace switch
  - list-to-detail and detail-to-list
  - tab/filter changes inside a page
  - form save/error/success state changes
- [x] Add motion tokens for route and state transitions:
  - fast feedback: 100-150ms
  - page/content change: 160-240ms
  - larger reveal/sheet: 250-320ms
  - easing based on refined ease-out/ease-in curves
- [x] Decide whether to use native View Transitions API / React Router view-transition support or a CSS-only route shell. Document the choice in code comments only if the implementation is non-obvious.
- [x] Keep persistent chrome stable during navigation:
  - desktop top nav should not remount visually on same-shell route changes
  - mobile header and bottom tab bar should stay spatially stable
  - public footer should not flash above loading content
- [x] Replace bare `불러오는 중` route loading with shell-aware loading states:
  - public pages: editorial skeleton/record placeholders
  - member pages: reading-desk skeletons
  - host pages: ledger/document skeletons
  - mobile pages: fixed-header-safe skeletons
- [x] Ensure loading states preserve expected page height so content does not jump when data resolves.
- [x] Use progressive content reveal for route completion, but keep it subtle:
  - desktop: opacity plus small vertical offset only where useful
  - mobile: opacity plus very small vertical offset; avoid large horizontal page slides unless direction is necessary
- [x] Treat tab/filter changes as in-page state changes, not full route changes.
- [x] Treat list-to-detail transitions as directional context changes:
  - preserve source list context
  - avoid losing scroll position
  - make the back/return affordance visible before users scroll
- [x] Treat workspace switches as clear context switches:
  - member -> host should feel like entering operations, not a separate app
  - host -> member should feel like returning to reading workspace
  - avoid duplicated transition plus duplicated CTA noise
- [x] Make mobile title/back/right-action changes feel stable when moving between list and detail.
- [x] Ensure form save/error/success feedback updates in place without causing layout jumps.
- [x] Add reduced-motion fallback:
  - disable spatial movement
  - preserve opacity or instant state changes
  - keep focus indicators and loading feedback functional
- [x] Verify transition performance:
  - no animating width/height/padding/margin
  - no long-running entrance animations on every route
  - no animation masking slow API loading

Expected result: route changes, role switches, tab changes, loading, and detail navigation feel intentional and continuous on desktop and mobile.

## Task 3 - Guest Public Experience

**Files:**

- Modify: `front/features/public/components/public-home.tsx`
- Modify: `front/features/public/components/public-club.tsx`
- Modify: `front/features/public/components/public-session.tsx`
- Modify: `front/src/pages/public-records.tsx`
- Modify: `front/shared/ui/public-footer.tsx`
- Modify tests:
  - `front/tests/unit/public-home.test.tsx`
  - `front/tests/unit/public-club.test.tsx`
  - `front/tests/unit/public-session-page.test.tsx`
  - `front/tests/unit/public-records-page.test.tsx`

- [x] Redesign public home as the first trust signal for a real club.
- [x] Make the hero show the club name, current editorial promise, and latest public record.
- [x] Keep a hint of the next section visible on desktop and mobile first viewport.
- [x] Use latest session/book/record data as primary visual material.
- [x] Replace generic value-card grids with editorial sections:
  - latest record
  - club rhythm
  - public notes
  - membership boundary
- [x] Make empty public records feel intentional, not broken.
- [x] On public club page, make club rules, cadence, and membership limits easy to scan.
- [x] On public session page, make published summaries, highlights, and one-line reviews feel like an archived record.
- [x] On records list, use archive/index styling instead of generic cards.
- [x] Replace redirect-only public records behavior if it prevents guests from browsing a list before entering detail.
- [x] Make login and invitation CTAs specific:
  - `로그인`
  - `초대 수락하기`
  - `최근 공개 기록 보기`
  - `클럽 소개 보기`
- [x] Verify mobile public pages do not hide record access or membership explanation.

Expected result: guests understand the club's seriousness, records, and invitation boundary without needing private app access.

## Task 4 - Auth, Invite, Pending, And Boundary States

**Files:**

- Modify: `front/features/auth/components/login-card.tsx`
- Modify: `front/features/auth/components/invite-acceptance-card.tsx`
- Modify: `front/features/auth/components/password-reset-card.tsx`
- Modify: `front/src/pages/pending-approval.tsx`
- Modify tests:
  - `front/tests/unit/login-card.test.tsx`
  - `front/tests/unit/invite-acceptance-card.test.tsx`
  - `front/tests/unit/password-reset-card.test.tsx`

- [x] Make login feel like entering a private club, not a test auth screen.
- [x] Keep dev-login controls clearly marked as local development only when present.
- [x] Make retired password routes and reset states visually intentional.
- [x] Make invitation acceptance explain:
  - invited email boundary
  - Google account match requirement
  - what happens after acceptance
- [x] Make pending approval explain whether the user is viewer, pending, or blocked by approval state.
- [x] Ensure auth boundary screens have mobile-safe CTAs and no confusing dead controls.

Expected result: authentication and membership transitions feel like part of the product, not scaffolding.

## Task 5 - Member Home And Current Session Workspace

**Files:**

- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/features/member-home/components/prep-card.tsx`
- Modify: `front/features/member-home/components/member-home-current-session.tsx`
- Modify: `front/features/member-home/components/member-home-records.tsx`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/features/current-session/components/current-session-panels.tsx`
- Modify: `front/features/current-session/components/current-session-question-editor.tsx`
- Modify tests:
  - `front/tests/unit/member-home.test.tsx`
  - `front/tests/unit/current-session.test.tsx`
  - `front/tests/unit/current-session-actions.test.ts`
  - `front/tests/unit/member-session-detail-page.test.tsx`

- [x] Make `/app` answer three questions immediately:
  - What are we reading now?
  - What do I need to do next?
  - What has the club been thinking about recently?
- [x] Redesign `PrepCard` as a reading desk, not a generic card.
- [x] Prioritize current session title, author, date, location, and question deadline.
- [x] Show preparation progress with concrete statuses:
  - RSVP
  - reading check-in
  - questions
  - one-line review
- [x] Make primary action `세션 열기` visually dominant.
- [x] Make meeting link secondary but easy to access.
- [x] For viewer members, clearly show read-only limits and avoid write-looking controls.
- [x] For active members, make RSVP, check-in, question, and review actions feel direct.
- [x] For hosts viewing member workspace, keep member preparation controls plus a host workspace entry.
- [x] For no current session, show a polished waiting state with host-specific create action only for hosts.
- [x] On current session detail, separate:
  - session identity
  - my preparation
  - shared board
  - questions
  - reviews
  - host-only controls when applicable
- [x] Make save/loading/error states specific and visible near the action.
- [x] Ensure all forms use visible labels, helper text only where useful, and clear validation copy.

Expected result: members can prepare for a session without hunting, and viewer/host variants are explicit.

## Task 6 - Archive, Notes, Feedback, And Personal Space

**Files:**

- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/features/archive/components/member-session-detail-page.tsx`
- Modify: `front/features/archive/components/notes-feed-page.tsx`
- Modify: `front/features/archive/components/notes-feed-list.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/features/feedback/components/feedback-document-page.tsx`
- Modify tests:
  - `front/tests/unit/archive-page.test.tsx`
  - `front/tests/unit/member-session-detail-page.test.tsx`
  - `front/tests/unit/notes-feed-page.test.tsx`
  - `front/tests/unit/notes-page.test.tsx`
  - `front/tests/unit/my-page.test.tsx`
  - `front/tests/unit/feedback-document-page.test.tsx`

- [x] Reframe archive as preserved reading records, not a tabbed data dump.
- [x] Keep tabs, but make the selected view feel like a document section.
- [x] Keep archive tab state reflected in the URL so returning from detail preserves the user's section.
- [x] Redesign session archive list with year grouping, session number, book metadata, attendance, publication, and feedback status.
- [x] Make questions and reviews read like saved excerpts.
- [x] Make feedback documents feel like formal documents, with locked states that explain access rules.
- [x] Make notes feed scannable by session and author without feeling like a social feed.
- [x] Make `내 공간` focused on member identity, attendance, my writing, and account boundary.
- [x] Remove or clearly mark unavailable settings as pending/read-only.
- [x] Ensure mobile archive and notes flows are not just compressed desktop tables.

Expected result: records have gravity, and members have reasons to revisit their archive.

## Task 6A - List/Detail Navigation Continuity

**Files:**

- Modify shared navigation helpers as needed:
  - `front/src/app/layouts.tsx`
  - `front/src/app/router-link.tsx`
  - `front/shared/ui/mobile-header.tsx`
- Modify list/detail pages:
  - `front/src/pages/public-records.tsx`
  - `front/features/public/components/public-session.tsx`
  - `front/features/archive/components/archive-page.tsx`
  - `front/features/archive/components/member-session-detail-page.tsx`
  - `front/features/archive/components/notes-feed-page.tsx`
  - `front/features/archive/components/notes-feed-list.tsx`
  - `front/features/feedback/components/feedback-document-page.tsx`
  - `front/features/host/components/host-session-editor.tsx`
- Modify tests:
  - `front/tests/unit/public-records-page.test.tsx`
  - `front/tests/unit/archive-page.test.tsx`
  - `front/tests/unit/member-session-detail-page.test.tsx`
  - `front/tests/unit/public-session-page.test.tsx`
  - `front/tests/unit/feedback-document-page.test.tsx`
  - `front/tests/e2e/responsive-navigation-chrome.spec.ts`

- [x] Define canonical return targets for every detail route:
  - `/sessions/:sessionId` -> `/records` or the public records list fallback.
  - `/app/sessions/:sessionId` -> `/app/archive?view=sessions` unless a more specific source was provided.
  - `/app/feedback/:sessionId` -> `/app/archive?view=report` or the originating session detail when linked from a session page.
  - `/app/feedback/:sessionId/print` -> `/app/feedback/:sessionId`.
  - `/app/host/sessions/:sessionId/edit` -> `/app/host` or the host session list context if one is introduced.
- [x] Preserve archive tab state in the URL when switching between `세션`, `내 서평`, `내 질문`, and `피드백 문서`.
- [x] Preserve notes filter/session selection in the URL or route state when opening and returning from a note/session detail.
- [x] For links from list rows to detail, pass a source label and fallback return path when route state is useful.
- [x] Add page-level return affordances only on true detail pages. Do not add them to pages already covered by a persistent tab/top nav unless users can arrive from a list.
- [x] Make mobile header back links match the same canonical return targets as desktop.
- [x] Avoid relying only on browser history; direct deep links must still have a sensible fallback return target.
- [x] Add scroll restoration or targeted scroll preservation so returning from a detail page does not always drop the user at the top of a long list.
- [x] Ensure returning from detail keeps the same archive tab, filter, and list position where practical.
- [x] Ensure route transitions do not visually jump under fixed mobile headers or bottom tab bars.
- [x] Coordinate with Task 2A so detail pages use the same route transition timing and reduced-motion behavior as the rest of the app.
- [x] Browser-test:
  - public records list -> public session -> records list
  - archive sessions -> session detail -> same archive list position
  - archive feedback tab -> feedback document -> feedback tab
  - host dashboard -> session editor -> host dashboard

Expected result: users can move from a list into detail and back without losing their place, selected tab, or mental context.

## Task 7 - Host Operations Workspace

**Files:**

- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/host/components/host-members.tsx`
- Modify: `front/features/host/components/host-invitations.tsx`
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/features/host/components/host-session-deletion-preview.tsx`
- Modify: `front/features/host/components/host-session-feedback-upload.tsx`
- Modify tests:
  - `front/tests/unit/host-dashboard.test.tsx`
  - `front/tests/unit/host-members.test.tsx`
  - `front/tests/unit/host-invitations.test.tsx`
  - `front/tests/unit/host-session-editor.test.tsx`
  - `front/tests/unit/host-invitation-actions.test.ts`

- [x] Redesign `/app/host` as an operating ledger.
- [x] Replace generic KPI-card feeling with clear work sections:
  - needs attention
  - current session document
  - operation timeline
  - member status
  - quick actions
- [x] Keep metrics but make them support operations, not dominate the page.
- [x] Distinguish:
  - no current session
  - no pending work
  - pending work
  - feature not connected yet
- [x] Make disabled reminder/send actions visibly unavailable with a concrete reason.
- [x] Make member missing-from-session alert feel actionable and trustworthy.
- [x] Redesign session editor as a document editor:
  - book and schedule
  - meeting info
  - attendees
  - publication
  - feedback document
  - dangerous actions
- [x] Make host members page clarify approval, active, viewer, suspended, and current-session participation states.
- [x] Make invitations page show invite creation, pending invites, used/expired states, and copy/share actions with clear feedback.
- [x] Keep host mobile screens complete, especially member approval and session editing.

Expected result: hosts can operate the club quickly while staying in the same ReadMates visual world.

## Task 8 - Mobile Role-Specific UX Pass

**Files:**

- Modify: `front/shared/styles/mobile.css`
- Modify mobile-specific branches inside touched page components.
- Modify tests:
  - `front/tests/unit/responsive-navigation.test.tsx`
  - `front/tests/e2e/responsive-navigation-chrome.spec.ts`

- [x] Validate mobile guest shell:
  - public header
  - public page CTAs
  - records access
  - login/invite entry
  - public route transitions under the sticky header
- [x] Validate mobile member shell:
  - header clarity
  - five-tab bottom navigation
  - current session primary action
  - no host clutter for non-host members
  - no duplicate header action and in-body shortcut for the same destination
  - bottom-tab transitions do not feel like hard reloads
- [x] Validate mobile host shell:
  - host header
  - four-tab host navigation
  - member return action
  - session edit route handling
  - host/member workspace switching feels stable
- [x] Ensure no fixed element overlaps:
  - mobile header
  - bottom tab bar
  - primary CTA
  - sheet/dialog if present
- [x] Ensure all tap targets are at least 44px where practical.
- [x] Ensure long Korean labels wrap cleanly or truncate intentionally.
- [x] Avoid horizontal scroll except where intentionally used for compact tabs or record carousels.
- [x] Test narrow widths around 360px and desktop widths above 1280px.

Expected result: mobile feels designed for actual use before, during, and after reading sessions.

## Task 9 - Interaction, State, And Accessibility Polish

**Files:** all touched UI files.

- [x] Add or verify focus-visible state for all new interactive surfaces.
- [x] Verify keyboard navigation through:
  - top nav
  - mobile tabs
  - archive tabs
  - forms
  - host quick actions
- [x] Make disabled controls non-clickable and explain why.
- [x] Make loading states specific:
  - `세션을 불러오는 중`
  - `초대를 확인하는 중`
  - `변경사항을 저장하는 중`
- [x] Make errors actionable:
  - what failed
  - why if known
  - what to do next
- [x] Make success feedback short and tied to the completed action.
- [x] Use `aria-label` for icon-only actions.
- [x] Preserve semantic heading order.
- [x] Ensure WCAG AA contrast for text, controls, and status indicators.
- [x] Ensure state is not conveyed by color alone.

Expected result: the redesign improves usability, not only appearance.

## Task 10 - Test And Browser Verification

**Commands:**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

- [x] Run focused unit tests after each major role area.
- [x] Run full frontend tests before final handoff.
- [x] Run build before browser QA.
- [x] Browser-check role flows:
  - guest views public home and public records
  - guest opens a public record and returns to the public records list
  - guest opens login
  - viewer opens member app and sees read-only limits
  - active member prepares current session
  - active member opens an archive item and returns to the same archive context
  - host opens member app
  - host switches to host workspace
  - host returns to member workspace
  - host opens session editor
  - host returns from session editor to the host operations context
- [x] Browser-check transition quality on desktop:
  - no whole-page flash between top-nav routes
  - loading preserves page geometry
  - tab/filter changes do not reset surrounding layout
  - focus lands in a sensible place after route changes
- [x] Browser-check transition quality on mobile:
  - header title/back/right action do not jump
  - bottom tab remains stable
  - content does not render underneath fixed chrome
  - reduced motion remains usable
- [x] Capture final desktop screenshots for guest/member/host key pages.
- [x] Capture final mobile screenshots for guest/member/host key pages.
- [x] Check final UI against `.impeccable.md` principles:
  - private library, not SaaS dashboard
  - records have gravity
  - tension through restraint
  - warm trust, clear action
  - mobile is a native reading companion
  - accessible by default

Expected result: the finished UI is verified visually and functionally across roles.

## Suggested Implementation Sequence

1. Task 0: capture baseline.
2. Task 1: fix shell/navigation and role switching first.
3. Task 1A: remove duplicate controls and establish action hierarchy.
4. Task 2: establish visual foundation.
5. Task 2A: establish global route transition and loading continuity.
6. Task 3 and Task 4: redesign guest/public and boundary screens.
7. Task 5: redesign member home/current session.
8. Task 6: redesign archive/notes/my/feedback records.
9. Task 6A: fix list/detail return flows and context preservation.
10. Task 7: redesign host operations.
11. Task 8: run mobile-specific pass across all roles.
12. Task 9 and Task 10: accessibility, tests, browser verification.

## Definition Of Done

- Guest, member, and host each have a clear first-screen experience.
- Active hosts can switch between member and host workspaces on desktop and mobile.
- Non-host members do not see host-only affordances.
- Duplicate buttons that only repeat the top menu, mobile header, or bottom tab bar are removed or demoted.
- Each first viewport has one clear primary action.
- Detail pages provide a clear return path to their originating or canonical list context.
- Returning from detail preserves tab/filter/scroll context where practical.
- Route transitions, loading states, tab changes, and role/workspace switches feel continuous on desktop and mobile.
- `prefers-reduced-motion` users get non-spatial or instant alternatives without losing state feedback.
- Viewer/read-only states are visually distinct from active member states.
- Public pages no longer feel like temporary marketing pages.
- Member pages prioritize preparation and records.
- Host pages prioritize operational decisions and next actions.
- Mobile layouts are complete and thumb-friendly.
- Empty, loading, locked, disabled, and error states are intentional.
- Lint, unit tests, build, and relevant e2e checks pass or any blocker is recorded with exact output.
