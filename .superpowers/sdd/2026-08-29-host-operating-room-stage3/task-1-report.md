# Stage 3 Task 1 Report — lifecycle operating-room view model

## Status and scope

- BASE verified clean at `a0017d27a5a97c509b7c4f922eb48f2614241744`.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- Task brief SHA-256: `327a740ed8f37891792d7be75254e90e5395e0aacfc64479fb96aa831db86e24`.
- ADR impact: implements the view-model portion of Proposed ADR-0048/0049; no new ADR. Both ADRs remain Proposed until their full slices and active architecture agree.
- Changed surface is limited to the new pure host operating-room model, its co-located test, and this task evidence. No loader, query, route, UI, CSS, BFF, or server file changed.
- Commands used Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`.

## TDD RED → GREEN

RED was established before the production model existed:

```text
<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front test -- features/host/model/host-operating-room-model.test.ts
```

Result: the new suite failed at import because `./host-operating-room-model` did not exist. Vitest reported `1` failed new suite; the existing `409` files and `3,661` tests passed. The package-script separator also caused the existing unit suite to run, so all subsequent verification used the focused `pnpm exec vitest` form.

After the minimal model implementation, the exact focused command was:

```text
<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-operating-room-model.test.ts
```

Result: `1` file, `19/19` tests passed, `0` failures.

## Source hash → command → result → finding closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `cfa8d2c399abc6c6b65567222096264656d888e7f1952ef194d47dc29fa53b47` (`host-operating-room-model.ts`) | focused Vitest command above | GREEN, `19/19` | No-current, DRAFT/OPEN/CLOSED/PUBLISHED, before/day-of/after, requested-phase normalization, completed-phase readability, and exactly one next action are represented by one pure model. |
| `4a99e2cc377b7371e8b5f3ddf1fddef71d44ba45c15962627606f1bd12ce9789`, `f4b7e94703571c5b6435b46a21ffbb5c62a1dd478a2091e15cc97475001baa87`, `68df0959becd850c350faa231e7954bfd3c8a972a41ac410419b4dc2e783b542` (canonical lifecycle, closing, and schedule-seen models) | focused Vitest command above | GREEN, `19/19` | The new model calls `reverseLifecycleAction`, `getSessionClosingBoardView`, and `hostScheduleSeenSummary`; it does not restate their labels, closing action mapping, or schedule-seen classification policy. |
| `71c625d15f88e8ecd5f70997a32ceac864f63b064b0f3b41fc31ad64d0d2e828` (`host-operating-room-model.test.ts`) | focused Vitest command above | GREEN, `19/19` | The matrix closes DRAFT unavailable without a fake denominator/work item, denominator-aware schedule/RSVP/questions rows, zero-as-data, place independence, partial/absent sources, closing blocked/ready/published, conflict/unknown precedence, and the full domain-action priority. |
| `cfa8d2c399abc6c6b65567222096264656d888e7f1952ef194d47dc29fa53b47`, `71c625d15f88e8ecd5f70997a32ceac864f63b064b0f3b41fc31ad64d0d2e828` | `<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec eslint features/host/model/host-operating-room-model.ts features/host/model/host-operating-room-model.test.ts` | exit `0`, no findings | Both changed TypeScript files satisfy the focused repository lint rules. |

## Verification notes and residual risk

- `git diff --check` over the staged task files: exit `0`, no output.
- Targeted machine-local path, private-key marker, token prefix, and BFF-secret-name scan over the task files: exit `0`, no findings.
- The first attempted focused invocation omitted `exec`; pnpm rejected it before running tests. The corrected focused command is the one recorded above.
- Full lint, test, build, CT, E2E, server, and public-release gates were intentionally not run for this task. Loader/API integration, visual rendering, and browser behavior remain later Stage 3 tasks.
