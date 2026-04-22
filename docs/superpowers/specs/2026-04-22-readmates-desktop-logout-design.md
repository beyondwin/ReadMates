# ReadMates Desktop Logout Design

## Context

The mobile `내 공간` screen already exposes a `로그아웃` action at the bottom of the page. Desktop authenticated screens do not currently expose logout in the app chrome or desktop `내 공간` view, even though the shared `LogoutButton` component and BFF logout endpoint already exist.

The selected direction is option E from the visual brainstorming session: add logout to the desktop `내 공간` account card, not to the global top navigation.

## Goals

- Add a discoverable desktop logout action without crowding the desktop top navigation.
- Keep the account-action mental model consistent with mobile: logout lives in `내 공간`.
- Reuse the existing logout behavior so session invalidation, redirect, loading state, and error copy stay consistent.
- Keep the change small and testable.

## Non-Goals

- Do not add a profile dropdown menu.
- Do not redesign the top navigation.
- Do not change the mobile logout placement.
- Do not add new authentication endpoints or session behavior.

## UX Design

On desktop `/app/me`, the `계정` surface begins with a profile row containing the avatar, display name, email, and read-only `프로필 수정 준비 중` state. Add a small ghost-style `로그아웃` button to the right side of this row, near the profile state text.

The button should read as a secondary account action:

- Use the existing `btn btn-ghost btn-sm` visual language.
- Keep the row stable by allowing the profile text block to shrink and the action group to remain fixed width.
- Preserve the existing mobile logout section as-is.
- Keep the button label textual, because logout is a critical account action and icon-only treatment would be ambiguous.

## Component Design

Update `front/features/archive/components/my-page.tsx` only.

- Reuse `LogoutButton`, which is already imported and used by the mobile `MyMobile` section.
- In `AccountSection`, replace the standalone `프로필 수정 준비 중` span with a compact action group containing:
  - the existing read-only profile state text
  - `LogoutButton` styled as a small ghost button
- Keep the rest of the `AccountSection` key-value list unchanged.

No new shared component is needed because this is the only desktop account-card placement and the existing `LogoutButton` already owns logout behavior.

## Data Flow

The desktop logout button uses the same flow as mobile:

1. User clicks `로그아웃`.
2. `LogoutButton` calls `logout()`.
3. `logout()` sends `POST /api/bff/api/auth/logout`.
4. On `2xx` or `401`, the browser redirects to `/login`.
5. On other failures or network errors, the existing Korean error message is shown below the button.

No new props, API response fields, or auth-context changes are required.

## Error Handling

Use the existing `LogoutButton` behavior:

- Disable the button while submitting.
- Show `로그아웃 중` while the request is in flight.
- Redirect to `/login` when logout succeeds or the user is already unauthenticated.
- Render `로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.` when the request fails.

Because this button sits inside a desktop account row, the error message may appear directly below the button through the existing component fragment. That is acceptable for this small scoped change; no new toast or global alert system is introduced.

## Testing

Update `front/tests/unit/my-page.test.tsx`.

- Extend the desktop account section test to assert that the desktop `계정` section includes a `로그아웃` button.
- Add or extend a desktop logout interaction test that scopes to `.desktop-only`, clicks `로그아웃`, verifies `POST /api/bff/api/auth/logout`, and verifies redirect to `/login`.
- Keep the existing mobile logout test so both responsive surfaces remain covered.

Run the focused unit test file after implementation.

## Acceptance Criteria

- Desktop `/app/me` shows `로그아웃` in the account card.
- Mobile `/app/me` still shows its existing logout action.
- Clicking desktop logout calls the existing BFF logout endpoint.
- Successful desktop logout redirects to `/login`.
- Existing account, preference, danger-zone, and feedback document content remains unchanged.
