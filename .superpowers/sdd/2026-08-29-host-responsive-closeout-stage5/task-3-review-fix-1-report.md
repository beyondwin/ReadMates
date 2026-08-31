# Stage 5 Task 3 review fix 1 report — single unscoped redirect history

## Authority and scope

- Base: `93e3cef101228a466790a1f21fd8ae7b70af8c95`.
- Review-fix brief SHA-256: `83f529973151a13921519b9925e4f695a64e66a20ce60d9ae06cfd7486b7b640`.
- Updated Task 3 report SHA-256: `6c2894be75d1991cb8b2943f52ce3fd157e36a5860b36fe43c224df8bdd4e988`.
- Delta manifest SHA-256: `44825bd5302ad9ef00895feff3bdf201ce2f8e1ef9f65a7878a0e85777e06851`.
- ADR impact: `none`. ADR-0048 and ADR-0049 remain Proposed and unchanged.
- The external mockup tree and user runtimes remained untouched. No server, provider, OAuth, email, club-end, Task 4+, deployment, tag, push or PR surface was entered.

## Root cause and closure

- The unscoped parent loader ran before its legacy child. Its ordinary loader redirect pushed the scoped legacy alias, and loader redirects cannot carry React Router client `location.state`.
- A loader Request also excludes the fragment. Constructing the final target in the loader would therefore still drop the operations/members hash.
- For one of the three legacy aliases, the authenticated parent now returns only the current club slug instead of redirecting. Every non-legacy unscoped host path retains the existing ordinary canonicalization path.
- The existing compatibility child combines that internal slug with the actual client location and performs one direct `<Navigate replace>` to the scoped canonical destination. Search, incoming non-invitation hash, canonical `#invitations`, and validated same-club return state stay under the child state sanitizer.
- The real combined-tree tests retain the parent loader and legacy child route, replacing only the canonical presentation with a probe. They assert no scoped legacy visit, `REPLACE`, Back to the pre-existing entry, Forward to the canonical entry with state, and null state for external/cross-club/arbitrary input.

## TDD and focused evidence

All frontend commands used `PATH=<node24-bin>:$PATH`, `npx --yes corepack@0.35.0` and repository-pinned pnpm `11.13.1`.

| Source hash | Literal command | Result | Finding closure |
| --- | --- | --- | --- |
| Final combined-route test SHA-256 `5101767998e193e4f70a2be90cdc80c1a81ebc4f409523a9b26282a50fe8cfcb` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/routes/host.test.tsx -t 'real combined unscoped' --reporter=dot` before the production fix | Expected RED: 1 file, 2/5 passed and 3/5 failed; all aliases lost validated state, visited the scoped legacy alias and returned there through Back; operations also lost its fragment | Reproduced the reviewer finding in the real parent-plus-child route tree. |
| Final combined-route test SHA-256 `5101767998e193e4f70a2be90cdc80c1a81ebc4f409523a9b26282a50fe8cfcb` | Same exact combined-route command after the fix | GREEN: 1 file, 5/5 passed, 18 skipped | Members, invitations and operations now make one effective replacement; Back/Forward, canonical hash, validated state and unsafe-state rejection are proved. |
| Delta manifest SHA-256 `44825bd5302ad9ef00895feff3bdf201ce2f8e1ef9f65a7878a0e85777e06851` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/routes/host.test.tsx src/app/host-routes/host-redirects.test.tsx src/app/host-route-destination-inventory.test.ts --reporter=dot` | GREEN: 3 files, 50/50 | Combined history, standalone child redirect/state, canonical `/records`, ordinary canonicalization and non-current edit/closing invariants pass together. |
| Delta manifest SHA-256 `44825bd5302ad9ef00895feff3bdf201ce2f8e1ef9f65a7878a0e85777e06851` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec eslint src/app/routes/host.test.tsx src/app/routes/host.tsx src/app/route-continuity.ts src/app/host-routes/host-compatibility-redirect-element.tsx` | GREEN: exit `0`, no output | Exact changed-file static quality passed. |
| Delta manifest SHA-256 `44825bd5302ad9ef00895feff3bdf201ce2f8e1ef9f65a7878a0e85777e06851` | `git diff --check` | GREEN: no findings | Delta and evidence formatting are clean. |
| Delta manifest SHA-256 `44825bd5302ad9ef00895feff3bdf201ce2f8e1ef9f65a7878a0e85777e06851` | Targeted local-root, secret-token and private-domain scan across both Task 3 reports, the review brief/manifests and every delta source | GREEN: no matches | No machine-local absolute path, secret-shaped value or private domain was persisted. |
| Delta manifest SHA-256 `44825bd5302ad9ef00895feff3bdf201ce2f8e1ef9f65a7878a0e85777e06851` | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-3-review-fix-1-manifest.sha256` | GREEN: 6/6 entries `OK` | Review brief, updated Task 3 report and exact code/test delta are sealed. |

## Skipped and residual limits

- Browser E2E was not run: the combined memory router directly exercises React Router loader ordering, history action, Back/Forward, search/hash and state with the real parent and legacy child definitions.
- Full frontend gates, full E2E, CT, server/integration and public-release checks remain owned by Stage 5 Task 4.
- No visible presentation or CSS changed, so detector and screenshot work were not applicable.
