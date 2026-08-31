# Whole-branch review fix 1 report — routable workbox remediation actions

## Scope and closure

- Base: `1c2de374be844d58dcd7dab91ba2125176f0ea80`.
- ADR impact: `none`.
- The invitation-expiry adapter now emits the approved settings anchor `/app/host/settings#invitations` without exposing or depending on the link identifier in the URL.
- The notification-failure adapter now emits the canonical `/app/host/notifications` route without appending an unregistered delivery-detail segment.
- The exact ordered destination contract for all five adapters is asserted in `HostWorkSourceAdaptersTest`.
- No frontend route, other server behavior, Stage report, or external mockup changed.

## Evidence ledger

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Test before `ab7b1e59404ef1709684eda4b43285a0407b1946f8b689b1799b0ab8c04f8c44`; test after `25bdc83b2ce2d33de4ec96315ea81797104f6645e75d8eedb1a788f8fb313829`; production still at base hashes `a9f612d37e8e146e88cf79470b5e8e0b60828a331b62eca0522081ab8c7685b5` and `3e71b8e08b98f197f4ec4ac1f2d6c7aa0f9de8e2c236020ee255e06d849c09b3` | `./server/gradlew -p server unitTest --tests 'com.readmates.hostworkspace.adapter.out.source.HostWorkSourceAdaptersTest'` before production changes | Expected RED: 2 tests executed, 1 failed. Actual contained `/app/host/settings/invitations/00000000-0000-0000-0000-000000000004` and `/app/host/notifications/00000000-0000-0000-0000-000000000005`; expected the two canonical destinations. | Proves the strengthened assertion detects exactly the two unroutable remediation hrefs before implementation. |
| Final invitation adapter `e71b6269d312c027760e06e00078946a6be3cb6437776862f52d840967683014`; notification adapter `a59f6b84a055cc75f6c102add8bfeda49db7cfc3b048b2e96e3d1a1ddd9c1110`; test `25bdc83b2ce2d33de4ec96315ea81797104f6645e75d8eedb1a788f8fb313829` | Same focused server unit test command after the two production edits | GREEN: 2/2 tests, `BUILD SUCCESSFUL`. | All five ordered destinations now match their intended host surfaces, including the two corrected remediation actions. |
| Same final Kotlin hashes | `./server/gradlew -p server ktlintMainSourceSetCheck ktlintTestSourceSetCheck` | GREEN: both source-set checks completed, `BUILD SUCCESSFUL`. | Touched production and test Kotlin satisfy repository formatting rules. |
| Existing frontend inventory `72557a8c5f26b92680d63a32b9c64d627bd27e3d402658e27334e545c8ae8183` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front test --run src/app/host-route-destination-inventory.test.ts` | GREEN: 1 file, 19/19 tests. | `/app/host/settings#invitations` is the approved invitation compatibility target and `/app/host/notifications` remains a canonical routed destination. |
| Final allowed delta | `git diff --check -- <two-adapters> <adapter-test> <brief> <report>` | GREEN: exit 0, no output. | No whitespace finding remains in the scoped patch. |
| Final allowed files | Focused scan for machine-local paths, private-key markers, and AWS/GitHub/OpenAI token shapes | GREEN: 0 matches. `gitleaks` is unavailable and is not claimed. | No public-repository safety finding was introduced. |
| Final manifest | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/whole-branch-review-fix-1-manifest.sha256` | GREEN: all entries `OK`. | Brief, changed implementation/test, unchanged route inventory evidence, and report are sealed together. |

## Boundary

- This is repository/local test evidence, not live deployment evidence.
- Full frontend, server, E2E, component-test, and public-release gates are owned by the controller and were not repeated for this one finding.
- No load-bearing claim remains in this scoped destination-routing finding.
