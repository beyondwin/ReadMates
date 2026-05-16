# ReadMates Platform Admin Onboarding Design

## Context

ReadMates already has a platform admin route at `/admin`, platform admin auth in `/api/auth/me`, and server APIs for custom domain provisioning and support access grants. The current surface is a thin operational shell. It does not yet give a platform operator a complete way to create a new club, prepare the first host, control public exposure, and manage platform-level club settings.

This design expands `/admin` into a platform operations console. It keeps club-internal operations in the host app.

## Approved Direction

Use a single `/admin` console with a club registry and a new-club onboarding wizard.

The platform admin owns:

- Club registry and platform setup status.
- New club creation.
- Public/private exposure for a club.
- Public club introduction fields.
- Domain registration and provisioning checks.
- First host onboarding state.
- Support access grants for exceptional platform support.

The host app owns:

- Sessions.
- Member approval and lifecycle.
- Normal member invitations.
- Attendance, records, publication, and notifications.
- Day-to-day club operation.

Platform admins do not get duplicate host tools in `/admin`. When support needs to inspect host surfaces, the existing support access grant model remains the entry point.

## First Release Scope

The first implementation should include:

- `/admin` dashboard with platform queue metrics.
- Club list for existing and newly created clubs.
- Club detail panel or drawer for platform-level settings.
- New club onboarding wizard.
- Optional domain registration during onboarding.
- Existing club domain addition and domain status check.
- Public/private toggle controlled by platform admins.
- Public introduction editing for club name, tagline, and about text.
- First host onboarding with existing-user confirmation or new-user invitation.

The first implementation should not include:

- Host session management inside `/admin`.
- General member administration inside `/admin`.
- General member invite management inside `/admin`.
- Notification dispatch controls inside `/admin`.
- Host-controlled public/private toggles.

## Admin Console UX

The `/admin` screen should have two primary regions:

- A platform queue with counts for setup-required clubs, domains requiring action, and private clubs that are ready to publish.
- A club registry showing club name, slug, operating status, public visibility, domain health, and first host onboarding state.

Primary actions:

- `New Club` opens the onboarding wizard.
- `Edit Public Info` opens platform-level club metadata editing.
- `Manage Domains` opens domain rows and status-check actions.
- `Open Host App` navigates to the club host app only when the current platform admin has normal host access or a valid support access grant.

The UI should stay operational and dense, consistent with the host ledger style, not a marketing dashboard.

## New Club Wizard

The wizard has five steps.

1. Public info
   - Required: club name, slug, tagline, about text.
   - The public page does not go live just because these fields exist.
   - Slug is set at creation time and is not editable in the first release.

2. First host
   - Required: host email and display name.
   - Preview checks whether a user already exists for the email.
   - Existing users require explicit confirmation before a `HOST` membership is created.
   - New users receive a `HOST` invitation.

3. Domain
   - Optional.
   - If provided, the domain is created in `ACTION_REQUIRED` state and can be checked later.
   - If omitted, the club still completes onboarding.

4. Confirm
   - Shows the club visibility, host result, and optional domain action.
   - Existing-user host assignment must be visibly confirmed here.

5. Result
   - Shows created club id and slug.
   - Shows host onboarding result.
   - Shows email delivery state when an invitation was created.
   - Always shows the manual accept URL for new-user host invitations.
   - Shows domain manual action when a domain was registered.

## Server API Design

Extend the existing `club` feature platform-admin slice.

New endpoints:

- `GET /api/admin/clubs`
  - Lists clubs with platform-level summary fields.

- `POST /api/admin/clubs/onboarding/preview`
  - Validates slug, public info, first host email, and optional domain.
  - Returns whether the first host email maps to an existing user.
  - Returns conflicts without mutating data.

- `POST /api/admin/clubs/onboarding`
  - Creates the club, first host membership or invitation, optional domain, and audit events.
  - Requires the explicit existing-user confirmation returned by preview when applicable.

- `PATCH /api/admin/clubs/{clubId}`
  - Updates platform-owned public info, public/private visibility, and setup completion state.
  - Does not rename slugs in the first release.

Existing endpoints remain:

- `POST /api/admin/clubs/{clubId}/domains`
- `POST /api/admin/domains/{domainId}/check`
- Support access grant endpoints.

Do not route this through host APIs. The onboarding command is platform-owned because it creates the initial club and first host boundary.

## Data Model

Keep `clubs.status` as the operating lifecycle:

- `SETUP_REQUIRED`
- `ACTIVE`
- `SUSPENDED`
- `ARCHIVED`

Add a separate public exposure field named `clubs.public_visibility`:

- `PRIVATE`
- `PUBLIC`

Default for new clubs:

- `status = SETUP_REQUIRED`
- `public_visibility = PRIVATE`

The public API must only return a club when:

- `clubs.status = ACTIVE`
- `clubs.public_visibility = PUBLIC`

The host app and invite flows may still resolve `SETUP_REQUIRED` and `ACTIVE` clubs so the first host can finish setup before the public page is visible.

Publishing behavior:

- `Make public` is only enabled when required public info exists and first host onboarding is complete.
- If the club is still `SETUP_REQUIRED`, `Make public` transitions it to `ACTIVE` and sets `public_visibility = PUBLIC` in one platform-admin command.
- `Make private` sets `public_visibility = PRIVATE` and does not suspend, archive, or otherwise disable host operations.
- `SUSPENDED` and `ARCHIVED` clubs cannot be made public without first following their operating lifecycle rules.

## First Host Onboarding

Existing user path:

- Preview finds a user by normalized email.
- Commit requires an explicit confirmation value from preview.
- Commit creates or updates a membership for the new club as `ACTIVE` and `HOST`.
- The result reports `EXISTING_USER_ASSIGNED`.

New user path:

- Commit creates a `HOST` invitation.
- Current host invitation storage already supports `HOST` as a role at the table level, but the host-facing invitation API currently inserts `MEMBER`. Platform onboarding should use a platform-owned command path for `HOST` invitations.
- The result reports `INVITATION_CREATED`.
- The result includes `acceptUrl`.

Email delivery:

- Attempt to send a host invitation email after the core data is committed.
- Email delivery failure must not roll back club creation or invitation creation.
- The result includes `emailDelivery.status = SENT`, `FAILED`, or `SKIPPED`.
- The manual accept URL is always shown for new-user invitations.

## Authorization

Role behavior:

- `OWNER`: full platform admin access for this feature.
- `OPERATOR`: create clubs, update platform-level club settings, manage domains, run provisioning checks.
- `SUPPORT`: read platform status and use support access grant workflows, but cannot create clubs or publish private clubs.

This preserves the existing distinction between platform admin roles and per-club host membership. A platform admin is not automatically a host for every club.

## Error Handling

Preview and commit both validate:

- Required club name.
- Slug format and uniqueness.
- Tagline and about text presence.
- Host email format.
- Existing-user host confirmation when needed.
- Optional domain format.
- Optional domain uniqueness.
- Public publish readiness when changing `public_visibility` to `PUBLIC`.

Commit should be transactional for:

- Club row.
- First host membership or host invitation.
- Optional domain row.
- Audit events.

Email delivery should run after the transaction or as an after-commit side effect. The onboarding result should expose sanitized failure status without SMTP detail, secrets, tokens, raw stack traces, or private deployment data.

## Frontend Structure

Follow the current route-first frontend boundary:

- `features/platform-admin/api`: contracts and BFF calls.
- `features/platform-admin/route`: loader, action coordination, wizard state, mutations.
- `features/platform-admin/ui`: prop-driven dashboard, club registry, detail panel, wizard, result view.
- `src/app/routes/auth.tsx`: keep `/admin` route wiring.

The UI should use the existing admin route guard and should not expose server-only configuration. Public/private state changes should be explicit controls with clear success and error states.

## Tests And Verification

Server tests:

- Platform admin can list clubs.
- `OWNER` and `OPERATOR` can preview and commit onboarding.
- `SUPPORT` cannot commit onboarding or publish private clubs.
- Existing first host requires confirmation and becomes `ACTIVE/HOST`.
- New first host gets a `HOST` invitation and accept URL.
- Email failure leaves club and invitation created.
- Private clubs are not returned by public club APIs.
- Public clubs are returned only when operating status is `ACTIVE`.
- Optional domains are created in `ACTION_REQUIRED` and can be checked through existing provisioning logic.

Frontend tests:

- `/admin` still blocks non-platform-admin users.
- Dashboard renders club registry and platform queue.
- Wizard previews existing-user and new-user paths.
- Existing-user path requires confirmation before submit.
- Result view shows host assignment, invitation URL, email delivery state, and domain action.
- Public/private toggle calls the platform admin API and updates visible state.

Validation commands for implementation:

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `./server/gradlew -p server clean test`
- `pnpm --dir front test:e2e` when the auth, BFF, or user-flow surface changes.

## Residual Risks

- Host invitation email delivery may need a new template and audit behavior. Keep it public-safe and avoid raw token exposure except for the generated accept URL shown to platform admins.
- Public visibility introduces a new source of truth. All public query and cache paths must check it consistently.
- Existing-user host assignment is powerful. The confirmation step and audit event are required, not polish.
- `/admin` must not grow into a duplicate host console. Future scope should keep platform settings separate from club operations.
