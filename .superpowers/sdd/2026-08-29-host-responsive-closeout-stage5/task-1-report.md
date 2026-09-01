# Stage 5 Task 1 report — responsive and accessible lifecycle surfaces

## Authority and scope

- Base: `9e90834c26496cb4af4b84f4ccda22c10be34fcf`.
- Stage 5 plan SHA-256: `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- Task brief SHA-256: `f42c7858fb19ea6c379896ff8642d90ee6351a6984d1c67051d29c93242a843f`.
- ADR impact: `none`. ADR-0048 and ADR-0049 remain Proposed; this task did not edit or accept them.
- Final source manifest SHA-256: `6e0e7f98dc80272eb1cdc485a2b9190b9bd8444de9024efcd7384b48445a6917`.
- The unrelated untracked admin-operations mockup directory remained untouched and unstaged. No user runtime, external provider, OAuth, email, real club-end action, deploy, tag, push or PR was invoked.

## Delivered contract

- New code-native CT locks `390`, `767`, `768`, `1024`, `1199`, `1200` and `1440` CSS-pixel behavior for the host shell, lifecycle destination and integrated operating-room/workbox composition.
- Semantic and geometry assertions prove the mobile order `meeting context → phase → next action → preparation → workbox`, the `768–1199` stacked workbox, and restoration of the desktop `68/32` rail at `1200+`.
- Public-safe fixtures cover long Korean and English text, a missing book image, literal zero and large counts, partial preparation/workbox rows, and a `320×350` 200%-zoom proxy.
- CT checks no horizontal overflow, 44px controls, visible focus, reduced motion, phase/workbox roving tabs, textual status meaning, mobile unknown-outcome recovery controls, reserved mobile navigation space and exactly one visible lifecycle primary action.
- The only production change completes the workbox tablist's keyboard contract: `Home` focuses/selects the first tab and `End` the last, matching the already implemented phase tab behavior. No route, API, auth, schedule-seen, work identity/state or notification semantics changed.
- No screenshot update mode ran and no baseline changed; this task added semantic/geometry evidence without accepting host-rendered raster drift.

## TDD and focused evidence

All Node commands used `PATH=<node24-bin>:$PATH`, `npx --yes corepack@0.35.0` and repository-pinned pnpm `11.13.1`.

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Workbox test at RED boundary | `pnpm --dir front test -- features/host/ui/workbox/host-workbox.test.tsx` | Expected RED: full Vitest dispatch caused by the package-script argument shape, 431 files; 3,861 passed and 1 failed because `End` left focus on `보류` | Missing workbox `Home`/`End` roving behavior was proven before production code changed. Subsequent runs used `pnpm --dir front exec vitest run <file>` for true focused execution. |
| CT test at RED boundary | `pnpm --dir front exec playwright test --config playwright-ct.config.ts features/host/ui/operating-room/host-operating-room-responsive.ct.tsx --workers=1 --grep "keyboard roving"` | Expected RED: 0/1; `End` did not focus the exact `완료` workbox tab | Real Chromium reproduced the same missing keyboard behavior. An earlier local-component mount error was corrected in the test harness before this behavioral RED was accepted. |
| `16c68db7...` + `ec6cfb8d...` | `pnpm --dir front exec vitest run features/host/ui/workbox/host-workbox.test.tsx` | GREEN 9/9 | Minimal `Home`/`End` implementation and unit regression closed. |
| CT hashes `6fc7ceb5...`, `22fa8da2...`, `12b38cf5...` | Host-direct focused Playwright CT, the three changed specs, `--workers=1` | GREEN 23/23 | Final-source semantic, geometry, input and accessibility assertions passed without screenshot updates. |
| Same final CT hashes | Docker image `mcr.microsoft.com/playwright:v1.61.1-jammy`, CI mode, pnpm 11.13.1, three disjoint changed-spec runs, `--workers=1` | GREEN union 23/23: operating room 9/9, lifecycle 7/7, shell 7/7 | Canonical Docker renderer closed every changed CT assertion on the final source hash. |
| Same final CT hashes | One aggregate Docker run of all 23 cases | Environment-only SIGKILL after Vite build and before assertions | The constrained aggregate process is not claimed as passed. Its exact disjoint single-spec union is green; no unrelated container or Docker setting was changed. |
| Same changed TS/TSX hashes | Exact five-file ESLint | GREEN, 0 errors and 0 warnings | Static frontend quality closed without widening to full lint. |
| Manifest seal `6e0e7f98...` | `shasum -a 256 -c task-1-manifest.sha256` | GREEN, 6/6 entries OK | Brief, production code and all intended tests are sealed. |
| Same final surface | `git diff --check` and targeted absolute-path/private-key/cloud-id/key-name/domain checks | GREEN | Whitespace and targeted public-repository safety closed. `gitleaks` is unavailable and is not claimed. A deliberately broad long-string diagnostic matched only CSS selectors and public-safe fixture copy; each match was classified non-secret. |

## Reused unchanged evidence

The brief permits reusing unchanged interaction evidence. These source hashes are byte-identical throughout this task and were not duplicated in new tests:

- workspace-switcher Escape and trigger focus restoration: `d30e98ac179e8c1ceef3de44cd2041d8273453aa8b8cfb4fb889182503cc72ee`;
- phase tab arrow/Home/End roving: `2e7a2a40f17295c454423b790151c45dcded59ad50647afe26df4c32d1fc765e`;
- color-independent next-action state text: `bc5d8b28144574fbe731104bfd52ceb74a556e51760de776038afe2cb02fe160`;
- existing operating-room reduced-motion/target coverage: `16500048e09d246cebcee48bea829eb16e2718ddbcbb8e47a4c9264234c0cf1b`;
- existing lifecycle screenshots and 390/768/1440/zoom contract: `8ab3ed4f852bc724445cbcc8e11ae6d8e381665e2fa029f8d42ffb755322d632`.

## Skipped and not measured

- Full frontend lint/test/build, full CT, server, integration, E2E and public-release gates were deliberately not run; Stage 5 Task 4 and final merged-main own those gates.
- Screenshot update mode was deliberately not run because no reviewed visual baseline changed.
- Real iPhone/Android/tablet hardware, Safari VoiceOver and NVDA/Chrome are `not measured`; this task's evidence is automated Chromium CT.
- External OAuth/provider/email delivery, production data, deployment state and a real club-end confirmation are `not measured` and outside this task.
- Professional gitleaks scanning is `not measured` because `gitleaks` is not installed; only the targeted fallback checks above ran.
