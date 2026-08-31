# Stage 5 Task 4 gate fix 4 report — CLOSED 768 Docker baseline

## Authority and scope

- Base: `66fe6fc25c02e416b30a7dbbfec0af0119514f5c`.
- Fix brief SHA-256: `aedef45ebed5006fd87c8cd1c5c575803b7ca6810e0c5aa6b4bcf97b4b1124ef`.
- ADR impact: `none`. This scoped raster alignment does not alter or reopen ADR-0048 or ADR-0049.
- Canonical renderer: `mcr.microsoft.com/playwright:v1.61.1-jammy`, local image ID `sha256:7b86926fff94374389e8e1f4fdc5c76d050d4a06a7886bb537bf412b20e2b71e`, repository-pinned `pnpm@11.13.1`, `CI=true`, one worker.
- Allowed tracked delta: the CLOSED 768 host-focus-deck PNG plus this report and its manifest. Production and test source remained byte-identical.
- The unrelated admin mockup tree remained untouched and unstaged. No provider, OAuth, email, production data, deploy, tag, PR or push action ran.

## Root cause and raster decision

The focused pre-update Docker run reproduced one failure after all preceding semantic, recovery and focus assertions passed: the checked-in image was `768x2555`, while the stable renderer produced `768x2427`. The 128px reduction is the expected removal of the nonexistent mobile-navigation reserve at the 768px desktop-chrome boundary introduced by `f8e84242`; it is not content loss.

Visual inspection of the pre-update expected, actual and diff images and the final tracked image confirmed:

- the long Korean/English title wraps without clipping;
- the hierarchy remains meeting context → lifecycle → primary action → close checklist → close evidence/related work → recovery bar → final CTA;
- the recovery bar and full-width `정리본 올리기` action are completely visible;
- no text, badge, card, divider or control is cut off; only the obsolete bottom reserve is gone.

## Exact canonical Docker commands

Focused update (the only command that used snapshot update mode):

```sh
docker run --rm --ipc=host -e CI=true -e READMATES_CT_PACKAGE_MANAGER=pnpm@11.13.1 -v "$PWD:/work" -v readmates-ct-root-node-modules:/work/node_modules -v readmates-ct-front-node-modules:/work/front/node_modules -v readmates-ct-pnpm-store:/pnpm-store -w /work/front mcr.microsoft.com/playwright:v1.61.1-jammy /bin/sh -lc 'set -eu
corepack enable
corepack prepare "$READMATES_CT_PACKAGE_MANAGER" --activate
resolved_pnpm_version="$(pnpm --version)"
expected_pnpm_version="${READMATES_CT_PACKAGE_MANAGER#pnpm@}"
if [ "$resolved_pnpm_version" != "$expected_pnpm_version" ]; then
  echo "Expected pnpm $expected_pnpm_version, got $resolved_pnpm_version" >&2
  exit 1
fi
pnpm config set store-dir /pnpm-store
pnpm install --frozen-lockfile=false
pnpm exec playwright test --config=playwright-ct.config.ts features/host/ui/meeting-workspace/host-focus-deck.ct.tsx --workers=1 --grep "Diary spread CLOSED locks the 768 tablet-narrow composition with recovery" --update-snapshots'
```

Focused verification (same selector, no update flag):

```sh
docker run --rm --ipc=host -e CI=true -e READMATES_CT_PACKAGE_MANAGER=pnpm@11.13.1 -v "$PWD:/work" -v readmates-ct-root-node-modules:/work/node_modules -v readmates-ct-front-node-modules:/work/front/node_modules -v readmates-ct-pnpm-store:/pnpm-store -w /work/front mcr.microsoft.com/playwright:v1.61.1-jammy /bin/sh -lc 'set -eu
corepack enable
corepack prepare "$READMATES_CT_PACKAGE_MANAGER" --activate
resolved_pnpm_version="$(pnpm --version)"
expected_pnpm_version="${READMATES_CT_PACKAGE_MANAGER#pnpm@}"
if [ "$resolved_pnpm_version" != "$expected_pnpm_version" ]; then
  echo "Expected pnpm $expected_pnpm_version, got $resolved_pnpm_version" >&2
  exit 1
fi
pnpm config set store-dir /pnpm-store
pnpm install --frozen-lockfile=false
pnpm exec playwright test --config=playwright-ct.config.ts features/host/ui/meeting-workspace/host-focus-deck.ct.tsx --workers=1 --grep "Diary spread CLOSED locks the 768 tablet-narrow composition with recovery"'
```

## Evidence ledger

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Base `66fe6fc25c02e416b30a7dbbfec0af0119514f5c`; target before `9812f601a665a25bc314525066c45140dc190d26dce7a1228472be3c4163d7bc` | Focused canonical Docker verification command above | Expected RED: `0/1`; expected `768x2555`, actual `768x2427`. All assertions before the screenshot comparison passed. | Reproduced the exact raster-only finding and excluded semantic, recovery and focus regressions. |
| Same base and target-before hash | Focused canonical Docker update command above | GREEN: `1/1`; Playwright reported only `diary-closed-768.png is re-generated, writing actual`. | Updated the one reviewed CLOSED 768 baseline; no update-all mode ran. |
| Target after `b16601d8f3e56acd6eb7e1d66b2b9d699537653fe51f664a18e67440a27c9491` | Focused canonical Docker verification command above | GREEN: `1/1` in 1.0s, no snapshot update. | The exact Docker renderer now accepts the scoped baseline. |
| Full pre/post PNG inventories, 25 files each | `find front/__screenshots__ -type f -name '*.png' -print0 \| sort -z \| xargs -0 shasum -a 256` plus filename-keyed SHA comparison | Exactly one changed PNG: `diary-closed-768.png`; all 24 non-target PNGs are byte-identical. | Both unrelated admin snapshots and every other visual baseline are preserved. |
| Final allowed delta | `git diff --check` | GREEN: exit `0`, no output. | The scoped tracked delta has no whitespace errors. |
| Final manifest | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-4-manifest.sha256` | GREEN: all entries `OK`. | Brief, final raster and report are sealed together. |
| Added report lines and final allowed paths | Targeted machine-local path, private-domain, private-key marker and common secret-shape scan | GREEN: 0 matches. | No public-repository safety finding was introduced. `gitleaks` is unavailable and is not claimed. |

## Boundary

- This fix intentionally ran the one load-bearing CLOSED 768 Docker CT only; the full CT matrix and unrelated frontend/server/E2E gates are owned by the Stage 5 controller and were not repeated here.
- The evidence is repository/local-container evidence, not live production or physical-device evidence.
- No load-bearing finding remains in this scoped raster surface.
