# ReadMates Platform Admin Triage Console Design

## Context

ReadMates already has a platform admin route at `/admin`, platform admin auth, platform-level club registry APIs, domain provisioning APIs, club onboarding APIs, and support access grant APIs. The current frontend surface is functional but reads like a thin collection of controls:

- Top-level metrics show role, active club count, and domain action count.
- Club registry rows show basic club metadata but do not explain operational priority.
- The selected club detail edits public information and visibility, but it does not show a publish-readiness checklist.
- Domain rows are listed globally rather than in the selected club's operational context.
- Support access grants start empty and require manual `clubId` entry even though the admin is already looking at a club.

The result is that an operator can technically perform actions but cannot quickly answer the operational question: "Which club needs attention, why, and what is the safest next action?"

This design upgrades `/admin` into a platform triage console. It keeps club-internal operations in the host app and keeps frontend data flow inside the existing route-first architecture.

## Approved Direction

Use the recommended "Triage Console" approach.

The `/admin` first screen becomes:

1. Platform-level status strip.
2. Work queue of clubs ordered by operational urgency.
3. Selected-club operations brief with publish readiness, public metadata, domains, onboarding state, and support access grants.
4. New-club onboarding kept as a focused workflow under the console, not as a separate product surface.

This design does not create a duplicate host dashboard. It preserves the architecture rule in `docs/development/architecture.md`: platform admin owns club creation, platform metadata, public/private exposure, domain status, first-host onboarding state, and exceptional support access. Sessions, members, RSVP, attendance, publication, and notification dispatch remain host-app responsibilities.

## Goals

- Make `/admin` answer "what should I do next?" rather than only "what data exists?"
- Use the current platform admin APIs where possible.
- Keep feature code under `front/features/platform-admin` with `api`, `model`, `route`, and `ui` boundaries.
- Move non-rendering decisions into a pure model module so the UI stays prop/callback driven.
- Make support access safer by binding grant creation to the selected club and loading active grants for that club.
- Show role and permission limits clearly without relying on UI gating as the only security control.
- Preserve ReadMates' design tone: quiet, archival, ledger-like, dense enough for operators, and not a generic SaaS dashboard.

## Non-Goals

- No host session management inside `/admin`.
- No general member administration inside `/admin`.
- No member private notes, RSVP details, feedback document bodies, or internal club content in `/admin`.
- No new platform admin user management surface.
- No audit-log explorer in this first triage-console pass.
- No new domain provisioning backend model beyond the existing marker-check workflow.
- No private member data, real domains, deployment state, secrets, token-shaped examples, OCIDs, or local absolute paths in docs, fixtures, or UI examples.

## Architecture Principles

### Frontend Boundary

The implementation follows the current route-first dependency direction:

```text
src/app -> src/pages -> features -> shared
```

Within the platform admin feature:

```text
features/platform-admin/api
features/platform-admin/model
features/platform-admin/route
features/platform-admin/ui
```

- `api` owns BFF calls and contract types.
- `model` owns pure triage calculations: queue ordering, publish checklist, metrics, status labels, selected-club brief.
- `route` owns loader data, selected-club state, mutation calls, support-grant loading, and response-to-view mapping.
- `ui` renders from props and callbacks only; it does not call `fetch`, `readmatesFetch`, feature API functions, router loaders, or shared API primitives.

### SOLID Application

- **Single Responsibility:** Work-queue classification, route mutation coordination, and visual rendering live in separate files. No component should both classify club readiness and perform API calls.
- **Open/Closed:** Queue rules are represented as small pure functions and severity values, so new operational signals can be added without rewriting the dashboard shell.
- **Liskov Substitution:** UI components receive narrow view models rather than API response objects. A test fixture view model can stand in for real loader data without requiring API-only fields.
- **Interface Segregation:** Components receive only the data and callbacks they need. For example, the domain panel receives selected-club domains and `onCheckDomain`; it does not receive onboarding handlers or support-grant handlers.
- **Dependency Inversion:** The route depends on API functions and passes results downward. UI depends on prop contracts, not concrete fetch implementations.

### Server Boundary

The design does not require new server endpoints for the first pass. It uses:

- `GET /api/admin/summary`
- `GET /api/admin/clubs`
- `PATCH /api/admin/clubs/{clubId}`
- `POST /api/admin/clubs/onboarding/preview`
- `POST /api/admin/clubs/onboarding`
- `POST /api/admin/domains/{domainId}/check`
- `GET /api/admin/support-access-grants?clubId={clubId}`
- `POST /api/admin/support-access-grants`
- `DELETE /api/admin/support-access-grants/{grantId}`

One server-side hardening belongs with this work: support access grant creation and revoke must have explicit application-service role checks. UI affordances are not an authorization boundary. The intended policy is:

- `OWNER`: can create and revoke support access grants.
- `OPERATOR`: can read platform metadata and perform normal platform operations, but does not create support access grants in this first pass.
- `SUPPORT`: can read metadata and use an already granted support path, but cannot create or revoke grants.

This hardening stays in the existing `club` write-side package:

```text
club.adapter.in.web -> club.application.port.in -> club.application.service -> club.application.port.out
```

## User Model

Primary operator persona:

- Platform admin who manages multiple invite-only reading clubs.
- Needs to identify blocked clubs, prepare new clubs for launch, verify domain setup, and grant temporary support access during escalations.
- Should not need to inspect club-internal content to perform platform-level work.

Key questions the UI should answer:

- Which clubs need attention now?
- Is this club safe to make public?
- Is the first host assigned or invited?
- Are custom domains blocked, waiting, active, or failed?
- Is there an active support access grant for this club?
- Which actions are allowed for my platform role?

## Information Architecture

### Platform Status Strip

The top strip shows operational counts derived from `summary` and `clubs`:

- Platform role.
- Active club count from `summary.activeClubCount`.
- Clubs requiring action, derived from queue items with blocking or warning status.
- Domains requiring action from `summary.domainActionRequiredCount`.
- Clubs ready to publish, derived from `status`, `publicVisibility`, `firstHostOnboardingState`, and domain state.

The strip should be dense and factual. It should not use marketing hero language.

### Work Queue

The left region is a work queue, not a plain registry table. Each row represents a club with:

- Club name and slug.
- Operational severity: `blocked`, `attention`, `ready`, or `stable`.
- Status badges: club lifecycle, public visibility, host onboarding state, domain state.
- Primary reason text.
- Primary action label.

Default ordering:

1. Blocked publish candidates.
2. Domain failures or action-required domains.
3. First-host missing or invited state.
4. Ready-to-publish private clubs.
5. Stable public clubs.
6. Archived or suspended clubs.

Filters:

- `조치 필요`
- `공개 준비`
- `도메인`
- `전체`

The filters are local frontend state and do not require server query changes.

### Selected Club Operations Brief

The right region shows the selected club. If no club is selected, the route selects the first queue item. The brief includes:

- Club identity: name, slug, lifecycle status, public visibility.
- Publish-readiness checklist.
- Public metadata edit fields.
- Domain provisioning panel filtered to the selected club.
- Support access grants for the selected club.
- Safe action rail showing allowed and blocked actions.

The brief makes public/private actions explicit:

- `PUBLIC` action is primary only when the checklist passes.
- If blocked, the UI shows the blocking reasons before the action.
- `PRIVATE` action remains available to `OWNER` and `OPERATOR` when the club is public and not archived.
- `SUSPENDED` and `ARCHIVED` lifecycle transitions remain outside this pass.

### New Club Onboarding

The existing onboarding wizard remains available from the console. It should be visually integrated with the triage screen:

- `새 클럽` opens the wizard region.
- Successful onboarding prepends/replaces the created club in the route state.
- If the result includes a domain, route state also updates the summary domain list.
- The newly created club becomes the selected club after commit.

The wizard remains platform-owned and does not become a host workflow.

## Publish Readiness Model

Publish readiness is computed in `model` from club and domain inputs.

Checklist items:

- Public information exists: `name`, `tagline`, and `about` are non-blank.
- First host is assigned: `firstHostOnboardingState === "ASSIGNED"`.
- Club lifecycle is compatible: not `SUSPENDED` or `ARCHIVED`.
- Domain state has no blocking failure for the selected club. An absent custom domain is not a blocker because the canonical `/clubs/:slug` path remains valid.

Readiness states:

- `ready`: all checklist items pass and `publicVisibility === "PRIVATE"`.
- `public`: all checklist items pass and `publicVisibility === "PUBLIC"`.
- `blocked`: one or more required checklist items fail.
- `private-stable`: private club with no urgent action but not selected for publishing.
- `archived-or-suspended`: no publish action in this pass.

The server remains the source of truth. The frontend checklist is an operator aid and an early explanation layer; server errors are still possible and are displayed inline.

## Support Access Flow

Support access is shown inside the selected-club brief.

Changes from current UI:

- The form does not ask for `clubId`; it uses the selected club.
- Active grants load with `listSupportAccessGrantsByClub(selectedClub.clubId)`.
- Loading, empty, failure, and revoke states are visible inside the panel.
- `reason` remains required.
- `expiresAt` defaults to one hour from the current local time.
- `granteeUserId` remains a UUID field in this pass because there is no platform user search endpoint in the current API surface.
- The panel copy should make the temporary nature of the grant visible.

Server-side authorization for grant creation and revoke must be enforced by the application service. Hiding buttons for non-owner roles is useful UI feedback, not a security guarantee.

## Error Handling

Error boundaries and inline errors are separated by failure surface:

- Loader failure for `/api/admin/summary` or `/api/admin/clubs`: route-level error.
- Domain check failure: inline domain panel error for the relevant domain row.
- Club metadata save failure: inline selected-club brief error.
- Public/private mutation failure: inline publish checklist/action error.
- Support grant list failure: inline support panel error; other selected-club data remains visible.
- Support grant create/revoke failure: inline support panel error and current grant list remains unchanged.
- Onboarding preview/commit failure: wizard-local error.

Fallback copy must be public-safe. It should not display stack traces, SQL details, upstream hostnames, SMTP detail, raw tokens, private member data, or deployment identifiers.

## Role And Permission UX

The UI reflects server role intent:

| Action | OWNER | OPERATOR | SUPPORT |
| --- | --- | --- | --- |
| Read dashboard metadata | allowed | allowed | allowed |
| Select clubs and inspect metadata | allowed | allowed | allowed |
| Create club | allowed | allowed | disabled |
| Edit public metadata | allowed | allowed | disabled |
| Toggle public/private | allowed | allowed | disabled |
| Check domain provisioning | allowed | allowed | disabled |
| Create support grant | allowed | disabled | disabled |
| Revoke support grant | allowed | disabled | disabled |

Disabled controls should explain the reason near the control or in the action rail. The text should be concise and role-specific, not a generic error.

## Visual Direction

The admin screen should feel like a precise operating ledger:

- Warm paper surfaces and ink-toned hierarchy.
- Dense but readable rows.
- Badges for state, not decorative chips.
- No glassmorphism, bokeh, glow, or generic SaaS hero.
- No nested cards.
- Mobile layout remains operational: queue first, selected brief below, sticky or repeated primary action where useful.
- Korean and English labels must wrap without overlapping controls.
- Focus states and disabled states must be visible and not rely on color alone.

The screen should not explain its own mechanics in long in-app paragraphs. Copy should name the state and next action.

## Component Design

Recommended component boundaries:

```text
front/features/platform-admin/model/platform-admin-workbench-model.ts
front/features/platform-admin/model/platform-admin-workbench-model.test.ts
front/features/platform-admin/route/platform-admin-route.tsx
front/features/platform-admin/ui/platform-admin-dashboard.tsx
front/features/platform-admin/ui/platform-admin-overview-metrics.tsx
front/features/platform-admin/ui/platform-admin-work-queue.tsx
front/features/platform-admin/ui/club-operations-brief.tsx
front/features/platform-admin/ui/club-publish-checklist.tsx
front/features/platform-admin/ui/domain-provisioning-panel.tsx
front/features/platform-admin/ui/support-access-grants-panel.tsx
front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx
```

Existing files may be modified rather than replaced wholesale. The intent is to split responsibilities where the current dashboard file mixes metrics, selected state, domain rows, and support access.

## Data Flow

Initial load:

1. `platformAdminLoader` verifies platform admin auth.
2. It fetches `summary` and `clubs` in parallel.
3. `PlatformAdminRoute` stores `summary`, `clubs`, `selectedClubId`, `checkingDomainIds`, domain errors, support grant state, and wizard visibility.
4. `buildPlatformAdminWorkbench` derives metrics, queue items, selected club brief, and selected club domains.
5. `PlatformAdminDashboard` renders the view model and raises callbacks.

Selected club change:

1. Route updates `selectedClubId`.
2. Route calls `listSupportAccessGrantsByClub(selectedClubId)`.
3. Support grant state updates independently from dashboard data.

Mutations:

- Domain check updates `summary.domains` and `summary.domainsRequiringAction`.
- Club patch updates `clubs.items` and selected brief.
- Onboarding commit prepends/replaces the club, updates domains if returned, closes the wizard, and selects the created club.
- Support grant create prepends the new grant in selected-club grant state.
- Support grant revoke removes the revoked grant from selected-club grant state.

## Testing Strategy

Frontend model tests:

- Queue severity and ordering.
- Publish checklist pass/fail reasons.
- Ready-to-publish private club detection.
- Domain failure/action-required classification.
- Initial selected club selection.

Frontend route/UI tests:

- `/admin` still blocks non-platform admins.
- Dashboard renders work queue and selected brief.
- Selecting a club loads support grants for that club.
- Domain check updates the selected club domain panel.
- Onboarding commit selects the created club and adds returned domain state.
- `SUPPORT` role sees metadata but not mutation affordances.
- Public/private controls explain blocked publish state.

Server tests:

- `OWNER` can create and revoke support access grants.
- `OPERATOR` cannot create or revoke support access grants if this hardening is not already enforced.
- `SUPPORT` cannot create or revoke support access grants.
- Existing grant read paths remain available to active platform admins as currently intended.

Validation commands:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
```

Because this changes admin user flow and role affordances, run E2E if the implementation changes route/auth/BFF behavior:

```bash
pnpm --dir front test:e2e
```

For docs-only changes:

```bash
git diff --check -- docs/superpowers/specs/2026-05-17-readmates-platform-admin-triage-console-design.md docs/superpowers/plans/2026-05-17-readmates-platform-admin-triage-console-implementation-plan.md
```

## Release And Residual Risk

This is not a release-readiness review. Before shipping the branch, review current branch diff against base and use `docs/development/release-readiness-review.md`.

Residual risks:

- Summary domain data is limited by current backend summary limits. The UI should not claim it has full historical domain audit coverage.
- Support grant grantee selection remains UUID-based until a platform user search API exists.
- UI role affordances must not be treated as security controls; server authorization must be tested.
- The publish checklist is explanatory. The server remains the final authority on public visibility mutations.

## Spec Self-Review

- Placeholder scan: no private data, secrets, token-shaped values, local absolute paths, or unfinished requirement markers are included.
- Internal consistency: the design keeps `/admin` platform-owned and host operations out of scope throughout.
- Scope check: the work is a single frontend-centered admin-console improvement with one server hardening task for support access authorization.
- Ambiguity check: support access role policy is explicit, and deferred platform user search is documented as out of scope.
