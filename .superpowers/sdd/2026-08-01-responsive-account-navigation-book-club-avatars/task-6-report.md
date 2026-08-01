# Task 6 report — render stored avatar keys

## RED

Command:

```sh
corepack pnpm --dir front exec vitest run features/current-session/api/current-session-contracts.test.ts features/archive/ui/member-session-detail-page.test.tsx features/public/ui/public-session.test.tsx tests/unit/current-session.test.tsx tests/unit/my-page.test.tsx
```

Result: failed as expected. The current-session Zod boundary stripped an unknown
future `avatarKey`; public same-surname author entries all rendered the
`archive-box` fallback; and a legacy current-session assertion still expected
monogram initials after Task 1 removed that API.

## GREEN and regression evidence

Commands and results:

```sh
corepack pnpm --dir front exec vitest run features/current-session features/archive features/member-home features/public features/host shared/auth tests/unit/frontend-boundaries.test.ts
# 87 files, 607 tests passed

corepack pnpm --dir front test
# 224 files, 1780 tests passed

corepack pnpm --dir front lint
# passed

corepack pnpm --dir front build
# passed

rg -n 'fallbackInitial|avatarInitial' front --glob '*.{ts,tsx}'
# no matches

git diff --check
# passed
```

Diagnostic TypeScript check:

```sh
corepack pnpm --dir front exec tsc --noEmit 2>&1 | rg 'avatarKey|features/archive/route/notes-feed-data'
# no matches
```

The full direct `tsc --noEmit` remains outside the repository's canonical
frontend gate and has unrelated pre-existing diagnostics; this task leaves no
avatar-key or notes-feed-data diagnostic in that command.

## Changed surfaces

- Added stored `avatarKey: string` projection fields and string-only Zod
  boundaries for current-session, archive/note feed, member-home, public, host
  attendees, and current membership/auth data.
- Passed those stored values directly to all existing `AvatarChip` consumers,
  including the responsive account navigation and the host attendance editor.
- Updated all affected API/UI/E2E fixtures and assertions. Same-surname public
  authors prove `reading-lamp`, `book-tote`, and `calendar-book` remain
  distinct while their full names and status labels remain visible.
- Set the static public operations intro to `archive-box`; removed all legacy
  `fallbackInitial` and `avatarInitial` callers under `front`.
- Typed the archive notes-feed empty result so the required avatar projection
  is preserved through the route boundary.

## Decisions and constraints preserved

- API contracts accept any string, including unknown future keys, at the Zod
  boundary; only `AvatarChip` chooses its visual fallback.
- No feature API/model imports the avatar manifest or key normalizer.
- Nullable archive/public author names remain nullable; their rendered records
  now still carry a safe avatar key.
- No profile-image URL rendering, BFF/endpoint changes, telemetry changes, or
  auth/navigation behavior changes were made.

## Concerns

None for the Task 6 frontend surface. The repository-wide direct TypeScript
command has unrelated pre-existing diagnostics, so the supported Vitest, lint,
and Vite build gates above are the completion evidence.
