# ReadMates Lighthouse Public Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the local Lighthouse diagnostic harness to improve ReadMates public route SEO metadata and public initial loading cost without changing server, auth, BFF, DB, or deploy behavior.

**Architecture:** Start with a fresh public Lighthouse baseline, then add tested public metadata builders and route-level head side effects. After metadata fixes, split public layout imports away from authenticated app layout imports only where the module graph shows public initial route cost is affected, then rerun the same Lighthouse public diagnostic and document the delta.

**Tech Stack:** React 19, React Router 7 lazy routes, Vite, TypeScript, TanStack Query, Vitest, Testing Library, Playwright-controlled local Lighthouse diagnostic.

## Global Constraints

- Do not make Lighthouse a CI gate in this iteration.
- Do not improve member, host, or admin route UI in this iteration.
- Do not hide route failures, auth failures, or data failures to raise scores.
- Do not add real member data, private domains, local absolute paths, deployment state, secrets, or token-shaped examples to docs or tests.
- Do not change OAuth, BFF proxy, server persistence, migrations, or production deployment settings.
- Do not commit `.tmp/lighthouse/` reports.
- Preserve the frontend dependency direction: `src/app -> src/pages -> features -> shared`.
- Use feature-owned public model/route/ui files for public route metadata.
- Keep canonical and robots behavior scoped to the existing public URL policy boundary.

---

## File Structure

- Create: `front/features/public/model/public-page-metadata.ts`
  - Owns deterministic public title and description builders.
  - Exports `PublicPageMetadata`, `DEFAULT_PUBLIC_PAGE_METADATA`, `buildPublicClubPageMetadata`, `buildPublicRecordsPageMetadata`, `buildPublicSessionPageMetadata`, and `PUBLIC_MISSING_SESSION_METADATA`.
- Create: `front/features/public/model/public-page-metadata.test.ts`
  - Node-project tests for metadata text, fallbacks, and truncation.
- Create: `front/features/public/ui/public-page-metadata-head.tsx`
  - Owns browser side effects for `document.title` and `meta[name="description"]`.
  - Does not manage canonical or robots nodes.
- Create: `front/features/public/ui/public-page-metadata-head.test.tsx`
  - jsdom tests for title/description insertion, update, and cleanup.
- Modify: `front/features/public/route/public-home-route.tsx`
  - Builds club metadata and renders `PublicPageMetadataHead`.
- Modify: `front/features/public/route/public-club-route.tsx`
  - Builds about-page metadata and renders `PublicPageMetadataHead`.
- Modify: `front/features/public/route/public-records-route.tsx`
  - Builds records-page metadata and renders `PublicPageMetadataHead`.
- Modify: `front/features/public/route/public-session-route.tsx`
  - Builds session or missing-session metadata and renders `PublicPageMetadataHead`.
- Modify: `front/src/app/layouts.tsx`
  - Keep existing `PublicUrlPolicyHead` usage for canonical and robots.
  - If public initial chunk analysis shows authenticated-only imports are bundled into public routes, split public layout exports into a smaller module and keep `layouts.tsx` as a compatibility re-export.
- Modify: `front/src/app/routes/public.tsx`
  - Import `PublicRouteLayout` from the smaller public layout module if Task 4 performs the split.
- Modify: `front/src/app/routes/member.tsx` and `front/src/app/routes/host.tsx`
  - Import `AppRouteLayout` from the app layout module if Task 4 performs the split.
- Modify: `front/tests/unit/public-navigation-auth.test.tsx` and `front/tests/unit/spa-layout.test.tsx`
  - Update imports only if Task 4 changes layout module paths.
- Modify: `CHANGELOG.md`
  - Add an Unreleased note after verified public SEO/performance behavior changes.
- Modify: `docs/development/release-readiness-review.md`
  - Add closeout evidence if the implementation is merged or release-risk reviewed.

---

### Task 1: Capture Public Lighthouse Baseline

**Files:**
- Read: `.tmp/lighthouse/<timestamp>/summary.md`
- Read: `.tmp/lighthouse/<timestamp>/findings.json`
- Do not modify tracked files.

**Interfaces:**
- Consumes: `pnpm --dir front lighthouse:diagnose -- --group public`
- Produces: A local baseline path recorded in the implementer's notes for post-change comparison.

- [ ] **Step 1: Confirm the working tree before diagnostics**

Run:

```bash
git status --short --branch
```

Expected: only known unrelated untracked files are present. Do not stage or delete `.tmp/lighthouse/` reports.

- [ ] **Step 2: Run the full public Lighthouse diagnostic**

Run:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

Expected: the command prints `Lighthouse diagnostic complete: <path>/summary.md`.

- [ ] **Step 3: Inspect the route matrix and repeated causes**

Run, replacing `<summary>` with the path printed by Step 2:

```bash
sed -n '1,220p' <summary>
```

Expected: `failed route count: 0`. If the count is not `0`, stop this task and fix the route-entry failure before interpreting scores.

- [ ] **Step 4: Extract raw failed audit IDs**

Run, replacing `<dir>` with the directory that contains `findings.json`:

```bash
node -e "const fs=require('node:fs'); const rows=JSON.parse(fs.readFileSync('<dir>/findings.json','utf8')); for (const r of rows) console.log(r.routeId, r.scores, r.findings.map((f)=>f.auditId+':'+f.bucket).join(','));"
```

Expected: public routes show raw audit IDs. Record the route IDs affected by `meta-description`, `document-title`, `canonical`, `crawlable-anchors`, `unused-javascript`, `total-byte-weight`, and console/link-text audits.

- [ ] **Step 5: Commit**

No commit for this task. The baseline artifacts are local evidence and must stay untracked.

---

### Task 2: Add Tested Public Metadata Builder

**Files:**
- Create: `front/features/public/model/public-page-metadata.ts`
- Create: `front/features/public/model/public-page-metadata.test.ts`

**Interfaces:**
- Consumes:
  - `PublicClubView`, `PublicSessionDetailView` from `front/features/public/model/public-display-model.ts`
  - `getPublicClubDisplay`, `getPublicRecordsDisplay`, `getPublicSessionDetailDisplay`
- Produces:
  - `type PublicPageMetadata = { title: string; description: string }`
  - `DEFAULT_PUBLIC_PAGE_METADATA: PublicPageMetadata`
  - `PUBLIC_MISSING_SESSION_METADATA: PublicPageMetadata`
  - `buildPublicClubPageMetadata(data: PublicClubView, page: "home" | "about"): PublicPageMetadata`
  - `buildPublicRecordsPageMetadata(data: PublicClubView): PublicPageMetadata`
  - `buildPublicSessionPageMetadata(session: PublicSessionDetailView): PublicPageMetadata`

- [ ] **Step 1: Write the failing metadata tests**

Create `front/features/public/model/public-page-metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_PAGE_METADATA,
  PUBLIC_MISSING_SESSION_METADATA,
  buildPublicClubPageMetadata,
  buildPublicRecordsPageMetadata,
  buildPublicSessionPageMetadata,
} from "./public-page-metadata";

const club = {
  clubName: "읽는사이",
  tagline: "작게 읽고 깊게 나누는 모임",
  about: "책을 읽고 서로의 관점을 기록하는 공개 소개입니다.",
  stats: { sessions: 7, books: 7, members: 12 },
  recentSessions: [],
};

const session = {
  sessionId: "s1",
  sessionNumber: 7,
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookImageUrl: null,
  date: "2026-06-18",
  summary: "함께 읽은 핵심 질문과 공개 가능한 하이라이트를 정리했습니다.",
  highlights: [],
  oneLiners: [],
};

describe("public page metadata", () => {
  it("keeps a stable default title and description", () => {
    expect(DEFAULT_PUBLIC_PAGE_METADATA).toEqual({
      title: "ReadMates",
      description: "ReadMates는 독서 모임의 공개 기록과 클럽 소개를 안전하게 보여주는 읽기 모임 서비스입니다.",
    });
  });

  it("builds club home metadata from visible club copy", () => {
    expect(buildPublicClubPageMetadata(club, "home")).toEqual({
      title: "읽는사이 | ReadMates",
      description: "작게 읽고 깊게 나누는 모임",
    });
  });

  it("builds about metadata from visible introduction copy", () => {
    expect(buildPublicClubPageMetadata(club, "about")).toEqual({
      title: "읽는사이 소개 | ReadMates",
      description: "책을 읽고 서로의 관점을 기록하는 공개 소개입니다.",
    });
  });

  it("builds records metadata with a public count label", () => {
    expect(buildPublicRecordsPageMetadata(club)).toEqual({
      title: "읽는사이 공개 기록 | ReadMates",
      description: "읽는사이에서 공개한 독서 모임 기록 총 7개를 모았습니다.",
    });
  });

  it("builds session metadata from visible session copy", () => {
    expect(buildPublicSessionPageMetadata(session)).toEqual({
      title: "팩트풀니스 | 읽는사이 공개 기록",
      description: "한스 로슬링 · 2026.06.18 · 함께 읽은 핵심 질문과 공개 가능한 하이라이트를 정리했습니다.",
    });
  });

  it("uses explicit missing-session metadata", () => {
    expect(PUBLIC_MISSING_SESSION_METADATA).toEqual({
      title: "공개 기록을 찾을 수 없습니다 | ReadMates",
      description: "요청한 공개 독서 모임 기록을 찾을 수 없습니다. 공개 기록 목록에서 다시 확인해 주세요.",
    });
  });
});
```

- [ ] **Step 2: Run the metadata test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run features/public/model/public-page-metadata.test.ts
```

Expected: FAIL because `./public-page-metadata` does not exist.

- [ ] **Step 3: Add the metadata implementation**

Create `front/features/public/model/public-page-metadata.ts`:

```ts
import {
  getPublicClubDisplay,
  getPublicRecordsDisplay,
  getPublicSessionDetailDisplay,
  type PublicClubView,
  type PublicSessionDetailView,
} from "@/features/public/model/public-display-model";

export type PublicPageMetadata = {
  title: string;
  description: string;
};

export const DEFAULT_PUBLIC_PAGE_METADATA: PublicPageMetadata = {
  title: "ReadMates",
  description: "ReadMates는 독서 모임의 공개 기록과 클럽 소개를 안전하게 보여주는 읽기 모임 서비스입니다.",
};

export const PUBLIC_MISSING_SESSION_METADATA: PublicPageMetadata = {
  title: "공개 기록을 찾을 수 없습니다 | ReadMates",
  description: "요청한 공개 독서 모임 기록을 찾을 수 없습니다. 공개 기록 목록에서 다시 확인해 주세요.",
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function trimDescription(value: string) {
  const text = compact(value);
  return text.length > 155 ? `${text.slice(0, 154).trimEnd()}…` : text;
}

export function buildPublicClubPageMetadata(
  data: PublicClubView,
  page: "home" | "about",
): PublicPageMetadata {
  const display = getPublicClubDisplay(data);

  if (page === "about") {
    return {
      title: `${display.clubName} 소개 | ReadMates`,
      description: trimDescription(display.about),
    };
  }

  return {
    title: `${display.clubName} | ReadMates`,
    description: trimDescription(display.tagline),
  };
}

export function buildPublicRecordsPageMetadata(data: PublicClubView): PublicPageMetadata {
  const display = getPublicRecordsDisplay(data);

  return {
    title: `${display.clubName} 공개 기록 | ReadMates`,
    description: trimDescription(`${display.clubName}에서 공개한 독서 모임 기록 ${display.countLabel}를 모았습니다.`),
  };
}

export function buildPublicSessionPageMetadata(session: PublicSessionDetailView): PublicPageMetadata {
  const display = getPublicSessionDetailDisplay(session);

  return {
    title: `${display.bookTitle} | 읽는사이 공개 기록`,
    description: trimDescription(`${display.bookAuthor} · ${display.dateLabel} · ${display.summary}`),
  };
}
```

- [ ] **Step 4: Run the metadata test and verify it passes**

Run:

```bash
pnpm --dir front exec vitest run features/public/model/public-page-metadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add front/features/public/model/public-page-metadata.ts front/features/public/model/public-page-metadata.test.ts
git commit -m "feat(front): model public page metadata"
```

Expected: one commit containing only the metadata model and its tests.

---

### Task 3: Add Route-Level Metadata Head Side Effects

**Files:**
- Create: `front/features/public/ui/public-page-metadata-head.tsx`
- Create: `front/features/public/ui/public-page-metadata-head.test.tsx`

**Interfaces:**
- Consumes:
  - `PublicPageMetadata`
  - `DEFAULT_PUBLIC_PAGE_METADATA`
- Produces:
  - `PublicPageMetadataHead({ metadata }: { metadata?: PublicPageMetadata | null }): null`

- [ ] **Step 1: Write the failing head side-effect tests**

Create `front/features/public/ui/public-page-metadata-head.test.tsx`:

```tsx
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublicPageMetadataHead } from "./public-page-metadata-head";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("[data-readmates-public-page-head]").forEach((node) => node.remove());
  document.title = "";
});

describe("PublicPageMetadataHead", () => {
  it("writes title and meta description", () => {
    render(
      <PublicPageMetadataHead
        metadata={{
          title: "읽는사이 | ReadMates",
          description: "작게 읽고 깊게 나누는 모임",
        }}
      />,
    );

    expect(document.title).toBe("읽는사이 | ReadMates");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "작게 읽고 깊게 나누는 모임",
    );
  });

  it("updates the managed description without duplicating meta nodes", () => {
    const { rerender } = render(
      <PublicPageMetadataHead
        metadata={{
          title: "처음 | ReadMates",
          description: "처음 설명",
        }}
      />,
    );

    rerender(
      <PublicPageMetadataHead
        metadata={{
          title: "다음 | ReadMates",
          description: "다음 설명",
        }}
      />,
    );

    expect(document.title).toBe("다음 | ReadMates");
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("다음 설명");
  });

  it("falls back to default metadata when route data is null", () => {
    render(<PublicPageMetadataHead metadata={null} />);

    expect(document.title).toBe("ReadMates");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "ReadMates는 독서 모임의 공개 기록과 클럽 소개를 안전하게 보여주는 읽기 모임 서비스입니다.",
    );
  });
});
```

- [ ] **Step 2: Run the head test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run features/public/ui/public-page-metadata-head.test.tsx
```

Expected: FAIL because `./public-page-metadata-head` does not exist.

- [ ] **Step 3: Add the head component**

Create `front/features/public/ui/public-page-metadata-head.tsx`:

```tsx
import { useEffect } from "react";
import {
  DEFAULT_PUBLIC_PAGE_METADATA,
  type PublicPageMetadata,
} from "@/features/public/model/public-page-metadata";

type PublicPageMetadataHeadProps = {
  metadata?: PublicPageMetadata | null;
};

function upsertDescription(content: string) {
  const existing = document.head.querySelector<HTMLMetaElement>('meta[name="description"][data-readmates-public-page-head]');
  const meta = existing ?? document.createElement("meta");
  meta.name = "description";
  meta.content = content;
  meta.dataset.readmatesPublicPageHead = "description";

  if (!existing) {
    document.head.append(meta);
  }
}

export function PublicPageMetadataHead({ metadata }: PublicPageMetadataHeadProps) {
  useEffect(() => {
    const next = metadata ?? DEFAULT_PUBLIC_PAGE_METADATA;

    document.title = next.title;
    upsertDescription(next.description);
  }, [metadata]);

  return null;
}
```

- [ ] **Step 4: Run the head test and verify it passes**

Run:

```bash
pnpm --dir front exec vitest run features/public/ui/public-page-metadata-head.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add front/features/public/ui/public-page-metadata-head.tsx front/features/public/ui/public-page-metadata-head.test.tsx
git commit -m "feat(front): manage public page metadata head"
```

Expected: one commit containing only the head component and its tests.

---

### Task 4: Wire Public Routes to Metadata

**Files:**
- Modify: `front/features/public/route/public-home-route.tsx`
- Modify: `front/features/public/route/public-club-route.tsx`
- Modify: `front/features/public/route/public-records-route.tsx`
- Modify: `front/features/public/route/public-session-route.tsx`

**Interfaces:**
- Consumes:
  - `PublicPageMetadataHead`
  - `buildPublicClubPageMetadata`
  - `buildPublicRecordsPageMetadata`
  - `buildPublicSessionPageMetadata`
  - `PUBLIC_MISSING_SESSION_METADATA`
- Produces:
  - Public route render trees that include metadata head side effects derived from the same data as visible UI.

- [ ] **Step 1: Add route wiring for home**

Modify `front/features/public/route/public-home-route.tsx` to this shape:

```tsx
import { useLoaderData } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { buildPublicClubPageMetadata } from "@/features/public/model/public-page-metadata";
import { publicClubQuery } from "@/features/public/queries/public-queries";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import { PublicPageMetadataHead } from "@/features/public/ui/public-page-metadata-head";
import PublicHome from "@/features/public/ui/public-home";

export function PublicHomeRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));

  if (!clubQuery.data) {
    return <PublicPageMetadataHead />;
  }

  return (
    <>
      <PublicPageMetadataHead metadata={buildPublicClubPageMetadata(clubQuery.data, "home")} />
      <PublicHome data={clubQuery.data} publicBasePath={data.publicBasePath} />
    </>
  );
}
```

- [ ] **Step 2: Add route wiring for about**

Modify `front/features/public/route/public-club-route.tsx` to this shape:

```tsx
import { useLoaderData } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { buildPublicClubPageMetadata } from "@/features/public/model/public-page-metadata";
import { publicClubQuery } from "@/features/public/queries/public-queries";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import { PublicPageMetadataHead } from "@/features/public/ui/public-page-metadata-head";
import PublicClub from "@/features/public/ui/public-club";

export function PublicClubRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));

  if (!clubQuery.data) {
    return <PublicPageMetadataHead />;
  }

  return (
    <>
      <PublicPageMetadataHead metadata={buildPublicClubPageMetadata(clubQuery.data, "about")} />
      <PublicClub data={clubQuery.data} publicBasePath={data.publicBasePath} />
    </>
  );
}
```

- [ ] **Step 3: Add route wiring for records**

Modify `front/features/public/route/public-records-route.tsx` to this shape:

```tsx
import { useLoaderData, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { buildPublicRecordsPageMetadata } from "@/features/public/model/public-page-metadata";
import { publicClubQuery } from "@/features/public/queries/public-queries";
import type { PublicClubRouteData } from "@/features/public/route/public-route-data";
import { PublicPageMetadataHead } from "@/features/public/ui/public-page-metadata-head";
import PublicRecordsPage from "@/features/public/ui/public-records-page";

export function PublicRecordsRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));
  const location = useLocation();

  if (!clubQuery.data) {
    return <PublicPageMetadataHead />;
  }

  return (
    <>
      <PublicPageMetadataHead metadata={buildPublicRecordsPageMetadata(clubQuery.data)} />
      <PublicRecordsPage
        data={clubQuery.data}
        publicBasePath={data.publicBasePath}
        routePathname={location.pathname}
        routeSearch={location.search}
      />
    </>
  );
}
```

- [ ] **Step 4: Add route wiring for session and missing session**

Modify `front/features/public/route/public-session-route.tsx` to this shape:

```tsx
import { useLoaderData, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PUBLIC_MISSING_SESSION_METADATA,
  buildPublicSessionPageMetadata,
} from "@/features/public/model/public-page-metadata";
import { publicSessionQuery } from "@/features/public/queries/public-queries";
import type { PublicSessionRouteData } from "@/features/public/route/public-route-data";
import {
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
} from "@/features/public/ui/public-route-continuity";
import { PublicMissingSessionPage } from "@/features/public/ui/public-missing-session-page";
import { PublicPageMetadataHead } from "@/features/public/ui/public-page-metadata-head";
import PublicSession from "@/features/public/ui/public-session";

export function PublicSessionRoute() {
  const data = useLoaderData() as PublicSessionRouteData;
  const sessionQuery = useQuery({
    ...publicSessionQuery(data.clubSlug, data.sessionId ?? ""),
    enabled: Boolean(data.sessionId),
  });
  const session = sessionQuery.data ?? null;
  const location = useLocation();
  const fallbackReturnTarget = {
    ...publicRecordsReturnTarget,
    href: `${data.publicBasePath}${publicRecordsReturnTarget.href}`,
  };
  const returnTarget = readPublicReadmatesReturnTarget(location.state, fallbackReturnTarget);

  return session ? (
    <>
      <PublicPageMetadataHead metadata={buildPublicSessionPageMetadata(session)} />
      <PublicSession session={session} returnTarget={returnTarget} />
    </>
  ) : (
    <>
      <PublicPageMetadataHead metadata={PUBLIC_MISSING_SESSION_METADATA} />
      <PublicMissingSessionPage returnTarget={returnTarget} />
    </>
  );
}
```

- [ ] **Step 5: Run focused metadata and existing public UI tests**

Run:

```bash
pnpm --dir front exec vitest run features/public/model/public-page-metadata.test.ts features/public/ui/public-page-metadata-head.test.tsx features/public/ui/public-records-page.test.tsx features/public/ui/public-session.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add front/features/public/route/public-home-route.tsx front/features/public/route/public-club-route.tsx front/features/public/route/public-records-route.tsx front/features/public/route/public-session-route.tsx
git commit -m "feat(front): wire public route metadata"
```

Expected: one commit containing only route metadata wiring.

---

### Task 5: Reduce Public Initial Layout Import Cost

**Files:**
- Modify: `front/src/app/layouts.tsx`
- Create: `front/src/app/layouts/public-route-layout.tsx` if module graph confirms public layout imports authenticated-only code.
- Create: `front/src/app/layouts/app-route-layout.tsx` if `AppRouteLayout` is split from `layouts.tsx`.
- Modify: `front/src/app/routes/public.tsx`
- Modify: `front/src/app/routes/member.tsx`
- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/tests/unit/public-navigation-auth.test.tsx`
- Modify: `front/tests/unit/spa-layout.test.tsx`

**Interfaces:**
- Consumes:
  - Existing `PublicRouteLayout`
  - Existing `AppRouteLayout`
- Produces:
  - `PublicRouteLayout` available from `@/src/app/layouts/public-route-layout`
  - `AppRouteLayout` available from `@/src/app/layouts/app-route-layout`
  - `@/src/app/layouts` remains a compatibility re-export for tests or untouched imports.

- [ ] **Step 1: Confirm whether public route imports authenticated-only layout dependencies**

Run:

```bash
pnpm --dir front build
ls -lh front/dist/assets | sort -k5 -hr | head -20
```

Expected: build succeeds. If public entry chunks still include `front/src/app/layouts.tsx` with authenticated-only imports, perform the split in this task. If build analysis shows no public impact, skip Steps 2 through 5 and record the reason in the final closeout.

- [ ] **Step 2: Create a public-only layout module**

Create `front/src/app/layouts/public-route-layout.tsx` with the public layout code and public-only helpers copied from the current `PublicRouteLayout` section:

```tsx
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  archiveReportReturnTarget,
  archiveSessionsReturnTarget,
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
  readReadmatesReturnTarget,
  readmatesReturnState,
  resetReadmatesNavigationScroll,
} from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";
import { PublicUrlPolicyHead } from "@/features/public/ui/public-url-policy-head";
import { MobileHeader } from "@/shared/ui/mobile-header";
import { PublicFooter } from "@/shared/ui/public-footer";
import { TopNav } from "@/shared/ui/top-nav";
import { useAuth } from "@/src/app/auth-state";

const readmatesNavigationContinuity = {
  archiveReportReturnTarget,
  archiveSessionsReturnTarget,
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
  readReadmatesReturnTarget,
  readmatesReturnState,
};

function RouteOutlet() {
  const location = useLocation();

  useEffect(() => {
    resetReadmatesNavigationScroll();
  }, [location.pathname, location.search]);

  return (
    <div key={location.pathname} className="rm-route-reveal">
      <Outlet />
    </div>
  );
}

function publicBasePath(pathname: string) {
  const match = /^\/clubs\/([^/]+)/.exec(pathname);
  return match ? `/clubs/${encodeURIComponent(match[1])}` : "";
}

export function PublicRouteLayout() {
  const state = useAuth();
  const location = useLocation();
  const authenticated = state.status === "ready" ? state.auth.authenticated : undefined;
  const basePath = publicBasePath(location.pathname);

  return (
    <div className="public-shell m-app">
      <PublicUrlPolicyHead path={location.pathname} />
      <div className="desktop-only">
        <TopNav authenticated={authenticated} publicBasePath={basePath} LinkComponent={Link} />
      </div>
      <div className="mobile-only">
        <MobileHeader
          variant="guest"
          authenticated={authenticated}
          publicBasePath={basePath}
          LinkComponent={Link}
          navigationContinuity={readmatesNavigationContinuity}
        />
      </div>
      <div className="rm-route-stage">
        <RouteOutlet />
      </div>
      <PublicFooter publicBasePath={basePath} showGuestMemberActions={false} LinkComponent={Link} />
    </div>
  );
}
```

- [ ] **Step 3: Create an app-only layout module**

Move the existing `AppRouteLayout`, `ClubSwitcher`, `appPathname`, `appBasePath`, `appClubSlug`, and `clubSwitcherTargetPath` code from `front/src/app/layouts.tsx` into `front/src/app/layouts/app-route-layout.tsx`. Keep the code unchanged except for imports required by the move.

The exported signature must remain:

```tsx
export function AppRouteLayout() {
  return (
    <div className="app-shell">
      {/* existing implementation body */}
    </div>
  );
}
```

- [ ] **Step 4: Turn `layouts.tsx` into compatibility re-exports**

Replace `front/src/app/layouts.tsx` with:

```tsx
export { AppRouteLayout } from "@/src/app/layouts/app-route-layout";
export { PublicRouteLayout } from "@/src/app/layouts/public-route-layout";
```

- [ ] **Step 5: Update direct route imports**

In `front/src/app/routes/public.tsx`, replace:

```tsx
import { PublicRouteLayout } from "@/src/app/layouts";
```

with:

```tsx
import { PublicRouteLayout } from "@/src/app/layouts/public-route-layout";
```

In `front/src/app/routes/member.tsx` and `front/src/app/routes/host.tsx`, replace:

```tsx
import { AppRouteLayout } from "@/src/app/layouts";
```

with:

```tsx
import { AppRouteLayout } from "@/src/app/layouts/app-route-layout";
```

Do not update tests unless TypeScript or Vitest needs the direct path. The compatibility re-export keeps existing tests valid.

- [ ] **Step 6: Run layout tests and build**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/public-navigation-auth.test.tsx tests/unit/spa-layout.test.tsx
pnpm --dir front build
```

Expected: PASS. The build may still show the existing chunk-size warning; that warning is not a failure.

- [ ] **Step 7: Compare top output chunks**

Run:

```bash
ls -lh front/dist/assets | sort -k5 -hr | head -20
```

Expected: public route chunks no longer require authenticated-only layout module code through `layouts.tsx`. If chunk sizes do not improve, keep the split only if the dependency boundary is clearer and tests pass; otherwise revert only the Task 5 split before committing.

- [ ] **Step 8: Commit**

Run:

```bash
git add front/src/app/layouts.tsx front/src/app/layouts/public-route-layout.tsx front/src/app/layouts/app-route-layout.tsx front/src/app/routes/public.tsx front/src/app/routes/member.tsx front/src/app/routes/host.tsx
git commit -m "refactor(front): split public route layout imports"
```

Expected: one commit containing only layout import-boundary changes. If Steps 2 through 5 were skipped because build analysis showed no public impact, do not create this commit.

---

### Task 6: Re-run Lighthouse and Record Public Delta

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes:
  - Pre-change public baseline from Task 1.
  - Current public Lighthouse report.
- Produces:
  - Public closeout evidence in docs.

- [ ] **Step 1: Run focused tests before the final Lighthouse pass**

Run:

```bash
pnpm --dir front exec vitest run features/public/model/public-page-metadata.test.ts features/public/ui/public-page-metadata-head.test.tsx tests/unit/public-navigation-auth.test.tsx tests/unit/spa-layout.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the full public Lighthouse diagnostic again**

Run:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

Expected: the command prints `Lighthouse diagnostic complete: <path>/summary.md`.

- [ ] **Step 3: Inspect the post-change report**

Run, replacing `<summary>` with the new summary path:

```bash
sed -n '1,220p' <summary>
```

Expected:

- `failed route count: 0`
- fewer SEO metadata findings than the Task 1 baseline
- `public-home` and `public-about` SEO scores higher than the pre-change smoke range when the same local conditions are used

- [ ] **Step 4: Add CHANGELOG evidence**

Add one bullet under `## Unreleased` in `CHANGELOG.md`:

```md
- **public page quality:** public routes now derive page titles and meta descriptions from the same club/session data used for visible pages, reducing local Lighthouse SEO metadata findings while leaving server API, auth/BFF, DB migrations, and deploy behavior unchanged.
```

- [ ] **Step 5: Add release-readiness closeout evidence**

Add a dated subsection to `docs/development/release-readiness-review.md`:

```md
## 2026-06-25 Lighthouse public improvements closeout

- Scope: public route SEO metadata and public initial loading-cost review only.
- Product evidence: public route titles and descriptions now derive from public club/session route data; canonical and robots behavior remains in the existing public URL policy boundary.
- Local Lighthouse evidence: pre-change and post-change `pnpm --dir front lighthouse:diagnose -- --group public` reports were compared from `.tmp/lighthouse/`; post-change route entry failures stayed at 0 and SEO metadata findings decreased.
- Unchanged surfaces: server API contracts, auth/BFF behavior, DB migrations, OAuth provider configuration, and deploy workflow behavior were not changed.
```

- [ ] **Step 6: Run docs whitespace check**

Run:

```bash
git diff --check -- CHANGELOG.md docs/development/release-readiness-review.md
```

Expected: no output and exit code `0`.

- [ ] **Step 7: Commit**

Run:

```bash
git add CHANGELOG.md docs/development/release-readiness-review.md
git commit -m "docs: record lighthouse public improvements"
```

Expected: one commit containing only closeout docs.

---

### Task 7: Final Verification

**Files:**
- Read-only verification unless a check exposes a bug.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: a final local verification result for implementation closeout.

- [ ] **Step 1: Run frontend lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [ ] **Step 3: Run frontend production build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS. Existing large chunk warnings are acceptable only if the command exits `0`.

- [ ] **Step 4: Run public Lighthouse final smoke**

Run:

```bash
pnpm --dir front lighthouse:diagnose -- --group public
```

Expected: PASS with `failed route count: 0` in the generated `summary.md`.

- [ ] **Step 5: Check the final diff for whitespace**

Run:

```bash
git diff --check HEAD~5..HEAD
```

Expected: no output and exit code `0`. If Task 5 was skipped, adjust `HEAD~5` to the number of commits created by this implementation.

- [ ] **Step 6: Confirm no generated reports are staged or tracked**

Run:

```bash
git status --short
git ls-files .tmp/lighthouse
```

Expected: `git ls-files .tmp/lighthouse` prints nothing. `git status --short` does not show `.tmp/lighthouse/`.

- [ ] **Step 7: Closeout response**

Report:

- changed surface: public frontend metadata, optional public layout import boundary, docs
- checks run: exact commands and pass/fail result
- Lighthouse report path: local `.tmp/lighthouse/<timestamp>/summary.md`, not committed
- remaining risk: performance findings that were not safely actionable, with raw audit IDs
- skipped validation: server Gradle/E2E/public release candidate checks if no server, auth/BFF, deploy, or release-candidate surface changed

No commit is required for this final verification task unless a verification failure requires a fix.
