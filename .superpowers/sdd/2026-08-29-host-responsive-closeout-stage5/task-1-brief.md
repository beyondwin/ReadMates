# Stage 5 Task 1 brief — responsive and accessible lifecycle surfaces

Implement only Stage 5 plan Task 1 from base `9e90834c26496cb4af4b84f4ccda22c10be34fcf`.

- Authority: Stage 5 plan SHA-256 `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- ADR impact: `none`; this task proves the existing Proposed ADR-0048/0049 layout/interaction contract and must not accept or rewrite either ADR.
- Read the current root/front/design/execution guides required by AGENTS.md before editing. Use the `impeccable` UI discipline for the touched surface.
- Preserve the pre-existing untracked `design/mockups/2026-08-30-admin-operations-redesign/` directory and all user runtime ports/containers.

## Exact scope

1. Start with RED focused component tests for the existing host shell, operating room, workbox and lifecycle destinations at `390`, `767`, `768`, `1024`, `1199`, `1200`, and `1440` CSS pixels.
2. Prove, with semantic/geometry assertions rather than screenshots alone:
   - at 390px the order is meeting context → phase → next action → preparation → workbox;
   - at 768–1199px the workbox is below primary content and summary counts follow the phase tabs;
   - at 1200+ the desktop rail/composition is restored;
   - no horizontal overflow, safe-area overlap or clipped recovery/action controls;
   - interactive targets are at least 44px where the approved mobile contract requires them;
   - body/sticky primary actions never expose the same accessible name simultaneously.
3. Add public-safe fixture variants for long Korean and English text, missing image, zero and large counts, partial rows, and a 200% zoom proxy. Do not add member data, private paths, secrets or token-shaped fixture values.
4. Prove reduced-motion behavior, visible focus, logical keyboard order, menu Escape/return focus, roving phase/workbox tabs and color-independent status. Reuse existing shell interaction tests when their source hash is unchanged; add only missing assertions.
5. Apply the smallest CSS/component changes needed. Do not change schedule-seen, workbox identity/state, notification, settings, auth, API, server or route semantics.
6. Run focused Vitest and focused Playwright CT for only the changed host specs. Use the pinned Node 24 launcher and `npx --yes corepack@0.35.0 pnpm`. Use CT update mode only if an intentional reviewed baseline change is required; inspect provenance/diff, then run verification mode. Never accept host-vs-Docker raster drift as a baseline update.
7. Run exact ESLint on changed TS/TSX, `git diff --check`, targeted public-safety scan and a SHA-256 manifest. Record `source hash → command → result → finding closure` and all skipped/not-measured checks in `task-1-report.md`.
8. Force-add the ignored brief/report/manifest plus intended code/test/baseline files and commit exactly `feat(host): lock responsive operating room contract`.

## Exclusions

- No Stage 5 Task 2 recovery-state-machine or Task 3 redirect work.
- No active docs/CHANGELOG/ADR edits.
- No full frontend/server/CT/E2E/public-release gate; those belong to Stage 5 Task 4 and final merged-main.
- No deploy, tag, push, PR, external OAuth/provider/email, real club-end or production mutation.

Return the commit SHA, RED and GREEN counts, exact focused CT execution/provenance, manifest result, and every remaining environment limitation.
