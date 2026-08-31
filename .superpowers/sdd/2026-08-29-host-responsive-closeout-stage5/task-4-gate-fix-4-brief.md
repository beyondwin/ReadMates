# Stage 5 Task 4 Gate Fix 4 Brief

- Base: `66fe6fc25c02e416b30a7dbbfec0af0119514f5c`.
- Finding: canonical Docker CT ran all 121 cases. 118 passed; `diary-closed-768.png` alone has an intentional 2555px -> 2427px height change after `f8e84242` removed the nonexistent mobile-nav reserve at the 768px desktop-chrome boundary. All CLOSED semantic, recovery, focus and viewport assertions passed. Two unrelated admin snapshots differ by only +/-1px and must remain unchanged.
- Scope: regenerate only the CLOSED 768 host-focus-deck snapshot in the canonical Playwright Docker image, inspect expected/actual/diff or the updated image for clipping and hierarchy, and verify that exact test in Docker update then verify mode.
- Allowed tracked change: `front/__screenshots__/features/host/ui/meeting-workspace/host-focus-deck.ct.tsx/diary-closed-768.png` plus this scoped report/manifest.
- Forbidden: production/test source, other PNGs, update-all mode, admin snapshots, external mockup tree.
- Required evidence: before/after SHA-256, exact Docker image/command, focused update result, focused verify result, non-target PNG byte-identity, visual inspection conclusion, diff-check, manifest and public-safety scan.
- Commit exactly: `test(host): align closed diary docker baseline`
