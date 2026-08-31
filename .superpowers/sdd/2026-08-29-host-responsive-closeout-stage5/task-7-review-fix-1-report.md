# Stage 5 Task 7 review fix 1 report — hardened lifecycle accessibility evidence

## Authority and scope

- Base: `ed6673bb5944958ff12d6720ecd9b3bde842768a`.
- Review-fix brief SHA-256: `0933b6e9eee5007f408b30737ba8c5ad614a3b084f703ec57deb502b5c175ded`.
- Updated Task 7 report SHA-256: `7338e31f0b578e415890ed05c6cd12427943d4f20ca5bd2563f54e0184216076`.
- Delta manifest SHA-256: `cfba30526e906aee0f54d721912edc4f8c263eedc1dc2006a6ecfdefcfae6ba1`.
- ADR impact: `none`. ADR-0048/0049 remain Proposed and unchanged.
- The external mockup tree, user runtimes and baselines remained untouched. No production source, continuity/legacy test, screenshot, trace, provider, OAuth, email, club-end, production data, deploy, tag, PR or push surface was changed.

## Root cause and exact closure

- One generic name function accepted descendant `innerText` and form-control `value` for every interactive or landmark element. That allowed an anonymous navigation/complementary landmark to borrow body text and an unlabeled text input to borrow its current value.
- Landmarks now accept only author-provided `aria-label`, resolved `aria-labelledby`, or `title` naming sources. Descendant body text is not a landmark name.
- Interactive controls accept the bounded sources implemented by the helper: `aria-label`, resolved `aria-labelledby`, associated label text, `alt`, `title`, native button/link or supported-role text, and an explicit value only for button/reset/submit inputs. Ordinary text-input values are not names.
- Hidden, `hidden`-attribute, inert-property, `inert`-attribute, `aria-hidden`, display-hidden and visibility-hidden ancestor subtrees remain excluded. Visible missing `aria-labelledby`/`aria-describedby`/`aria-controls` references remain findings.
- The helper is a repository custom DOM/ARIA audit. Neither this report nor the corrected Task 7 report claims axe, axe-core, full accessible-name computation or comprehensive accessibility equivalence.

## TDD and focused evidence

All frontend commands used `PATH=<node24-bin>:$PATH`, `npx --yes corepack@0.35.0` and repository-pinned pnpm `11.13.1`.

| Source hash | Literal command | Result | Finding closure |
| --- | --- | --- | --- |
| Final helper tests `b8010ab86e823d27f8b55b7889a05da08ad022d17dd4c1ba0fa42b78368f1ceb` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/e2e/support/visual-authority-contract.test.ts --reporter=dot` before helper change | Expected RED: 1 file, 2 failed and 10 passed. The anonymous navigation/complementary test and the filled-unlabeled-text-input test both resolved with `[]` instead of rejecting. | Proved three false-negative elements: one navigation landmark, one complementary landmark and one text input. |
| Final helper/tests `855c41e126c3243c9dac2f1249767064f2fa476dd08f9cf980836a553b7a89b1`, `b8010ab86e823d27f8b55b7889a05da08ad022d17dd4c1ba0fa42b78368f1ceb` | The same focused Vitest command after helper hardening | GREEN: 1 file, 14/14 | Three negative cases are detected; positive author/label/content/alt/explicit-submit sources pass; hidden/inert exclusion and visible missing ARIA-reference detection remain covered. |
| Delta manifest `cfba30526e906aee0f54d721912edc4f8c263eedc1dc2006a6ecfdefcfae6ba1` | `PATH=<node24-bin>:$PATH PLAYWRIGHT_PORT=3118 PLAYWRIGHT_WORKERS=1 READMATES_API_BASE_URL=http://127.0.0.1:18118 READMATES_E2E_DB_NAME=readmates_e2e_stage5_task7_review_fix1 npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/host-authority-loss.spec.ts tests/e2e/host-workbox-stage4.spec.ts --project=chromium --workers=1 -g 'revoked authority|revision conflict preserves|schedule review fails closed|partial workbox'` | GREEN: 4/4 | Hardened custom audit found zero helper-classified serious/critical findings on 403 at 768, 409 at 1024, partial at 1200 and unknown at 1440. No production defect was exposed. |
| Delta manifest `cfba30526e906aee0f54d721912edc4f8c263eedc1dc2006a6ecfdefcfae6ba1` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec eslint tests/e2e/support/visual-authority-contract.test.ts tests/e2e/support/visual-authority-contract.ts` | GREEN: exit `0`, no output | Exact changed TypeScript static quality passed. |
| Delta manifest `cfba30526e906aee0f54d721912edc4f8c263eedc1dc2006a6ecfdefcfae6ba1` | `git diff --check` | GREEN: no output | Delta and evidence formatting are clean. |
| Delta manifest `cfba30526e906aee0f54d721912edc4f8c263eedc1dc2006a6ecfdefcfae6ba1` | Targeted local-root, secret-token and private-domain scan across both Task 7 reports, review brief/manifest and every delta source | GREEN: no matches | No concrete machine-local path, secret-shaped value or private domain was persisted. |
| Delta manifest `cfba30526e906aee0f54d721912edc4f8c263eedc1dc2006a6ecfdefcfae6ba1` | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-7-review-fix-1-manifest.sha256` | GREEN: 4/4 entries `OK` | Review brief, corrected Task 7 report and exact helper/test delta are sealed. |

## Counts, unchanged evidence and limits

- Negative accessibility cases: `3` elements across `2` RED tests; all three are detected after hardening.
- Positive/boundary characterization: valid author/label/content/alt/explicit-submit sources, hidden/inert exclusion and visible missing ARIA references are retained in the final 14-test helper suite.
- Hardened recovery browser audit: `4/4` cases, zero helper-classified serious/critical findings, no production change required.
- The non-current continuity/legacy case and all unchanged Stage evidence were deliberately not rerun.
- Manual VoiceOver/NVDA, Firefox/WebKit/hardware assistive technology, external provider/OAuth, real email and real club-end/close remain `not measured`.
- Full frontend gates, CT/E2E, server/integration and public-release checks remain owned by Stage 5 Task 4.
