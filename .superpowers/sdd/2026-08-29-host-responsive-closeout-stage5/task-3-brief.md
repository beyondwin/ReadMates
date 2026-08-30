# Stage 5 Task 3 brief — canonical host compatibility redirects

Implement only Stage 5 plan Task 3 from base `366d7d3fbcf0393d5cb40bd65d32695ab6e55601`.

- Authority: Stage 5 plan SHA-256 `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- ADR impact: `none`; apply the already-approved canonical route map without editing ADRs/docs/CHANGELOG.
- Read current root/front/execution guides before editing. Preserve external mockups, user runtime ports/containers and public-repo safety.

## Canonical map

```text
/host/members     -> /host/people
/host/invitations -> /host/settings#invitations
/host/operations  -> /host
```

Apply both unscoped `/app/host/...` and scoped `/clubs/:clubSlug/app/host/...` forms. `/host/records` remains canonical and must never redirect. Session edit/closing deep links must remain when redirecting would lose a non-current session context.

## Execution contract

1. RED first in focused route tests for replace semantics, scoped/unscoped targets, search/hash preservation and safe route state preservation. The canonical invitations hash is `#invitations`; merge/preserve unrelated search and meaningful state without allowing an incoming obsolete hash to override it.
2. RED for current navigation/tab matching and return/focus restoration after compatibility redirect. Reject open redirects or cross-club state injection.
3. Implement the smallest compatibility redirect component/route changes in `front/src/app/routes/host.tsx` and existing route-continuity/destination helpers. Do not duplicate canonical presentation modules under compatibility paths.
4. Prove `/records`, scoped person/records/settings and non-current session edit/closing paths remain unchanged.
5. Run focused Vitest route/inventory/continuity tests and only the exact compatibility redirect browser cases if unit routing cannot prove history replace/search/hash/state behavior. Do not run full E2E or full frontend gates.
6. Run exact changed-file ESLint, detector only if visible UI changed, `git diff --check`, targeted public-safety scan and SHA-256 manifest. Record exact `source hash → command → result → finding closure` in `task-3-report.md` using `<node24-bin>`, never a local absolute path.
7. Force-add ignored brief/report/manifest and commit exactly `feat(host): switch legacy host routes`.

## Exclusions

- No Task 4 full validation, Task 5 docs, Task 6 ADR status, Task 7 broad browser capture.
- No server/API/migration/auth/provider/OAuth/email/club-end changes.
- No redirects for canonical `/records` or non-current session edit/closing contexts.

Return RED/GREEN, exact redirect matrix, history replace proof, preserved query/hash/state/focus semantics, manifest and commit SHA.
