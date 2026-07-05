# ReadMates Host Server-State Boundary Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining host members/invitations server-state boundary exceptions so route/data/query layers own TanStack Query and UI components stay props/callback driven.

**Architecture:** Keep the existing host feature shape, but move shared action contracts into `features/host/model`, move QueryClient-backed refresh/invalidation into route data factories, and leave host UI components responsible only for local presentation state. The browser route URLs, server API contracts, BFF/auth boundary, and DB schema stay unchanged.

**Tech Stack:** React 19, React Router 7, TanStack Query v5, Vite, Vitest, TypeScript, existing ReadMates route-first frontend architecture.

## Global Constraints

- Do not add new host members/invitations product features.
- Do not change server API response contract, request contract, error code, auth/authorization behavior, DB schema, Flyway migrations, BFF, OAuth, trusted headers, session cookie, Cloudflare Pages Functions behavior, deploy workflows, or route URL structure.
- Keep host UI files free of direct `@tanstack/react-query`, host query key, and invalidation helper imports.
- Keep host query modules free of imports from `features/host/route/*`.
- Remove the three known legacy boundary exceptions instead of replacing them with new exceptions.
- Keep the ownership model obvious to new developers and AI agents: `ui` owns presentation state, `route/data` owns loader/action/refresh, `queries` owns query keys/cache policy, and `model` owns neutral shared contracts.
- Preserve existing Korean user-facing copy unless a message would become false after ownership moves.
- Use the repo package manager policy from root `package.json`: `pnpm@10.33.0`.

---

## File Map

- Create: `front/features/host/model/host-member-actions.ts`
  - New neutral contract owner for host member action path/action/action-bundle types.
- Create: `front/features/host/model/host-invitation-actions.ts`
  - Neutral contract owner for host invitation action bundle type.
- Modify: `front/features/host/route/host-members-actions.ts`
  - Compatibility re-export from the neutral model contract.
- Modify: `front/features/host/route/host-invitations-actions.ts`
  - Compatibility re-export from the neutral model contract.
- Modify: `front/features/host/ui/members/types.ts`
  - Import/re-export member action path/action types from the neutral model contract.
- Modify: `front/features/host/queries/host-members-queries.ts`
  - Import member action types from `model`, not `route`.
- Modify: `front/features/host/route/host-members-data.ts`
  - Export `createHostMembersActions(queryClient)` and keep loader query seeding.
- Modify: `front/features/host/route/host-invitations-data.ts`
  - Export `createHostInvitationsActions(queryClient)` and keep loader query seeding.
- Modify: `front/features/host/route/host-members-route.tsx`
  - Build route-owned actions from the route QueryClient.
- Modify: `front/features/host/route/host-invitations-route.tsx`
  - Build route-owned actions from the route QueryClient.
- Modify: `front/features/host/index.ts`
  - Re-export route-owned action factories instead of removed action constants.
- Modify: `front/features/host/ui/host-members.tsx`
  - Remove direct TanStack Query/query imports and call action-owned refresh.
- Modify: `front/features/host/ui/host-invitations.tsx`
  - Remove direct TanStack Query/query imports and call action-owned first-page refresh.
- Modify: `front/tests/unit/frontend-boundaries.test.ts`
  - Remove the three host members/invitations legacy exceptions.
- Modify: `front/tests/unit/host-members.test.tsx`
  - Update wrappers and assertions for action-owned refresh.
- Modify: `front/tests/unit/host-invitations.test.tsx`
  - Update wrappers and assertions for action-owned refresh.
- Modify: `docs/development/server-state-migration.md`
  - Record that host members/invitations boundary debt is closed.

---

### Task 1: Move Host Member Action Contracts Out Of Route

**Files:**
- Create: `front/features/host/model/host-member-actions.ts`
- Modify: `front/features/host/route/host-members-actions.ts`
- Modify: `front/features/host/ui/members/types.ts`
- Modify: `front/features/host/queries/host-members-queries.ts`
- Modify: `front/tests/unit/frontend-boundaries.test.ts`

**Interfaces:**
- Consumes: existing `HostMemberProfileResponse`, `HostMemberListPage`, `MemberLifecycleRequest`, `MemberLifecycleResponse`, `ViewerMember`, and `PageRequest` types.
- Produces:
  - `HostMemberLifecyclePath`
  - `HostViewerAction`
  - `HostMembersActions`
  - `HostMembersActions.refreshMembers(): Promise<void>`

- [ ] **Step 1: Remove only the host-members query-to-route legacy exception**

In `front/tests/unit/frontend-boundaries.test.ts`, delete this object from `legacyBoundaryExceptions`:

```ts
  {
    sourcePath: "features/host/queries/host-members-queries.ts",
    importPath: "features/host/route/host-members-actions",
    ruleId: "feature-queries",
    reason: "Host member mutation queries still reuse route-owned action payload types from the pre-queries split.",
    removeWhen: "Move host member action payload contracts into model or query-local contracts.",
  },
```

- [ ] **Step 2: Run the boundary test to verify the contract issue is exposed**

Run:

```bash
pnpm --dir front test -- frontend-boundaries
```

Expected: FAIL with a violation mentioning `front/features/host/queries/host-members-queries.ts` importing `features/host/route/host-members-actions`.

- [ ] **Step 3: Create the neutral host member action contract**

Create `front/features/host/model/host-member-actions.ts`:

```ts
import type {
  HostMemberProfileResponse,
  HostMemberListPage,
  MemberLifecycleRequest,
  MemberLifecycleResponse,
  ViewerMember,
} from "@/features/host/api/host-contracts";
import type { PageRequest } from "@/shared/model/paging";

export type HostMemberLifecyclePath =
  "/suspend" | "/deactivate" | "/restore" | "/current-session/add" | "/current-session/remove";
export type HostViewerAction = "activate" | "deactivate-viewer";

export type JsonResponse<T> = Response & { json(): Promise<T> };

export type HostMembersActions = {
  loadMembers: (page?: PageRequest) => Promise<HostMemberListPage>;
  refreshMembers: () => Promise<void>;
  submitLifecycle: (
    membershipId: string,
    path: HostMemberLifecyclePath,
    body?: MemberLifecycleRequest,
  ) => Promise<JsonResponse<MemberLifecycleResponse>>;
  submitProfile: (membershipId: string, displayName: string) => Promise<JsonResponse<HostMemberProfileResponse>>;
  submitViewerAction: (membershipId: string, action: HostViewerAction) => Promise<ViewerMember>;
};
```

- [ ] **Step 4: Re-export the contract from the existing route path**

Replace all content of `front/features/host/route/host-members-actions.ts` with:

```ts
export type {
  HostMemberLifecyclePath,
  HostMembersActions,
  HostViewerAction,
  JsonResponse,
} from "@/features/host/model/host-member-actions";
```

- [ ] **Step 5: Update UI member type exports to consume the model contract**

In `front/features/host/ui/members/types.ts`, replace the existing `HostMemberLifecyclePath` and `HostViewerAction` type definitions with this import/export pair:

```ts
import type { ComponentType, ReactNode } from "react";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import type {
  HostMemberLifecyclePath as ModelHostMemberLifecyclePath,
  HostViewerAction as ModelHostViewerAction,
} from "@/features/host/model/host-member-actions";

export type HostMembersLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};
export type HostMembersLinkComponent = ComponentType<HostMembersLinkProps>;

export type HostMemberLifecyclePath = ModelHostMemberLifecyclePath;
export type HostViewerAction = ModelHostViewerAction;
export type MemberTab = "active" | "viewer" | "suspended" | "inactive" | "invitations";
export type LifecycleDialog = null | { action: "suspend" | "deactivate"; member: HostMemberListItem };
export type ProfileDialog = null | { member: HostMemberListItem };
```

- [ ] **Step 6: Update host member query imports**

In `front/features/host/queries/host-members-queries.ts`, replace:

```ts
import type {
  HostMemberLifecyclePath,
  HostViewerAction,
} from "@/features/host/route/host-members-actions";
```

with:

```ts
import type {
  HostMemberLifecyclePath,
  HostViewerAction,
} from "@/features/host/model/host-member-actions";
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --dir front test -- frontend-boundaries host-members
```

Expected: PASS. The two UI-to-query legacy exceptions still exist and are still consumed.

- [ ] **Step 8: Commit**

```bash
git add front/features/host/model/host-member-actions.ts \
  front/features/host/route/host-members-actions.ts \
  front/features/host/ui/members/types.ts \
  front/features/host/queries/host-members-queries.ts \
  front/tests/unit/frontend-boundaries.test.ts
git commit -m "refactor(front): move host member action contracts"
```

---

### Task 2: Move Host Invitation Query Ownership Out Of UI

**Files:**
- Create: `front/features/host/model/host-invitation-actions.ts`
- Modify: `front/features/host/route/host-invitations-actions.ts`
- Modify: `front/features/host/route/host-invitations-data.ts`
- Modify: `front/features/host/route/host-invitations-route.tsx`
- Modify: `front/features/host/index.ts`
- Modify: `front/features/host/ui/host-invitations.tsx`
- Modify: `front/tests/unit/host-invitations.test.tsx`
- Modify: `front/tests/unit/frontend-boundaries.test.ts`

**Interfaces:**
- Consumes:
  - `hostInvitationListQuery(page?: PageRequest)`
  - `invalidateHostInvitations(client: QueryClient)`
  - `parseHostInvitationListResponse(response: Response)`
  - `parseHostInvitationResponse(response: Response)`
- Produces:
  - `createHostInvitationsActions(client: QueryClient): HostInvitationsActions`
  - `HostInvitationsActions.refreshInvitations(page?: PageRequest): Promise<HostInvitationListPage>`

- [ ] **Step 1: Remove the host-invitations UI legacy exception**

In `front/tests/unit/frontend-boundaries.test.ts`, delete this object from `legacyBoundaryExceptions`:

```ts
  {
    sourcePath: "features/host/ui/host-invitations.tsx",
    importPath: "features/host/queries/host-invitation-queries",
    ruleId: "feature-ui",
    reason: "Host invitations UI still owns query invalidation during the server-state migration.",
    removeWhen: "Move host invitation query ownership to the route and pass props/callbacks into UI.",
  },
```

- [ ] **Step 2: Run the boundary test to verify the UI dependency is exposed**

Run:

```bash
pnpm --dir front test -- frontend-boundaries
```

Expected: FAIL with a violation mentioning `front/features/host/ui/host-invitations.tsx` importing `features/host/queries/host-invitation-queries`.

- [ ] **Step 3: Create the neutral host invitation action contract**

Create `front/features/host/model/host-invitation-actions.ts`:

```ts
import type {
  CreateHostInvitationRequest,
  HostInvitationListPage,
  HostInvitationResponse,
} from "@/features/host/api/host-contracts";
import type { PageRequest } from "@/shared/model/paging";

export type HostInvitationsActions = {
  listInvitations: (page?: PageRequest) => Promise<Response>;
  refreshInvitations: (page?: PageRequest) => Promise<HostInvitationListPage>;
  createInvitation: (request: CreateHostInvitationRequest) => Promise<Response>;
  revokeInvitation: (invitationId: string) => Promise<Response>;
  parseInvitation: (response: Response) => Promise<HostInvitationResponse>;
  parseInvitationList: (response: Response) => Promise<HostInvitationListPage>;
};
```

- [ ] **Step 4: Re-export the contract from the existing route path**

Replace all content of `front/features/host/route/host-invitations-actions.ts` with:

```ts
export type { HostInvitationsActions } from "@/features/host/model/host-invitation-actions";
```

- [ ] **Step 5: Add QueryClient-backed invitation action factory**

In `front/features/host/route/host-invitations-data.ts`, change the imports to include `QueryClient`, `HostInvitationsActions`, and `invalidateHostInvitations`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  createHostInvitation,
  fetchHostInvitations,
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeHostInvitation,
} from "@/features/host/api/host-api";
import type { HostInvitationsActions } from "@/features/host/model/host-invitation-actions";
import { hostInvitationListQuery, invalidateHostInvitations } from "@/features/host/queries/host-invitation-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";
```

Replace the existing `hostInvitationsActions` export with this factory:

```ts
export function createHostInvitationsActions(client: QueryClient): HostInvitationsActions {
  const refreshInvitations = async (page: Parameters<HostInvitationsActions["refreshInvitations"]>[0]) => {
    const nextPage = await client.fetchQuery(hostInvitationListQuery(page));
    await invalidateHostInvitations(client);
    return nextPage;
  };

  return {
    listInvitations: (page) => listHostInvitationsResponse(undefined, page),
    refreshInvitations,
    createInvitation: createHostInvitation,
    revokeInvitation: revokeHostInvitation,
    parseInvitation: parseHostInvitationResponse,
    parseInvitationList: parseHostInvitationListResponse,
  };
}
```

- [ ] **Step 6: Build route-owned invitation actions in the route component**

Replace `front/features/host/route/host-invitations-route.tsx` with:

```tsx
import { useMemo } from "react";
import { useLoaderData } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { HostInvitationListPage } from "@/features/host/api/host-contracts";
import HostInvitations from "@/features/host/ui/host-invitations";
import { createHostInvitationsActions } from "./host-invitations-data";

export function HostInvitationsRoute() {
  const invitations = useLoaderData() as HostInvitationListPage;
  const queryClient = useQueryClient();
  const actions = useMemo(() => createHostInvitationsActions(queryClient), [queryClient]);

  return <HostInvitations initialInvitations={invitations} actions={actions} />;
}
```

- [ ] **Step 7: Remove TanStack Query from HostInvitations UI**

In `front/features/host/index.ts`, replace:

```ts
export {
  hostInvitationsActions,
  hostInvitationsLoaderFactory,
} from "@/features/host/route/host-invitations-data";
```

with:

```ts
export {
  createHostInvitationsActions,
  hostInvitationsLoaderFactory,
} from "@/features/host/route/host-invitations-data";
```

In `front/features/host/ui/host-invitations.tsx`, remove this import:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

Remove this import:

```ts
import { hostInvitationListQuery, invalidateHostInvitations } from "@/features/host/queries/host-invitation-queries";
```

Add this import:

```ts
import type { HostInvitationsActions } from "@/features/host/model/host-invitation-actions";
```

Delete the local `HostInvitationsActions` type block that currently declares `listInvitations`, `createInvitation`, `revokeInvitation`, `parseInvitation`, and `parseInvitationList`.

Replace the current query setup block:

```ts
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    ...hostInvitationListQuery({ limit: 50 }),
    queryFn: async () => {
      const response = await actions.listInvitations({ limit: 50 });
      if (!response.ok) {
        throw new Error("Failed to load invitation list");
      }
      return normalizeInvitationPage(await actions.parseInvitationList(response));
    },
    initialData: initialPage,
  });
  const queryItems = listQuery.data?.items ?? [];
```

with:

```ts
  const [basePageState, setBasePageState] = useState<{ source: HostInvitationListItem[]; page: HostInvitationListPage }>(
    () => ({ source: initialPage.items, page: initialPage }),
  );
  let basePage = basePageState.source === initialPage.items ? basePageState.page : initialPage;
  if (basePageState.source !== initialPage.items) {
    const nextBasePageState = { source: initialPage.items, page: initialPage };
    setBasePageState(nextBasePageState);
    basePage = nextBasePageState.page;
  }
  const queryItems = basePage.items;
```

Replace `resetPagination` with:

```ts
  const resetPagination = (page?: HostInvitationListPage | null) => {
    const nextPage = page ?? basePage;
    setBasePageState({ source: nextPage.items, page: nextPage });
    setAppendedInvitations([]);
    setNextCursor(nextPage.nextCursor);
  };
```

Replace the `createMutation` and `revokeMutation` blocks with helper functions:

```ts
  const createInvitation = async (request: CreateHostInvitationRequest) => {
    const response = await actions.createInvitation(request);
    if (!response.ok) {
      const error = new Error("create-failed") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    const created = await actions.parseInvitation(response);
    const refreshed = await actions.refreshInvitations({ limit: 50 });
    return { created, refreshed };
  };

  const revokeInvitation = async (invitationId: string) => {
    const response = await actions.revokeInvitation(invitationId);
    if (!response.ok) {
      throw new Error("revoke-failed");
    }
    const revoked = await actions.parseInvitation(response);
    const refreshed = await actions.refreshInvitations({ limit: 50 });
    return { revoked, refreshed };
  };
```

In `submit`, replace:

```ts
      const created = await createMutation.mutateAsync({
        email: trimmedEmail,
        name: trimmedName,
        applyToCurrentSession,
      });
      if (requestId === lastCreatedRequestRef.current) {
        setLastCreated(created);
        resetPagination(listQuery.data);
        setName("");
        setEmail("");
        setNameTouched(false);
      }
```

with:

```ts
      const { created, refreshed } = await createInvitation({
        email: trimmedEmail,
        name: trimmedName,
        applyToCurrentSession,
      });
      if (requestId === lastCreatedRequestRef.current) {
        setLastCreated(created);
        resetPagination(refreshed);
        setName("");
        setEmail("");
        setNameTouched(false);
      }
```

In `revoke`, replace:

```ts
      await revokeMutation.mutateAsync(invitation.invitationId);
      setLastCreated((current) => (current?.invitationId === invitation.invitationId ? null : current));
      resetPagination(listQuery.data);
```

with:

```ts
      const { refreshed } = await revokeInvitation(invitation.invitationId);
      setLastCreated((current) => (current?.invitationId === invitation.invitationId ? null : current));
      resetPagination(refreshed);
```

In `reissue`, replace:

```ts
      const created = await createMutation.mutateAsync({
        email: invitation.email,
        name: invitation.name,
        applyToCurrentSession: invitation.applyToCurrentSession,
      });
      if (requestId === lastCreatedRequestRef.current) {
        setLastCreated(created);
        resetPagination(listQuery.data);
      }
```

with:

```ts
      const { created, refreshed } = await createInvitation({
        email: invitation.email,
        name: invitation.name,
        applyToCurrentSession: invitation.applyToCurrentSession,
      });
      if (requestId === lastCreatedRequestRef.current) {
        setLastCreated(created);
        resetPagination(refreshed);
      }
```

- [ ] **Step 8: Update host invitation tests**

In `front/tests/unit/host-invitations.test.tsx`, replace:

```ts
import { hostInvitationsActions } from "@/features/host";
```

with:

```ts
import { createHostInvitationsActions } from "@/features/host";
```

Remove `QueryClient` and `QueryClientProvider` imports. Keep `HostInvitationsForTest` as a plain wrapper:

```tsx
function HostInvitationsForTest({
  actions,
  ...props
}: Omit<HostInvitationsProps, "actions"> & { actions?: HostInvitationsActions }) {
  return <HostInvitations {...props} actions={actions ?? hostInvitationsTestActions} />;
}
```

Add `refreshInvitations` to `hostInvitationsTestActions`:

```ts
  refreshInvitations: async (page) => {
    const response = await hostInvitationsTestActions.listInvitations(page);
    return hostInvitationsTestActions.parseInvitationList(response);
  },
```

Replace the test named `"loads invitation list via useQuery (override queryFn)"` with:

```tsx
  it("renders the loader-provided invitation page without a Query provider", () => {
    render(<HostInvitationsForTest initialInvitations={{ items: invitations, nextCursor: null }} />);

    expect(screen.getByText("대기 멤버")).toBeInTheDocument();
    expect(screen.getByText("수락 멤버")).toBeInTheDocument();
  });
```

Replace the test named `"invalidates list after successful revoke"` with:

```tsx
  it("refreshes the first invitation page after successful revoke", async () => {
    const pendingInvitation: HostInvitationListItem = {
      invitationId: "invite-revoke-1",
      email: "revoke-target@example.com",
      name: "취소 대상",
      role: "MEMBER",
      status: "PENDING",
      effectiveStatus: "PENDING",
      expiresAt: "2026-05-20T12:00:00Z",
      acceptedAt: null,
      createdAt: "2026-04-20T12:00:00Z",
      canRevoke: true,
      canReissue: true,
      applyToCurrentSession: true,
    };
    const refreshedPage = { items: [], nextCursor: null } satisfies HostInvitationListPage;
    const revokeInvitation = vi.fn(async () => new Response(JSON.stringify({ ...pendingInvitation, status: "REVOKED", effectiveStatus: "REVOKED" }), { status: 200 }));
    const refreshInvitations = vi.fn(async () => refreshedPage);
    const actions = {
      ...hostInvitationsTestActions,
      revokeInvitation,
      refreshInvitations,
    } satisfies HostInvitationsActions;

    render(<HostInvitationsForTest initialInvitations={{ items: [pendingInvitation], nextCursor: null }} actions={actions} />);

    await userEvent.click(screen.getByRole("button", { name: "revoke-target@example.com 초대 취소" }));

    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledTimes(1));
    expect(refreshInvitations).toHaveBeenCalledWith({ limit: 50 });
    await waitFor(() => expect(screen.queryByText("취소 대상")).not.toBeInTheDocument());
  });
```

Update any custom `actions` object in this file by adding:

```ts
refreshInvitations: vi.fn(async () => ({ items: [], nextCursor: null })),
```

Replace the body of the test named `"keeps load-more pagination on the route action URL"` with:

```tsx
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null })));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = createTestQueryWrapper();

    await createHostInvitationsActions(client).listInvitations({ limit: 50, cursor: "cursor-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/invitations?limit=50&cursor=cursor-1",
      expect.objectContaining({ cache: "no-store" }),
    );
```

- [ ] **Step 9: Run focused invitation checks**

Run:

```bash
pnpm --dir front test -- host-invitations frontend-boundaries
```

Expected: PASS. Only the host members UI legacy exception remains.

- [ ] **Step 10: Commit**

```bash
git add front/features/host/model/host-invitation-actions.ts \
  front/features/host/route/host-invitations-actions.ts \
  front/features/host/route/host-invitations-data.ts \
  front/features/host/route/host-invitations-route.tsx \
  front/features/host/index.ts \
  front/features/host/ui/host-invitations.tsx \
  front/tests/unit/host-invitations.test.tsx \
  front/tests/unit/frontend-boundaries.test.ts
git commit -m "refactor(front): move host invitation query ownership"
```

---

### Task 3: Move Host Members Query Ownership Out Of UI

**Files:**
- Modify: `front/features/host/route/host-members-data.ts`
- Modify: `front/features/host/route/host-members-route.tsx`
- Modify: `front/features/host/index.ts`
- Modify: `front/features/host/ui/host-members.tsx`
- Modify: `front/tests/unit/host-members.test.tsx`
- Modify: `front/tests/unit/frontend-boundaries.test.ts`

**Interfaces:**
- Consumes:
  - `hostMemberListQuery(page?: PageRequest, context?: ReadmatesApiContext)`
  - `invalidateHostMembers(client: QueryClient)`
  - existing host member API calls
- Produces:
  - `createHostMembersActions(client: QueryClient): HostMembersActions`
  - `HostMembersActions.refreshMembers(): Promise<void>`

- [ ] **Step 1: Remove the host-members UI legacy exception**

In `front/tests/unit/frontend-boundaries.test.ts`, delete this object from `legacyBoundaryExceptions`:

```ts
  {
    sourcePath: "features/host/ui/host-members.tsx",
    importPath: "features/host/queries/host-members-queries",
    ruleId: "feature-ui",
    reason: "Host members UI still owns query invalidation during the server-state migration.",
    removeWhen: "Move host member query ownership to the route and pass props/callbacks into UI.",
  },
```

- [ ] **Step 2: Run the boundary test to verify the UI dependency is exposed**

Run:

```bash
pnpm --dir front test -- frontend-boundaries
```

Expected: FAIL with a violation mentioning `front/features/host/ui/host-members.tsx` importing `features/host/queries/host-members-queries`.

- [ ] **Step 3: Add QueryClient-backed member action factory**

In `front/features/host/route/host-members-data.ts`, change imports to include `invalidateHostMembers` and the model contract:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  fetchHostMembers,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
} from "@/features/host/api/host-api";
import type { HostMemberListItem, HostMemberListPage } from "@/features/host/api/host-contracts";
import type { HostMembersActions } from "@/features/host/model/host-member-actions";
import { hostMemberListQuery, invalidateHostMembers } from "@/features/host/queries/host-members-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";
```

Replace the existing `hostMembersActions` export with:

```ts
export function createHostMembersActions(client: QueryClient): HostMembersActions {
  const refreshMembers = () => invalidateHostMembers(client);

  return {
    loadMembers: (page) => fetchHostMembers(undefined, page),
    refreshMembers,
    submitLifecycle: async (membershipId, path, body) => {
      const response = await submitHostMemberLifecycle(membershipId, path, body);
      if (response.ok) {
        await refreshMembers();
      }
      return response;
    },
    submitProfile: async (membershipId, displayName) => {
      const response = await submitHostMemberProfile(membershipId, displayName);
      if (response.ok) {
        await refreshMembers();
      }
      return response;
    },
    submitViewerAction: submitHostViewerAction,
  };
}
```

This intentionally leaves viewer-action refresh as an explicit UI call through `actions.refreshMembers()` so the current "처리는 완료됐지만 ..." warning remains possible when the action succeeds but refresh fails.

- [ ] **Step 4: Build route-owned member actions in the route component**

Replace `front/features/host/route/host-members-route.tsx` with:

```tsx
import { useMemo } from "react";
import { useLoaderData } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { HostMemberListPage } from "@/features/host/api/host-contracts";
import HostMembers, { type HostMembersLinkComponent } from "@/features/host/ui/host-members";
import { createHostMembersActions } from "./host-members-data";

export function HostMembersRoute({ LinkComponent }: { LinkComponent?: HostMembersLinkComponent }) {
  const members = useLoaderData() as HostMemberListPage;
  const queryClient = useQueryClient();
  const actions = useMemo(() => createHostMembersActions(queryClient), [queryClient]);

  return (
    <main className="rm-host-members-page">
      <section className="page-header-compact">
        <div className="container">
          <div className="eyebrow">운영 · 멤버 관리</div>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            멤버 관리
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            멤버 상태와 이번 세션 참여 여부를 함께 확인합니다.
          </p>
        </div>
      </section>
      <section className="container rm-host-members-page__body">
        <HostMembers initialMembers={members} actions={actions} LinkComponent={LinkComponent} />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Remove TanStack Query from HostMembers UI**

In `front/features/host/index.ts`, replace:

```ts
export {
  hostMembersActions,
  hostMembersLoaderFactory,
} from "@/features/host/route/host-members-data";
```

with:

```ts
export {
  createHostMembersActions,
  hostMembersLoaderFactory,
} from "@/features/host/route/host-members-data";
```

In `front/features/host/ui/host-members.tsx`, remove this import:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
```

Remove this import:

```ts
import {
  hostMemberKeys,
  hostMemberListQuery,
} from "@/features/host/queries/host-members-queries";
```

Add this import:

```ts
import type { HostMembersActions } from "@/features/host/model/host-member-actions";
```

Delete the local `JsonResponse`, `HostMembersActions`, and `ViewerAction` type definitions. Keep `HostViewerAction` from `./members/types` and use it directly.

Replace the query setup:

```ts
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    ...hostMemberListQuery({ limit: 50 }),
    queryFn: async () => normalizeMemberPage(await actions.loadMembers({ limit: 50 })),
    initialData: propPage,
  });
  const queryPage = listQuery.data ?? propPage;
```

with:

```ts
  const queryPage = propPage;
```

Replace `refreshMembers`:

```ts
  const refreshMembers = async () => {
    await queryClient.invalidateQueries(
      { queryKey: hostMemberKeys.all },
      { throwOnError: true },
    );
  };
```

with:

```ts
  const refreshMembers = () => actions.refreshMembers();
```

Replace:

```ts
type ViewerAction = HostViewerAction;
```

with direct use of `HostViewerAction` in `submitViewerAction`:

```ts
  const submitViewerAction = async (member: HostMemberListItem, action: HostViewerAction) => {
```

- [ ] **Step 6: Update host member tests**

In `front/tests/unit/host-members.test.tsx`, replace:

```ts
import { hostMembersActions, hostMembersLoaderFactory } from "@/features/host";
```

with:

```ts
import { createHostMembersActions, hostMembersLoaderFactory } from "@/features/host";
```

In `front/tests/unit/host-members.test.tsx`, add `refreshMembers` to `noopHostMembersActions`:

```ts
const noopHostMembersActions = {
  loadMembers: vi.fn(async () => []),
  refreshMembers: vi.fn(async () => undefined),
  submitLifecycle: vi.fn(async () => lifecycleResponse(members[0])),
  submitViewerAction: vi.fn(async () => members[0]),
  submitProfile: vi.fn(async () => memberListItemResponse(members[0])),
} satisfies HostMembersActions;
```

Replace `HostMembersForTest` with a plain direct-render helper. Keep `QueryClientProvider` inside `renderHostMembersPage`, because the route/page tests still exercise router loader cache seeding.

```tsx
function HostMembersForTest({
  actions,
  initialMembers,
  ...props
}: Omit<HostMembersProps, "actions"> & { actions?: HostMembersActions }) {
  return (
    <HostMembers
      {...props}
      initialMembers={initialMembers}
      actions={actions ?? noopHostMembersActions}
    />
  );
}
```

For any custom `actions` object in this file, add:

```ts
refreshMembers: vi.fn(async () => undefined),
```

Add this focused test near the viewer action tests:

```tsx
  it("shows a refresh warning when viewer activation succeeds but action-owned refresh fails", async () => {
    const activateViewer = {
      ...members[1],
      canDeactivate: true,
    };
    const actions = {
      ...noopHostMembersActions,
      submitViewerAction: vi.fn(async () => activateViewer),
      refreshMembers: vi.fn(async () => {
        throw new Error("refresh failed");
      }),
    } satisfies HostMembersActions;
    render(<HostMembersForTest initialMembers={[activateViewer]} actions={actions} />);

    await userEvent.click(screen.getByRole("tab", { name: "둘러보기 멤버" }));
    await userEvent.click(screen.getByRole("button", { name: /정식 멤버 전환/ }));

    expect(actions.submitViewerAction).toHaveBeenCalledWith(activateViewer.membershipId, "activate");
    expect(actions.refreshMembers).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다.",
    );
  });
```

Replace the body of the test named `"keeps load-more pagination on the route action URL"` with:

```tsx
    const fetchMock = vi.fn().mockResolvedValue(memberListResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const client = createTestQueryClient();

    await createHostMembersActions(client).loadMembers({ limit: 50, cursor: "cursor-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/members?limit=50&cursor=cursor-1",
      expect.objectContaining({ cache: "no-store" }),
    );
```

- [ ] **Step 7: Run focused member checks**

Run:

```bash
pnpm --dir front test -- host-members frontend-boundaries
```

Expected: PASS. `legacyBoundaryExceptions` is now empty unless unrelated exceptions existed before this work.

- [ ] **Step 8: Commit**

```bash
git add front/features/host/route/host-members-data.ts \
  front/features/host/route/host-members-route.tsx \
  front/features/host/index.ts \
  front/features/host/ui/host-members.tsx \
  front/tests/unit/host-members.test.tsx \
  front/tests/unit/frontend-boundaries.test.ts
git commit -m "refactor(front): move host member query ownership"
```

---

### Task 4: Document Boundary Closure And Run Final Verification

**Files:**
- Modify: `docs/development/server-state-migration.md`
- Review: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: passing boundary/frontend checks from Tasks 1-3.
- Produces: docs stating host members/invitations server-state migration has no remaining boundary exceptions.

- [ ] **Step 1: Update server-state migration docs**

In `docs/development/server-state-migration.md`, update the `완료` section entries for `host/invitations` and `host/members` to include the boundary closure.

Use these bullets:

```md
- `host/invitations` — list query + create/revoke mutation + loader hand-off; UI no longer imports host query keys or invalidation helpers.
- `host/members` — list query + lifecycle/profile/viewer mutation refresh + loader hand-off; host member action contracts now live outside `route` so query modules do not import route-owned types.
```

If the current wording already has those bullets, replace the existing two bullets with the exact text above.

- [ ] **Step 2: Decide whether release-readiness docs need an entry**

Open `docs/development/release-readiness-review.md`.

Do not add a release-readiness entry if the implementation only changes frontend boundary ownership, unit tests, and server-state migration docs. Add an entry only if implementation changes user-visible host behavior, release-facing evidence, CI/deploy scripts, public-release tooling, or CHANGELOG content.

- [ ] **Step 3: Run the focused acceptance checks**

Run:

```bash
pnpm --dir front test -- frontend-boundaries host-members host-invitations
```

Expected: PASS.

- [ ] **Step 4: Run full frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 5: Run docs whitespace and safety checks**

Run:

```bash
git diff --check -- docs/development/server-state-migration.md docs/development/release-readiness-review.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" docs/development/server-state-migration.md docs/development/release-readiness-review.md
```

Expected: `git diff --check` exits 0. The `rg` command exits 1 with no matches unless `release-readiness-review.md` already contains unrelated historical text that matches the pattern; if that happens, confirm the new diff did not introduce the match.

- [ ] **Step 6: Confirm no server/BFF/deploy surface changed**

Run:

```bash
git diff --name-only HEAD
```

Expected changed paths are limited to:

```text
docs/development/server-state-migration.md
docs/development/release-readiness-review.md
front/features/host/model/host-invitation-actions.ts
front/features/host/model/host-member-actions.ts
front/features/host/index.ts
front/features/host/queries/host-invitation-queries.ts
front/features/host/queries/host-members-queries.ts
front/features/host/route/host-invitations-actions.ts
front/features/host/route/host-invitations-data.ts
front/features/host/route/host-invitations-route.tsx
front/features/host/route/host-members-actions.ts
front/features/host/route/host-members-data.ts
front/features/host/route/host-members-route.tsx
front/features/host/ui/host-invitations.tsx
front/features/host/ui/host-members.tsx
front/features/host/ui/members/types.ts
front/tests/unit/frontend-boundaries.test.ts
front/tests/unit/host-invitations.test.tsx
front/tests/unit/host-members.test.tsx
```

If `docs/development/release-readiness-review.md` was not changed, it should not appear in the actual command output.

- [ ] **Step 7: Commit**

```bash
git add docs/development/server-state-migration.md docs/development/release-readiness-review.md
git commit -m "docs: record host server-state boundary cleanup"
```

If `docs/development/release-readiness-review.md` was not changed, use:

```bash
git add docs/development/server-state-migration.md
git commit -m "docs: record host server-state boundary cleanup"
```

---

## Final Acceptance

- `front/tests/unit/frontend-boundaries.test.ts` has no host members/invitations legacy exceptions.
- `front/features/host/ui/host-members.tsx` and `front/features/host/ui/host-invitations.tsx` do not import `@tanstack/react-query`.
- `front/features/host/ui/host-members.tsx` and `front/features/host/ui/host-invitations.tsx` do not import `features/host/queries/*`.
- `front/features/host/queries/host-members-queries.ts` does not import `features/host/route/*`.
- `pnpm --dir front test -- frontend-boundaries host-members host-invitations` passes.
- `pnpm --dir front lint` passes.
- `pnpm --dir front test` passes.
- `pnpm --dir front build` passes.
- `docs/development/server-state-migration.md` describes the closed host members/invitations boundary debt.
- A new worker can infer host members/invitations responsibility from file placement without reading exception notes: UI is presentation-only, route/data owns refresh, queries own cache policy, and neutral action contracts live in model.
- No server API, DB migration, BFF/auth, OAuth, deploy workflow, release image, or route URL change is present.

## Spec Coverage Self-Review

- Spec goal "remove three legacy boundary exceptions": Tasks 1, 2, and 3 remove one exception each, then Task 4 verifies the final state.
- Spec goal "UI does not import Query hooks, keys, invalidation": Tasks 2 and 3 remove those imports and add focused checks.
- Spec goal "queries do not import route": Task 1 moves member action contracts to `model`.
- Spec goal "route/data owns refresh": Tasks 2 and 3 add QueryClient-backed action factories.
- Spec goal "AI/new developer can predict responsibility boundaries": the global constraints and final acceptance explicitly require the UI/route-data/queries/model ownership split to be exception-free.
- Spec goal "pagination and user copy stay stable": Tasks 2 and 3 preserve local appended rows and existing safe messages.
- Spec goal "docs reflect actual state": Task 4 updates `server-state-migration.md`.
- Placeholder scan: no placeholder markers, deferred implementation phrases, or unspecified test command remains.
- Type consistency: `HostMembersActions.refreshMembers` and `HostInvitationsActions.refreshInvitations` are defined before later tasks consume them.
