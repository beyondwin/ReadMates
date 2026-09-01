# Stage 5 Task 3 report — canonical host compatibility redirects

## Authority and scope

- Base: `366d7d3fbcf0393d5cb40bd65d32695ab6e55601`.
- Stage 5 plan SHA-256: `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- Task brief SHA-256: `deff9d491bdee52eded6a6ee39f33577dd2dc99467ee74d3f05f4ef8bd9eca0f`.
- ADR impact: `none`. ADR-0048 and ADR-0049 remain Proposed and unchanged.
- Original Task 3 source-manifest SHA-256: `36930dbcf068507069aa99c48b1cb19734cd00239eca80ce02e5465d6b51bba1`. Review fix 1 seals its delta separately.
- The unrelated untracked admin-operations mockup directory remained untouched and unstaged. No server, provider, OAuth, email, club-end, deployment, tag, push, PR, user port or container was touched.

## Delivered redirect contract

| Legacy entry | Canonical destination | Navigation contract |
| --- | --- | --- |
| `/app/host/members` and `/clubs/:clubSlug/app/host/members` | matching-scope `/host/people` | history `REPLACE`; preserve search and incoming hash |
| `/app/host/invitations` and `/clubs/:clubSlug/app/host/invitations` | matching-scope `/host/settings#invitations` | history `REPLACE`; preserve search; canonical hash overrides an obsolete incoming hash |
| `/app/host/operations` and `/clubs/:clubSlug/app/host/operations` | matching-scope `/host` | history `REPLACE`; preserve search and incoming hash |

- One path-validated compatibility component owns all three aliases; compatibility routes do not mount duplicate destination presentation or destination data loaders.
- Route state reuses `readAppReturnTarget` and `readmatesReturnState`. Only a validated same-app/same-club return chain survives. Arbitrary fields, external targets, malformed state and cross-club targets are discarded.
- The canonical destination consumes the retained return target, and the existing route-security controller restores heading focus after replacement.
- The dead `HostRecordsRedirectElement` was removed. Canonical `/host/records`, scoped people/records/settings, and session-id-preserving edit/closing deep links remain outside the compatibility matcher.

## Review fix 1 closure

- The original standalone child-route evidence did not include the unscoped parent loader. In the combined tree that parent issued a PUSH redirect to the scoped legacy alias before the child could replace it; the loader boundary also discarded client `location.state`, and fragments never entered the loader Request.
- The unscoped parent now returns only the authenticated current club slug for the three legacy aliases. It keeps the existing redirect behavior for every ordinary unscoped canonical route.
- The existing compatibility child combines that internal slug with the real client location and replaces the unscoped alias directly with the final scoped canonical destination. Search, non-invitation hash and validated state remain client-owned through the one effective replacement.
- Fresh combined-tree tests prove all three aliases avoid the scoped legacy hop, Back reaches the pre-existing history entry, Forward restores the final canonical entry and validated state, and unsafe state remains absent.

## TDD and focused evidence

All frontend commands used `PATH=<node24-bin>:$PATH`, `npx --yes corepack@0.35.0` and repository-pinned pnpm `11.13.1`. `<node24-bin>` denotes the locally resolved Node 24 `bin` directory and avoids persisting a machine-local path.

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Final redirect test SHA-256 `a3f98889f3afbdbcf117a3641cdd95ac73c67700a0f694a5beeac3e10ee7d01f` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/host-routes/host-redirects.test.tsx --reporter=dot` before production change | Expected RED: 1 file, 1/8 passed and 7/8 failed; old members/invitations destinations were wrong, operations dropped hash, and raw state was unsanitized | Proved the exact redirect, hash and state contract was absent before implementation. |
| Final route composition test SHA-256 `b0a8d7e8b07751653f9d6f21aa979a9d7bcbad8c0cdadc61178ca80d07a8e38e` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/routes/host.test.tsx -t 'compatibility redirect' --reporter=dot` with the old members route restored | Expected RED: 1 file, 2/6 passed and 4/6 failed; unscoped members loaded `HostMembersRouteElement`, and scoped members mounted the legacy presentation instead of replacing | Proved both actual route trees still exposed duplicate legacy presentation. |
| Task 3 source-manifest SHA-256 `36930dbcf068507069aa99c48b1cb19734cd00239eca80ce02e5465d6b51bba1` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/host-routes/host-redirects.test.tsx src/app/routes/host.test.tsx src/app/host-route-destination-inventory.test.ts src/app/host-routes/meeting-redirects.test.ts src/app/workspace-route-model.test.ts src/app/layouts/app-route-layout.test.tsx --reporter=dot` | GREEN: 6 files, 150/150 | Exact scoped/unscoped child map, `REPLACE`, search/hash, same-club return state, open/cross-club rejection, canonical navigation matching, heading focus, `/records`, edit and closing invariants passed. The parent/child combined history claim is superseded by review fix 1 evidence. |
| Task 3 source-manifest SHA-256 `36930dbcf068507069aa99c48b1cb19734cd00239eca80ce02e5465d6b51bba1` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec eslint src/app/host-route-destination-inventory.test.ts src/app/host-routes/host-compatibility-redirect-element.tsx src/app/host-routes/host-redirects.test.tsx src/app/host-routes/invitations-redirect-element.tsx src/app/host-routes/members-redirect-element.tsx src/app/host-routes/operations-redirect-element.tsx src/app/route-continuity.ts src/app/routes/host.test.tsx src/app/routes/host.tsx` | GREEN: exit `0`, no output | Exact changed-file static quality passed. |
| Task 3 source-manifest SHA-256 `36930dbcf068507069aa99c48b1cb19734cd00239eca80ce02e5465d6b51bba1` | `git diff --check` and targeted stale-reference scan for the removed records redirect | GREEN: no whitespace findings; no stale `HostRecordsRedirectElement` references | Canonical records cannot be reactivated through the deleted compatibility component. |
| Task 3 source-manifest SHA-256 `36930dbcf068507069aa99c48b1cb19734cd00239eca80ce02e5465d6b51bba1` | Targeted local-root, secret-token and private-domain scan across the report, manifest and every manifest source | GREEN: no matches | No machine-local absolute path, secret-shaped value or private domain was persisted. |
| Task 3 source-manifest SHA-256 `36930dbcf068507069aa99c48b1cb19734cd00239eca80ce02e5465d6b51bba1` | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-3-manifest.sha256` | GREEN: 10/10 entries `OK` | Brief, production and focused test sources are sealed. |

## Skipped and residual limits

- Review fix 1 memory-router tests exercise the real parent plus legacy child route tree, React Router `REPLACE`, Back/Forward, location search/hash/state and scoped-legacy non-visitation. The original route tests retain lazy/scoped composition and production route-security focus coverage. A browser lane would duplicate those claims, so Task 3 E2E was not run.
- No visible presentation, CSS or copy changed, so the interface-pattern detector and screenshot update were not applicable.
- Full frontend lint/test/build, full CT, server gates, full E2E and public-release checks are deliberately deferred to Stage 5 Task 4.
- No live provider, OAuth, email, production data or real club-end evidence was attempted; those surfaces are outside Task 3.
