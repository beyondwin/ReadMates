# Stage 5 Task 7 review fix 1 brief

Fix only the single IMPORTANT accessibility-evidence finding from the fresh Task 7 review, from base `ed6673bb5944958ff12d6720ecd9b3bde842768a`.

## Finding

The shared browser audit helper treats landmark descendant `innerText` and text-input `value` as accessible names. An anonymous `<nav><a>Go</a></nav>` and an unlabeled `<input value="filled-but-unlabelled">` therefore pass even though the accessibility tree exposes unnamed `navigation` and `textbox` roles. The report also overstates the custom rules as `axe-equivalent`.

## Required closure

1. Add focused negative characterization tests for at least anonymous navigation/complementary landmarks and a filled but unlabeled text input. RED must prove the current false negatives.
2. For landmarks, accept only actual author-provided naming sources such as a valid `aria-label`, valid `aria-labelledby` resolution, or title where the platform exposes it; descendant body text is not the landmark name.
3. For form/interactive controls, remove `value` as a generic accessible-name fallback. Preserve valid native text/name cases such as button text, associated label, aria-label/labelledby, image alt, and explicitly named submit/image inputs as appropriate.
4. Correct hidden/inert ancestor handling and the already-closed visible ARIA-reference checks without weakening them.
5. Rerun only the helper characterization and the four recovery-width/a11y browser cases. If the hardened helper exposes a real production issue, classify it and make the smallest TDD fix; do not suppress or weaken the audit.
6. Update `task-7-report.md` and the review-fix report to remove `axe-equivalent` and claim only the exact DOM/ARIA rules implemented. Keep manual assistive-tech and external systems `not measured`.
7. Run exact changed-file ESLint, `git diff --check`, generic public-safety scan and delta SHA-256 manifest. Do not rerun continuity/legacy or unchanged Stage evidence.
8. Force-add ignored brief/report/manifest and commit exactly `test(host): harden lifecycle accessibility evidence` if no production behavior changes are required; use `fix(host): close lifecycle accessibility findings` only if the hardened audit proves and fixes production defects.

Return RED/GREEN, negative-case counts, recovery audit counts/findings, exact claims corrected, manifest and commit SHA. Preserve external mockups, user runtimes and baselines.
