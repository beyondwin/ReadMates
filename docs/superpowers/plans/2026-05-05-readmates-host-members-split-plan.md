# ReadMates HostMembers Component Split Plan

작성일: 2026-05-05
상태: READY FOR IMPLEMENTATION

> **For agentic workers:** Implement checkbox-by-checkbox. Start with characterization tests, keep host member actions and route scope unchanged, and preserve unrelated worktree edits. Extract presentational pieces only; keep API and mutation orchestration in the existing route/UI parent.

## Goal

Split `front/features/host/ui/host-members.tsx` into smaller host member UI components while preserving member lifecycle tabs, current-session participation actions, viewer approval/deactivation, display-name editing, pagination, scoped invitation links, and dialog keyboard behavior.

Current source of truth:

- Implementation: `front/features/host/ui/host-members.tsx` (about 1,339 lines in the current worktree)
- Route wrapper/actions: `front/features/host/route/host-members-route.tsx`, `front/features/host/route/host-members-actions.ts`
- Tests: `front/tests/unit/host-members.test.tsx`

## Scope Guardrails

- Read `AGENTS.md`, `docs/agents/front.md`, `docs/agents/design.md`, `docs/agents/docs.md`, and `docs/development/architecture.md` before implementation.
- Keep `HostMembers` as the public default export from `front/features/host/ui/host-members.tsx` until imports are intentionally moved.
- Keep extracted components inside `front/features/host/ui/members/`.
- Keep extracted components prop/callback driven. Do not import host API modules, route modules, `shared/api`, or `fetch` from `front/features/host/ui/members/*`.
- Do not change backend API contracts, route paths, request payloads, lifecycle policy values, scoped link behavior, or Korean product copy.
- Preserve tab keyboard behavior, focus restoration for dialogs, duplicate-submit blocking, pending/disabled states, current-session policy handling, and display-name validation copy.
- Use public-safe fixture values only. Do not add real member data, private domains, deployment state, OCIDs, secrets, or token-shaped examples.

## Extraction Candidates

Extract in this order so low-state presentational pieces move before the stateful dialogs and tab-panel composition.

1. `front/features/host/ui/members/member-status-filter.tsx`
   - Move `tabs`, `focusMemberTab`, and `handleMemberTabKeyDown`.
   - Export the `MemberTab` type and `MemberStatusFilter` component that renders the tablist from `activeTab` and `onTabChange`.
   - Preserve `role="tablist"`, `aria-selected`, `aria-controls`, selected `tabIndex`, and ArrowLeft/ArrowRight/Home/End keyboard behavior.
2. `front/features/host/ui/members/member-summary.tsx`
   - Move `MemberCount`.
   - Create `MemberSummary` that receives counts for viewer, active, current-session participants, active outside current session, and suspended members.
   - Preserve the `aria-label="멤버 운영 요약"` section and badge tone rules.
3. `front/features/host/ui/members/member-list.tsx`
   - Move `statusLabels`, `statusBadgeLabels`, `memberMeta`, `requestMeta`, `joinedMeta`, `inactiveMeta`, `statusBadgeClass`, `currentSessionBadge`, `preservedRecordBadge`, `MemberActionButton`, `CurrentSessionAction`, and `MemberList`.
   - Keep action callbacks injected from `HostMembers`; do not move `actions.submitLifecycle`, `actions.submitViewerAction`, or pending-set ownership.
   - Preserve identity rows, current-session badge labels, disabled reason text, and desktop/mobile wrapping behavior.
4. `front/features/host/ui/members/member-profile-editor.tsx`
   - Move `HostMemberProfileDialog`, `profileFailureMessage`, and host profile failure message constants.
   - Keep `onSubmit(displayName)` injected and keep local input/save state inside the dialog.
   - Preserve initial focus, Escape behavior, Tab focus loop, trimmed submit, duplicate-submit blocking, and local alert messages.
5. `front/features/host/ui/members/member-approval-actions.tsx`
   - Move `LifecyclePolicyDialog`.
   - Keep `dialog`, `policy`, `submitting`, `onPolicyChange`, `onClose`, and `onConfirm` as explicit props.
   - Preserve current-session radio labels, focus loop, Escape behavior, disabled confirm/cancel state, and suspend/deactivate copy.
6. `front/features/host/ui/members/member-tab-panel.tsx`
   - Move tab-panel composition only after the leaf components above exist.
   - Receive filtered member arrays, `nextCursor`, `isLoadingMore`, `LinkComponent`, pending set, and callback props from `HostMembers`.
   - Preserve the invitation link target `/app/host/invitations`, "더 보기" placement outside the invitations tab, and all tab-specific empty descriptions.

If `member-tab-panel.tsx` creates a noisy prop surface, stop after extracting the leaf components and leave panel composition in `host-members.tsx` for a later PR.

## Characterization Tests

Before moving code, extend `front/tests/unit/host-members.test.tsx` only for gaps. Existing coverage already includes route loading, identity/status rows, profile editing, validation errors, duplicate-submit blocking, tab keyboard behavior, pagination, viewer actions, lifecycle dialogs, and current-session add/remove actions.

- [x] Confirm existing baseline:

```bash
pnpm --dir front test tests/unit/host-members.test.tsx
```

- [x] Add or verify a test that the member tablist supports ArrowLeft/ArrowRight/Home/End while preserving `aria-selected`, selected `tabIndex`, focus movement, and the invitation panel.
- [x] Add or verify a test that `MemberSummary` counts viewer, active, current-session, active-outside-current-session, and suspended rows after page loads and after a row mutation.
- [x] Add or verify a test that profile editing trims the display name, blocks duplicate submits while pending, restores focus on close, and keeps validation errors near the input.
- [x] Add or verify a test that lifecycle dialogs preserve current-session policy radios, Escape closing, disabled controls while submitting, and the selected policy payload.
- [x] Add or verify a test that active, viewer, suspended, inactive, and invitations tabs keep their current empty-state copy and action labels.

Run the targeted suite after each characterization addition:

```bash
pnpm --dir front test tests/unit/host-members.test.tsx
```

## Implementation Checklist

- [x] **Phase 1: Baseline and dependency map**
  - Run `git status --short --untracked-files=all`.
  - Inspect `host-members.tsx` imports, local helper ownership, and `front/tests/unit/host-members.test.tsx`.
  - Confirm no unrelated dirty frontend edits will be overwritten.

- [x] **Phase 2: Characterization tests first**
  - Add only missing tests from the section above; when existing tests already cover a behavior, record that in this plan instead of duplicating assertions.
  - Run `pnpm --dir front test tests/unit/host-members.test.tsx`.

- [x] **Phase 3: Extract tab filter and summary**
  - Create `member-status-filter.tsx` and `member-summary.tsx`.
  - Keep active-tab state and filtered count calculations in `HostMembers`.
  - Run the targeted host members test suite.

- [x] **Phase 4: Extract list rows and action buttons**
  - Create `member-list.tsx`.
  - Keep lifecycle/viewer/profile mutation orchestration and pending action set ownership in `HostMembers`.
  - Run the targeted host members test suite.

- [x] **Phase 5: Extract profile editor dialog**
  - Create `member-profile-editor.tsx`.
  - Keep server response parsing and profile error message mapping in `HostMembers`; pass only the final `onSubmit(displayName)` callback into the dialog.
  - Run the targeted host members test suite.

- [x] **Phase 6: Extract lifecycle approval dialog**
  - Create `member-approval-actions.tsx`.
  - Keep selected policy state and submit confirmation in `HostMembers`.
  - Run the targeted host members test suite.

- [x] **Phase 7: Review tab-panel composition**
  - Create `member-tab-panel.tsx` only if the prop surface stays readable and route concerns remain injected.
  - Keep invitation link scoped through the existing `LinkComponent`.
  - Run the targeted host members test suite.
  - 2026-05-06 PR9 completion: `member-tab-panel.tsx` now owns tab-panel composition, invitation-link placement, load-more placement, and tab empty states. `HostMembers` still owns filtered arrays, pending sets, dialog/action orchestration, and the route-scoped `LinkComponent` injection.

- [x] **Phase 8: Full verification**
  - Run all commands in the verification section.
  - Inspect the final diff for accidental route/API/model changes.

## Verification Commands

When using `pnpm --dir front`, pass test paths relative to `front/`, not `front/tests/...`.

```bash
pnpm --dir front test tests/unit/host-members.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
git diff --check -- front/features/host/ui/host-members.tsx front/features/host/ui/members front/tests/unit/host-members.test.tsx
```

## Rollback Plan

- If an extraction regresses behavior, revert only that candidate module and restore the section inside `host-members.tsx`.
- Keep characterization tests that describe real current behavior.
- If panel extraction creates unclear callback threading, stop after leaf extraction and leave tab-panel composition in `host-members.tsx`.

## Risks

- Pending-state checks are row-scoped across profile, lifecycle, viewer, and current-session actions; moving buttons must not create separate pending ownership.
- Display-name editing is stateful and validation-sensitive; the dialog must keep duplicate-submit blocking and local error rendering.
- Lifecycle dialogs are keyboard-sensitive and control current-session policy payloads; focus behavior and selected radio state are hard gates.
- The invitation link is scoped by `HostMembers` through an injected link component; extracted components must not read router state directly.
