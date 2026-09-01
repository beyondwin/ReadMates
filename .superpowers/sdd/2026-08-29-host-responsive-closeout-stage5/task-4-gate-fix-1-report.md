# Stage 5 Task 4 gate fix 1 report — account trigger accessibility contract

## Authority and scope

- Gate source: `2b6cc84e14236f43feec76618f5d6a55dc0317da`.
- Fix brief SHA-256: `1733229f43621b4351764af4ca7889d0cb45ccc573c3f6f2cc1eea464fe79ecf`.
- Delta manifest SHA-256: `361affbdf5e51d4360fc3e0d064105e569f1227c134788262da6cb22dab1add9`.
- ADR impact: `none`. ADR-0048/0049 and all active documentation remain unchanged.
- This is a test-only correction. No production source, server, CT, E2E, public-release, provider, OAuth, email, club-end, deploy, tag, PR, push, runtime, baseline or external mockup was changed.

## Root cause and contract decision

The full frontend gate exposed a stale SPA layout assertion from before the Task 7 accessibility correction. It required two distinct `aria-controls` values while both account dialogs were closed and unmounted. That expectation now contradicts the approved conditional-target contract and would create two references to nonexistent elements.

The current `AccountMenu` production implementation already satisfies the required semantics: each closed trigger has `aria-expanded="false"`, omits `aria-controls`, and has no mounted dialog; an opened trigger has `aria-expanded="true"` and references the mounted dialog's nonempty generated id. The stale integration test was therefore updated without changing production code. It now proves both desktop and mobile trigger lifecycles, verifies that each opened dialog has a distinct id, and verifies that switching the active trigger removes the inactive trigger's reference.

The regression would fail if production restored a closed-target reference, failed to mount an opened dialog, exposed an empty/shared dialog id, failed to connect the active trigger to the mounted target, or left the inactive trigger expanded or controlling an unmounted target.

## TDD and focused evidence

All frontend commands used `PATH=<node24-bin>:$PATH`, `npx --yes corepack@0.35.0` and repository-pinned pnpm `11.13.1`.

| Source hash | Literal command | Result | Finding closure |
| --- | --- | --- | --- |
| Pre-fix SPA layout test `d019ca4a87ef4074af8ff68a74966fb603087806845864128d6bdf5b2654c487` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/spa-layout.test.tsx --reporter=dot` | Expected RED: 1 file failed, 1/12 test failed; line 226 received one distinct `null` value instead of two distinct control ids. | Reproduced the exact gate failure and established that the obsolete closed-state expectation, not a runtime error, caused it. |
| Final SPA/account/a11y sources sealed by delta manifest `361affbdf5e51d4360fc3e0d064105e569f1227c134788262da6cb22dab1add9` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/spa-layout.test.tsx features/auth/ui/account-menu.test.tsx tests/e2e/support/visual-authority-contract.test.ts --reporter=dot` | GREEN: 3 files, 30/30. The unchanged router hydration case emitted its pre-existing `No HydrateFallback element` stderr notice; it did not fail. | Closed and opened desktop/mobile semantics, the owning account component contract, and the Task 7 bounded ARIA helper regressions all pass together. |
| Final changed test `54fa8f0f58697e613e3b8c3518266999944053f26f235e1e1d8250e9139dc6f9` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec eslint tests/unit/spa-layout.test.tsx` | GREEN: exit `0`, no output. | Exact changed-file static quality passed without warnings. |
| Final changed test `54fa8f0f58697e613e3b8c3518266999944053f26f235e1e1d8250e9139dc6f9` | `git diff --check -- front/tests/unit/spa-layout.test.tsx` | GREEN: exit `0`, no output. | The product delta has no whitespace errors. |
| Delta manifest `361affbdf5e51d4360fc3e0d064105e569f1227c134788262da6cb22dab1add9` | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-1-manifest.sha256` | GREEN: 5/5 entries `OK`. | The brief, changed integration test, production account source and focused Task 7 account/a11y sources are sealed together. |
| Same final scoped sources and evidence artifacts | `python3 -c 'import pathlib,re,sys; pattern=re.compile("|".join(["/"+"Users"+"/","/"+"home"+"/","https?"+"://","BEGIN "+"PRIVATE KEY","AK"+"IA[0-9A-Z]{16}","sk"+"-[A-Za-z0-9]{32,}"])); hits=[f"{path}:{number}:{line}" for path in sys.argv[1:] for number,line in enumerate(pathlib.Path(path).read_text().splitlines(),1) if pattern.search(line)]; print("\n".join(hits)); raise SystemExit(bool(hits))' .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-1-brief.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-1-report.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-1-manifest.sha256 front/tests/unit/spa-layout.test.tsx front/features/auth/ui/account-menu.tsx front/features/auth/ui/account-menu.test.tsx front/tests/e2e/support/visual-authority-contract.test.ts` | GREEN: no matches. `gitleaks` was unavailable, so no gitleaks result is claimed. | No concrete machine-local path, URL, private-key marker or common secret-shaped value was persisted in the scoped delta/evidence. |

## Deliberately not run

Per the fix brief, the full frontend suite/build, server gates, CT, E2E and public-release checks were not run. The controller resumes the interrupted Stage 5 gate after fresh scoped review. Manual assistive-technology behavior remains covered only by the Stage 5 evidence boundary and was not remeasured for this test-only correction.
