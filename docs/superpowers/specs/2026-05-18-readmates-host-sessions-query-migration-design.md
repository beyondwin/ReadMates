# Host Sessions TanStack Query Migration Design

## Summary

Move the full `host/sessions` server-state surface to TanStack Query while preserving ReadMates' route-first frontend architecture.

This is the next server-state migration after `host/members` and `host/notifications`. The goal is to make Query cache the canonical owner for host session list/detail/current-session data and for session mutations, while keeping form drafts and other interaction state local to UI components.

## Goals

1. Migrate host session list, detail, dashboard current session, deletion preview, and editor manual-dispatch reads to TanStack Query.
2. Move host session mutations to Query-backed hooks with explicit invalidation.
3. Reuse the same session list cache from the notification route instead of keeping a notification-specific host session query key.
4. Keep UI components prop/callback driven; route modules still assemble data and actions.
5. Preserve existing server API contracts and route behavior.

## Non-Goals

- No backend API contract changes.
- No migration of editor form drafts, validation state, AI generation progress, JSON import preview, delete confirmation state, or other interaction state into Query.
- No redesign of host dashboard or session editor UI.
- No conversion of member `current-session` feature actions in this slice, except invalidating host current-session cache when host mutations can affect it.
- No platform-admin or AI model catalog work in this spec.

## Architecture

Add a new module:

```text
front/features/host/queries/host-session-queries.ts
```

The module owns host-session query keys, query option factories, invalidation helpers, and mutation hooks. Query keys include club scope so shared-domain and club-domain routes cannot collide:

```ts
["host", "sessions", "scope", clubSlug ?? null, ...]
```

The module should expose at least these key groups:

- `all`
- `scope(context)`
- `lists(context)`
- `list(page, context)`
- `detail(sessionId, context)`
- `current(context)`
- `dashboard(context)`
- `deletionPreview(sessionId, context)`
- `manualDispatchesRoot(context)`
- `manualDispatches(request, context)`

The existing route-first boundary remains:

- `features/host/queries`: server-state ownership and mutation hooks.
- `features/host/route`: loader seeding, `useQuery` reads, and action prop assembly.
- `features/host/ui`: render-only components that receive props and callbacks.

## Owned Server State

TanStack Query becomes the owner for:

- `GET /api/host/sessions`
- `GET /api/host/sessions/{sessionId}`
- `GET /api/sessions/current` as consumed by host dashboard
- `GET /api/host/dashboard`
- `GET /api/host/sessions/{sessionId}/deletion-preview`
- `GET /api/host/notifications/manual/dispatches` when scoped to a session editor

Notification event, delivery, audit, and manual member-option state remain under `hostNotificationKeys`. Only the host session list used by notification manual dispatch moves to shared `hostSessionKeys`.

### Deletion Preview Cache Strategy

`hostSessionDeletionPreviewQuery` is read via `queryClient.fetchQuery` at click time, not via `useQuery`. The current implementation issues a fresh request per click. To preserve that behavior under Query ownership the query must opt out of result caching with both `staleTime: 0` and `gcTime: 0`, otherwise a repeat click will serve a stale preview that no longer reflects server state mutated by interleaved publish / close / update calls. The alternative — adding deletion-preview invalidation to every mutation that can change preview content — adds matrix surface without UX benefit.

### Mutation Return Shapes

The migration intentionally preserves the host API's existing dual return convention:

- Read endpoints return parsed JSON.
- Most mutations return raw `Response` (so callers can inspect `.ok` and parse on success).
- `commitHostSessionImport` and `previewHostSessionImport` are exceptions — they return parsed JSON because the editor consumes the body shape directly.

Mutation hooks therefore split their `onSuccess` handling:

- Response-returning hooks gate invalidation on `response.ok` (a `200`-style guard). A non-ok response is not a thrown error; the hook resolves but does not invalidate, and the caller still receives the `Response` to surface its own error UI.
- `useCommitHostSessionImportMutation` invalidates unconditionally on success because the API call either resolves with a valid `SessionImportCommitResponse` or throws.

## Loader Seeding

`front/src/app/routes/host.tsx` already receives the shared `QueryClient`. Convert dashboard and editor loaders to factories.

### Dashboard Loader

`hostDashboardLoaderFactory(queryClient)` should:

1. Require host auth.
2. Resolve `clubSlug` from route params.
3. Seed:
   - `hostCurrentSessionQuery(context)`
   - `hostDashboardQuery(context)`
   - `hostSessionListQuery({ limit: 50 }, context)`
   - `hostNotificationSummaryQuery(context)`
4. Preserve the existing notification summary fallback for transient notification API failures.

The route should read from Query with `useQuery`. It may keep the existing loader return shape for compatibility, but Query data should be the rendered source of truth.

**Behavior change — dashboard session list is now paginated.** The pre-migration loader calls `fetchHostSessions(context)` without a page argument, so the BFF returns the full host session list and the UI then paginates on display. The migration loader requests `{ limit: 50 }`, which becomes a paginated `?limit=50` request. The dashboard UI already calls `actions.loadHostSessions(page)` for "load more" so the pagination plumbing exists; the loader behavior simply aligns with it. Loader-level tests must assert the URL carries `limit=50` so this change does not silently revert.

### Editor Loader

`hostSessionEditorLoaderFactory(queryClient)` should:

1. Require host auth.
2. Validate `sessionId`.
3. Resolve `clubSlug` from route params.
4. Seed:
   - `hostSessionDetailQuery(sessionId, context)`
   - `hostSessionManualDispatchesQuery({ sessionId, page: { limit: 20 } }, context)`

The edit route should read both values with `useQuery` and pass `session` plus `notificationDispatches` into `HostSessionEditor`.

The new-session route has no detail query. It uses the create mutation through the same action prop interface.

## Route/UI Boundary

### Host Dashboard Route

`front/features/host/route/host-dashboard-route.tsx` should read:

- `hostCurrentSessionQuery(context)`
- `hostDashboardQuery(context)`
- `hostSessionListQuery({ limit: 50 }, context)`
- `hostNotificationSummaryQuery(context)`

It should remove `useRevalidator` as the refresh mechanism for opening a session. Query invalidation becomes the refresh mechanism.

`HostDashboard` can keep the existing `actions` prop shape. The route should wrap Query-backed mutations and fetches behind that shape.

### Host Session Editor Route

`front/features/host/route/host-session-editor-route.tsx` should read:

- `hostSessionDetailQuery(sessionId, context)` for edit routes.
- `hostSessionManualDispatchesQuery({ sessionId, page: { limit: 20 } }, context)` for edit routes.

`HostSessionEditor` keeps receiving:

- `session`
- `notificationDispatches`
- `actions`

The editor should not import Query hooks or API clients directly.

### Host Dashboard UI

`front/features/host/ui/host-dashboard.tsx` should keep API access behind action props. Canonical page data comes from Query; the existing four pieces of local state are dispositioned as follows:

| Local state | Disposition under Query ownership |
| --- | --- |
| `appendedHostSessions` (paginated append buffer) | Keep. Canonical first page comes from Query; appended pages remain local. Cleared when the base list invalidates and refetches so stale appended rows do not survive a mutation. |
| `hostSessionVisibilityOverrides` (optimistic visibility) | Remove. Visibility mutations invalidate detail / list / dashboard, so the next refetch carries authoritative state — no local override is needed. |
| `locallyOpenedSessionId` (optimistic open badge) | Keep as transient UX state. `useOpenHostSessionMutation` invalidates `current`, `lists`, `dashboard`, and `detail`; the local flag bridges the gap until the refetch lands. |
| `pendingUpcomingAction` / `upcomingMessage` | Keep. These are pure UI affordances (toast / disabled-button state), not server state. |

The "load more" buffer should reset whenever the base list query reports a new `dataUpdatedAt` for the first page so a post-mutation refresh starts from a clean page-1.

### Host Session Editor UI

`front/features/host/ui/host-session-editor.tsx` keeps local state for:

- form draft fields
- validation status
- delete confirmation state
- import preview
- AI preview and progress
- transient save/error labels

Background Query refetch must not overwrite a user's in-progress draft. The editor already uses `useReducer(reducer, initialState, init(session))`, and React's `useReducer` runs the `init` callback only on mount. A subsequent re-render with a new `session` prop (e.g., from a background `useQuery` refetch) therefore does NOT re-seed the reducer — drafts are inherently safe under Query ownership without further guards.

The corollary is that the editor cannot rely on prop changes to surface fresh server data either. After a successful mutation it dispatches reconciliation actions (`PUBLICATION_SAVED`, `FEEDBACK_DOCUMENT_UPDATED`, etc.) from the mutation success path so the reducer merges authoritative fields back into the form. Migration must preserve those explicit dispatches — converting an `await actions.savePublication(...)` followed by a local dispatch into a Query-only flow that just invalidates would leave the form fields stale until the user manually refreshed.

## Mutations

Mutation hooks live in `host-session-queries.ts`. Route modules call `mutateAsync` and adapt the result to the existing action prop contracts.

Expected hooks:

- `useCreateHostSessionMutation(context)`
- `useUpdateHostSessionMutation(context)`
- `useDeleteHostSessionMutation(context)`
- `useOpenHostSessionMutation(context)`
- `useCloseHostSessionMutation(context)`
- `usePublishHostSessionMutation(context)`
- `useSaveHostSessionVisibilityMutation(context)`
- `useSaveHostSessionPublicationMutation(context)`
- `useUpdateHostSessionAttendanceMutation(context)`
- `useCommitHostSessionImportMutation(context)`

Deletion preview should be a lazy query or `queryClient.fetchQuery`, not a mutation.

Session import preview remains a user-requested validation call and does not need cache ownership in this slice.

## Invalidation Matrix

Common invalidation helpers:

- `invalidateHostSessionLists(client, context)`
- `invalidateHostSessionDetail(client, sessionId, context)`
- `invalidateHostCurrentSession(client, context)`
- `invalidateHostSessionDashboard(client, context)`
- `invalidateHostSessionManualDispatches(client, context)`
- `invalidateHostSessionSurface(client, context)`

Mutation success behavior:

| Mutation | Query updates |
| --- | --- |
| `createSession` | invalidate lists and dashboard. Detail is fetched by the destination route when needed. |
| `updateSession` | invalidate detail, lists, dashboard, and current session. |
| `deleteSession` | remove detail if present; invalidate lists, dashboard, current session, and manual dispatches. |
| `openSession` | invalidate detail, lists, dashboard, and current session. |
| `closeSession` | invalidate detail, lists, dashboard, current session, and manual dispatches. |
| `publishSession` | invalidate detail, lists, dashboard, current session, and manual dispatches. |
| `saveVisibility` | invalidate detail, lists, and dashboard. |
| `savePublication` | invalidate detail, lists, dashboard, and manual dispatches. |
| `updateAttendance` | invalidate detail and current session. |
| `commitSessionImport` | invalidate detail, lists, dashboard, current session, manual dispatches, and notification state. |

`commitSessionImport` should also invalidate `hostNotificationKeys.scope(context)` through an existing notification invalidation helper because feedback document publication can affect notification ledgers. That cross-surface invalidation is composed in `host-session-editor-route.tsx` (which imports both query modules) so `host-session-queries.ts` does not need to import `host-notification-queries.ts` and the modules remain free of an import cycle.

### Cross-surface invalidation semantics after sharing

Today `hostNotificationSessionsQuery` lives under `hostNotificationKeys.scope`, so any caller of `invalidateHostNotifications(...)` happens to also refresh the notification-page session selector cache. After the migration the same query alias resolves to `hostSessionKeys.list({ limit: 50 }, context)` — outside the notification scope — and `invalidateHostNotifications` no longer touches it. This is the correct semantic: no host notification mutation changes the host session list, so the previous behavior was over-invalidation that happened to be harmless.

The inverse direction is preserved: host session mutations call `invalidateHostSessionLists` (and its parents), which invalidates the shared key the notification selector now subscribes to, so editing or publishing a session from anywhere still refreshes the notification page's selector.

## Notification Route Integration

`front/features/host/queries/host-notification-queries.ts` currently owns a notification-specific `hostSessions` key. Replace or wrap that read so the notification route uses the shared session module's list query, for example `hostSessionListQuery({ limit: 50 }, context)` for the selector's initial page.

The notification route should still own:

- notification summary
- event ledger
- delivery ledger
- test-mail audit
- manual member options
- manual dispatch ledger for notification-page filters
- manual preview and confirm mutations

Only the session selector list becomes shared with `host/sessions`.

## Error and Loading Behavior

Existing route error boundaries remain in place.

The dashboard and editor routes should prefer seeded Query data for initial render. During background refetch:

- Keep the last successful data visible where TanStack Query already does so.
- Surface existing UI error messages for action failures.
- Do not introduce new global loading screens for refetches after initial loader completion.

For mutation failures, preserve current user-facing copy where possible. Query should change state ownership, not copy or tone.

## Testing

Add focused tests for the new query module:

- Query keys include `clubSlug` scope.
- Pagination keys normalize optional values consistently.
- Query functions call the existing host API wrappers with the expected page/context.
- Mutation success invalidates or removes the expected keys.
- `commitSessionImport` invalidates both host session and notification surfaces.
- Mutation hooks gating on `response.ok` do NOT invalidate when the API returns a non-ok response (at least `useCreateHostSessionMutation` and `useDeleteHostSessionMutation` need this case so the guard is covered on both create and remove-bearing branches).
- `hostSessionDeletionPreviewQuery` does not retain results between fetches (i.e., `staleTime`/`gcTime` opt-out is honoured).

Update loader tests:

- Dashboard loader factory seeds current session, dashboard, session list, and notification summary.
- Dashboard loader URL for sessions includes `limit=50`, locking in the pagination behavior change.
- Dashboard loader preserves the notification summary fallback.
- Editor loader factory seeds detail and manual dispatches.
- Notification loader writes the host session list into `hostSessionKeys.list({ limit: 50 }, context)` (the shared key), not into the deprecated `hostNotificationKeys.hostSessions`.
- Club-scoped routes keep `clubSlug` in query keys and fetch paths.

Update route/UI regression tests:

- Dashboard renders from Query-seeded data.
- "Load more" fetches the next host session page through Query and appends it; the append buffer clears when the base list invalidates.
- Open and visibility actions refresh through Query invalidation rather than `useRevalidator`.
- Editor reads detail and manual dispatches from Query.
- Save, close, publish, delete, attendance, and import commit actions call Query-backed mutations and invalidate cache.
- Editor draft state is not overwritten by a background detail refetch.
- Editor still dispatches reducer reconciliation actions (`PUBLICATION_SAVED`, `FEEDBACK_DOCUMENT_UPDATED`, etc.) after the corresponding mutation resolves.
- Notification route session selector reads the shared host session list key.

Suggested focused commands:

```bash
pnpm --dir front test -- host-session-queries
pnpm --dir front test -- host-dashboard.test.tsx host-session-editor.test.tsx host-notifications.test.tsx
pnpm --dir front lint
```

Because this migration changes a broad frontend state surface, final implementation should also consider:

```bash
pnpm --dir front test
pnpm --dir front build
```

## Documentation

Update `docs/development/server-state-migration.md`:

- Move `host/sessions` to completed.
- Reorder follow-up candidates around `current-session`, `platform-admin`, and archive/feedback/public read paths.

Update `CHANGELOG.md` Unreleased:

- Add a concise entry that `host/sessions` server state moved to TanStack Query, including dashboard list/detail/editor mutations and notification session-selector sharing.

## Rollout

This is a frontend-only migration. There is no database migration, server deployment change, or API compatibility break.

Implementation should land as a single `host/sessions` migration slice with tests updated in the same branch. If the full mutation conversion proves too broad during implementation, the fallback is to keep the same query key architecture and split editor mutations into a second plan; that fallback requires user approval because this design intentionally targets a full conversion.
