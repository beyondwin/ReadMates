# Admin Club Operations Triage List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin/clubs` from a flat table into a triage list that surfaces clubs needing attention first, with a severity badge, human reasons, and a severity filter, so an operator can instantly see which clubs are in trouble and drill in.

**Architecture:** Frontend-only vertical slice. A new pure model (`platform-admin-club-triage-model.ts`) computes a severity (`critical`/`attention`/`ok`) and reason list from fields already present on `PlatformAdminClub` (`status`, `domainActionRequiredCount`, `firstHostOnboardingState`). The clubs route reuses the model to sort, badge, and filter rows. No server change. The detail route already provides safe drill-down (notifications / AI Ops links), so this plan completes the list-side gate of S3+.

**Tech Stack:** React 19, TypeScript, Vite, `@tanstack/react-query`, react-router-dom, vitest + `@testing-library/react`, Playwright.

**Scope source:** `docs/superpowers/specs/2026-05-29-readmates-admin-vnext-operating-depth-reporting-design.md` (slice S3+).

**Explicitly deferred to a follow-up plan (NOT in this plan):** Per-club notification-failure and AI-failure counts in the list. Those require a server set-based aggregation over `notification_deliveries` and the AI audit table plus FK-heavy integration-test seeding (`notification_deliveries` is FK-bound to `notification_event_outbox` and `memberships`). They belong in their own server slice/plan. This plan delivers triage from readiness/domain/host signals, which mirror the existing server `readiness.blockingReasons` (`HOST_REQUIRED`, `DOMAIN_ACTION_REQUIRED`, `CLUB_NOT_ACTIVE`).

---

## File Structure

- Create: `front/features/platform-admin/model/platform-admin-club-triage-model.ts` — pure severity/reason/sort/filter functions and labels. One responsibility: classify and order clubs for triage.
- Create: `front/features/platform-admin/model/platform-admin-club-triage-model.test.ts` — unit tests for the model.
- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx` — consume the model: sort rows, render severity badge + reasons, add severity filter toolbar.
- Modify: `front/features/platform-admin/route/admin-clubs-route.test.tsx` — add ordering, badge, and filter tests.
- Modify: `front/src/styles/...` (admin stylesheet that defines `admin-clubs*`) — add `admin-clubs__triage*` styles. Exact file located in Task 4.
- Modify: `front/tests/e2e/...` admin clubs spec (or create one) — happy-path triage E2E. Exact file located in Task 5.
- Modify: `CHANGELOG.md` — `Unreleased` entry.

---

## Task 1: Triage model (pure functions)

**Files:**
- Create: `front/features/platform-admin/model/platform-admin-club-triage-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-club-triage-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `front/features/platform-admin/model/platform-admin-club-triage-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PlatformAdminClub } from "@/features/platform-admin/model/platform-admin-domain-types";
import {
  CLUB_TRIAGE_LABEL,
  clubTriageReasons,
  clubTriageSeverity,
  filterClubsBySeverity,
  rankClubsByTriage,
} from "./platform-admin-club-triage-model";

function club(overrides: Partial<PlatformAdminClub>): PlatformAdminClub {
  return {
    clubId: "c-1",
    slug: "alpha",
    name: "Alpha",
    tagline: "",
    about: "",
    status: "ACTIVE",
    publicVisibility: "PRIVATE",
    domainCount: 0,
    domainActionRequiredCount: 0,
    firstHostOnboardingState: "ASSIGNED",
    ...overrides,
  };
}

describe("clubTriageSeverity", () => {
  it("is ok for an active club with no blockers", () => {
    expect(clubTriageSeverity(club({}))).toBe("ok");
  });

  it("is critical when a domain needs action", () => {
    expect(clubTriageSeverity(club({ domainActionRequiredCount: 2 }))).toBe("critical");
  });

  it("is critical when suspended or archived", () => {
    expect(clubTriageSeverity(club({ status: "SUSPENDED" }))).toBe("critical");
    expect(clubTriageSeverity(club({ status: "ARCHIVED" }))).toBe("critical");
  });

  it("is attention when setup is incomplete or host is not assigned", () => {
    expect(clubTriageSeverity(club({ status: "SETUP_REQUIRED" }))).toBe("attention");
    expect(clubTriageSeverity(club({ firstHostOnboardingState: "MISSING" }))).toBe("attention");
    expect(clubTriageSeverity(club({ firstHostOnboardingState: "INVITED" }))).toBe("attention");
  });
});

describe("clubTriageReasons", () => {
  it("lists each active blocker in Korean", () => {
    expect(clubTriageReasons(club({ domainActionRequiredCount: 1, firstHostOnboardingState: "MISSING" }))).toEqual([
      "도메인 조치 필요",
      "호스트 없음",
    ]);
  });

  it("is empty for a healthy club", () => {
    expect(clubTriageReasons(club({}))).toEqual([]);
  });
});

describe("rankClubsByTriage", () => {
  it("orders critical before attention before ok and is stable within a bucket", () => {
    const ok = club({ clubId: "ok" });
    const attention = club({ clubId: "att", status: "SETUP_REQUIRED" });
    const critical = club({ clubId: "crit", domainActionRequiredCount: 1 });
    const ranked = rankClubsByTriage([ok, attention, critical]);
    expect(ranked.map((c) => c.clubId)).toEqual(["crit", "att", "ok"]);
  });

  it("does not mutate the input array", () => {
    const input = [club({ clubId: "ok" }), club({ clubId: "crit", domainActionRequiredCount: 1 })];
    rankClubsByTriage(input);
    expect(input.map((c) => c.clubId)).toEqual(["ok", "crit"]);
  });
});

describe("filterClubsBySeverity", () => {
  it("returns all clubs for the 'all' filter", () => {
    const clubs = [club({ clubId: "a" }), club({ clubId: "b", status: "SUSPENDED" })];
    expect(filterClubsBySeverity(clubs, "all")).toHaveLength(2);
  });

  it("keeps only clubs matching the selected severity", () => {
    const clubs = [club({ clubId: "ok" }), club({ clubId: "crit", status: "SUSPENDED" })];
    expect(filterClubsBySeverity(clubs, "critical").map((c) => c.clubId)).toEqual(["crit"]);
  });
});

describe("CLUB_TRIAGE_LABEL", () => {
  it("maps every severity to a Korean label", () => {
    expect(CLUB_TRIAGE_LABEL).toEqual({ critical: "긴급", attention: "주의", ok: "정상" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test platform-admin-club-triage-model`
Expected: FAIL — cannot resolve `./platform-admin-club-triage-model` (module not found).

- [ ] **Step 3: Write the model**

Create `front/features/platform-admin/model/platform-admin-club-triage-model.ts`:

```ts
import type { PlatformAdminClub } from "@/features/platform-admin/model/platform-admin-domain-types";

export type ClubTriageSeverity = "critical" | "attention" | "ok";
export type ClubTriageFilter = ClubTriageSeverity | "all";

const SEVERITY_RANK: Record<ClubTriageSeverity, number> = {
  critical: 0,
  attention: 1,
  ok: 2,
};

export const CLUB_TRIAGE_LABEL: Record<ClubTriageSeverity, string> = {
  critical: "긴급",
  attention: "주의",
  ok: "정상",
};

export function clubTriageReasons(club: PlatformAdminClub): string[] {
  const reasons: string[] = [];
  if (club.domainActionRequiredCount > 0) {
    reasons.push("도메인 조치 필요");
  }
  if (club.firstHostOnboardingState === "MISSING") {
    reasons.push("호스트 없음");
  } else if (club.firstHostOnboardingState === "INVITED") {
    reasons.push("호스트 초대 대기");
  }
  if (club.status === "SUSPENDED") {
    reasons.push("정지됨");
  } else if (club.status === "ARCHIVED") {
    reasons.push("보관됨");
  } else if (club.status === "SETUP_REQUIRED") {
    reasons.push("설정 미완료");
  }
  return reasons;
}

export function clubTriageSeverity(club: PlatformAdminClub): ClubTriageSeverity {
  if (club.domainActionRequiredCount > 0 || club.status === "SUSPENDED" || club.status === "ARCHIVED") {
    return "critical";
  }
  if (club.status === "SETUP_REQUIRED" || club.firstHostOnboardingState !== "ASSIGNED") {
    return "attention";
  }
  return "ok";
}

export function rankClubsByTriage(clubs: PlatformAdminClub[]): PlatformAdminClub[] {
  return [...clubs].sort(
    (a, b) => SEVERITY_RANK[clubTriageSeverity(a)] - SEVERITY_RANK[clubTriageSeverity(b)],
  );
}

export function filterClubsBySeverity(
  clubs: PlatformAdminClub[],
  filter: ClubTriageFilter,
): PlatformAdminClub[] {
  if (filter === "all") {
    return clubs;
  }
  return clubs.filter((club) => clubTriageSeverity(club) === filter);
}
```

Note: `Array.prototype.sort` is stable in all supported engines, so clubs keep the server order (updated_at desc) within a severity bucket.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test platform-admin-club-triage-model`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-club-triage-model.ts front/features/platform-admin/model/platform-admin-club-triage-model.test.ts
git commit -m "feat: add platform admin club triage model"
```

---

## Task 2: Sort the clubs list by triage and show severity badge + reasons

**Files:**
- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx`
- Test: `front/features/platform-admin/route/admin-clubs-route.test.tsx:8-56`

- [ ] **Step 1: Update the test factory and add failing tests**

In `front/features/platform-admin/route/admin-clubs-route.test.tsx`, replace the import line and add the model import, then add new tests. First update the imports at the top:

```ts
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminClubsRoute } from "./admin-clubs-route";
```

Then append these tests inside the existing `describe("AdminClubsRoute", ...)` block:

```ts
  it("orders critical clubs before healthy clubs", () => {
    renderRoute([
      {
        clubId: "ok-1", slug: "healthy", name: "Healthy", status: "ACTIVE",
        publicVisibility: "PUBLIC", domainCount: 1, domainActionRequiredCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
      {
        clubId: "crit-1", slug: "broken", name: "Broken", status: "ACTIVE",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 2,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(within(rows[0]).getByText("Broken")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Healthy")).toBeInTheDocument();
  });

  it("shows a severity badge and reason for an at-risk club", () => {
    renderRoute([
      {
        clubId: "crit-1", slug: "broken", name: "Broken", status: "ACTIVE",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 2,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    expect(screen.getByText("긴급")).toBeInTheDocument();
    expect(screen.getByText("도메인 조치 필요")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir front test admin-clubs-route`
Expected: FAIL — "긴급" / "도메인 조치 필요" not found, and order assertion fails (current code renders server order, no badge).

- [ ] **Step 3: Update the route to sort and render the triage column**

Replace the contents of `front/features/platform-admin/route/admin-clubs-route.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  CLUB_TRIAGE_LABEL,
  clubTriageReasons,
  clubTriageSeverity,
  rankClubsByTriage,
} from "@/features/platform-admin/model/platform-admin-club-triage-model";

export function AdminClubsRoute() {
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  const ordered = rankClubsByTriage(clubs.items);
  return (
    <section className="admin-clubs" aria-labelledby="admin-clubs-title">
      <header className="admin-clubs__header">
        <h1 id="admin-clubs-title" className="h1 editorial">클럽</h1>
        <p className="body">플랫폼이 보유한 모든 클럽 목록입니다. 조치가 필요한 클럽이 위에 옵니다.</p>
        <Link to="?onboarding=1" className="btn btn-primary btn-sm">새 클럽</Link>
      </header>
      {ordered.length === 0 ? (
        <p className="muted">클럽이 없습니다.</p>
      ) : (
        <table className="admin-clubs__table">
          <thead>
            <tr>
              <th scope="col">상태 신호</th>
              <th scope="col">Slug</th>
              <th scope="col">이름</th>
              <th scope="col">상태</th>
              <th scope="col">공개</th>
              <th scope="col">도메인</th>
              <th scope="col">호스트</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((club) => {
              const severity = clubTriageSeverity(club);
              const reasons = clubTriageReasons(club);
              return (
                <tr key={club.clubId} className={`admin-clubs__row admin-clubs__row--${severity}`}>
                  <td>
                    <span className={`admin-clubs__triage admin-clubs__triage--${severity}`}>
                      {CLUB_TRIAGE_LABEL[severity]}
                    </span>
                    {reasons.length > 0 ? (
                      <span className="admin-clubs__triage-reasons">{reasons.join(" · ")}</span>
                    ) : null}
                  </td>
                  <td>{club.slug}</td>
                  <td>
                    <Link to={`/admin/clubs/${club.clubId}`}>{club.name}</Link>
                  </td>
                  <td>{club.status}</td>
                  <td>{club.publicVisibility}</td>
                  <td>
                    {club.domainCount}
                    {club.domainActionRequiredCount > 0 ? ` · ${club.domainActionRequiredCount} 조치 필요` : ""}
                  </td>
                  <td>{club.firstHostOnboardingState}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir front test admin-clubs-route`
Expected: PASS — including the two pre-existing tests (row render, navigation) which still find `alpha`/`Alpha`/`ACTIVE`/`PRIVATE` and the `Alpha` link.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/route/admin-clubs-route.tsx front/features/platform-admin/route/admin-clubs-route.test.tsx
git commit -m "feat: order admin clubs list by triage severity"
```

---

## Task 3: Severity filter toolbar

**Files:**
- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx`
- Test: `front/features/platform-admin/route/admin-clubs-route.test.tsx`

- [ ] **Step 1: Add failing filter test**

Append inside `describe("AdminClubsRoute", ...)` in `admin-clubs-route.test.tsx`:

```ts
  it("filters the list to only critical clubs when the 긴급 filter is selected", () => {
    renderRoute([
      {
        clubId: "ok-1", slug: "healthy", name: "Healthy", status: "ACTIVE",
        publicVisibility: "PUBLIC", domainCount: 1, domainActionRequiredCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
      {
        clubId: "crit-1", slug: "broken", name: "Broken", status: "SUSPENDED",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "긴급" }));
    expect(screen.getByText("Broken")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("shows an empty hint when a filter matches no clubs", () => {
    renderRoute([
      {
        clubId: "ok-1", slug: "healthy", name: "Healthy", status: "ACTIVE",
        publicVisibility: "PUBLIC", domainCount: 1, domainActionRequiredCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "긴급" }));
    expect(screen.getByText("선택한 필터에 해당하는 클럽이 없습니다.")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir front test admin-clubs-route`
Expected: FAIL — no button named "긴급", empty hint text absent.

- [ ] **Step 3: Add filter state, toolbar, and filtering to the route**

Edit `front/features/platform-admin/route/admin-clubs-route.tsx`. Update the imports to add `useState` and the filter helpers:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  CLUB_TRIAGE_LABEL,
  clubTriageReasons,
  clubTriageSeverity,
  filterClubsBySeverity,
  rankClubsByTriage,
  type ClubTriageFilter,
} from "@/features/platform-admin/model/platform-admin-club-triage-model";

const FILTER_OPTIONS: ReadonlyArray<{ value: ClubTriageFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "critical", label: "긴급" },
  { value: "attention", label: "주의" },
];
```

Then replace the function body's first two statements (the `clubs` and `ordered` lines) and the header/table region. The full updated function:

```tsx
export function AdminClubsRoute() {
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  const [filter, setFilter] = useState<ClubTriageFilter>("all");
  const ordered = rankClubsByTriage(filterClubsBySeverity(clubs.items, filter));
  return (
    <section className="admin-clubs" aria-labelledby="admin-clubs-title">
      <header className="admin-clubs__header">
        <h1 id="admin-clubs-title" className="h1 editorial">클럽</h1>
        <p className="body">플랫폼이 보유한 모든 클럽 목록입니다. 조치가 필요한 클럽이 위에 옵니다.</p>
        <Link to="?onboarding=1" className="btn btn-primary btn-sm">새 클럽</Link>
      </header>
      <div className="admin-clubs__filters" role="group" aria-label="상태 신호 필터">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`btn btn-sm ${filter === option.value ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {clubs.items.length === 0 ? (
        <p className="muted">클럽이 없습니다.</p>
      ) : ordered.length === 0 ? (
        <p className="muted">선택한 필터에 해당하는 클럽이 없습니다.</p>
      ) : (
        <table className="admin-clubs__table">
          <thead>
            <tr>
              <th scope="col">상태 신호</th>
              <th scope="col">Slug</th>
              <th scope="col">이름</th>
              <th scope="col">상태</th>
              <th scope="col">공개</th>
              <th scope="col">도메인</th>
              <th scope="col">호스트</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((club) => {
              const severity = clubTriageSeverity(club);
              const reasons = clubTriageReasons(club);
              return (
                <tr key={club.clubId} className={`admin-clubs__row admin-clubs__row--${severity}`}>
                  <td>
                    <span className={`admin-clubs__triage admin-clubs__triage--${severity}`}>
                      {CLUB_TRIAGE_LABEL[severity]}
                    </span>
                    {reasons.length > 0 ? (
                      <span className="admin-clubs__triage-reasons">{reasons.join(" · ")}</span>
                    ) : null}
                  </td>
                  <td>{club.slug}</td>
                  <td>
                    <Link to={`/admin/clubs/${club.clubId}`}>{club.name}</Link>
                  </td>
                  <td>{club.status}</td>
                  <td>{club.publicVisibility}</td>
                  <td>
                    {club.domainCount}
                    {club.domainActionRequiredCount > 0 ? ` · ${club.domainActionRequiredCount} 조치 필요` : ""}
                  </td>
                  <td>{club.firstHostOnboardingState}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir front test admin-clubs-route`
Expected: PASS — filter narrows to critical, empty hint shows, prior tests still pass (note the "navigates" test clicks the `Alpha` link which remains visible under the default `all` filter).

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/route/admin-clubs-route.tsx front/features/platform-admin/route/admin-clubs-route.test.tsx
git commit -m "feat: add severity filter to admin clubs list"
```

---

## Task 4: Triage badge styles

**Files:**
- Modify: the admin stylesheet that already defines `admin-clubs*` classes (locate in Step 1).

- [ ] **Step 1: Locate the stylesheet that defines `admin-clubs__table`**

Run: `grep -rl "admin-clubs__table" front/src front/features`
Expected: one stylesheet path (for example a global admin CSS). Use that file in Step 2. If `admin-clubs__table` styling lives in a CSS module next to the shell, edit that same file.

- [ ] **Step 2: Add triage styles**

Append to the located stylesheet (adjust selector nesting to match the file's existing convention; these are flat class selectors consistent with the existing `admin-clubs__*` classes):

```css
.admin-clubs__filters {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
  flex-wrap: wrap;
}

.admin-clubs__triage {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.admin-clubs__triage--critical {
  background: var(--color-danger-soft, #fdecec);
  color: var(--color-danger, #b3261e);
}

.admin-clubs__triage--attention {
  background: var(--color-warning-soft, #fff4e5);
  color: var(--color-warning, #9a6700);
}

.admin-clubs__triage--ok {
  background: var(--color-success-soft, #e8f5e9);
  color: var(--color-success, #1b5e20);
}

.admin-clubs__triage-reasons {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.72rem;
  color: var(--color-text-muted, #6b6b6b);
}
```

If the existing CSS does not define the referenced custom properties, the fallback hex values keep the badges legible.

- [ ] **Step 3: Verify the build and lint pass**

Run: `pnpm --dir front lint && pnpm --dir front build`
Expected: PASS — no lint errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add front/src front/features
git commit -m "style: add admin clubs triage badge styles"
```

---

## Task 5: E2E happy path + docs

**Files:**
- Modify or create: admin clubs Playwright spec (locate in Step 1).
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Locate the admin E2E pattern**

Run: `ls front/tests/e2e && grep -rln "/admin/" front/tests/e2e`
Expected: existing admin specs (for example an admin shell or health spec). Mirror that file's auth/dev-login setup. Use the closest existing admin spec as the template for the new test below (same `test.describe`, same login helper, same base URL usage).

- [ ] **Step 2: Write the failing E2E test**

Add a test to the admin clubs spec (create `front/tests/e2e/admin-clubs-triage.spec.ts` if no clubs spec exists), using the same login/setup helpers the located admin spec uses. The assertion body:

```ts
// Inside the admin-authenticated describe block, after navigating to /admin/clubs:
await page.goto("/admin/clubs");
await expect(page.getByRole("heading", { name: "클럽" })).toBeVisible();

// Triage filter toolbar is present.
await expect(page.getByRole("button", { name: "전체" })).toBeVisible();
await expect(page.getByRole("button", { name: "긴급" })).toBeVisible();

// Filtering to 긴급 keeps the page usable (no crash, table or empty hint shows).
await page.getByRole("button", { name: "긴급" }).click();
const table = page.locator(".admin-clubs__table");
const emptyHint = page.getByText("선택한 필터에 해당하는 클럽이 없습니다.");
await expect(table.or(emptyHint)).toBeVisible();

// Reset to 전체 and drill into the first club row.
await page.getByRole("button", { name: "전체" }).click();
const firstClubLink = page.locator(".admin-clubs__table tbody tr td a").first();
await firstClubLink.click();
await expect(page).toHaveURL(/\/admin\/clubs\/.+/);
```

Note: `locator.or()` requires a recent Playwright; if unavailable, assert `table` visible only when the dev seed has clubs (the dev seed used by other admin E2E specs always seeds at least one club — confirm against the located spec's expectations).

- [ ] **Step 3: Run the E2E test to verify it passes (or fails meaningfully first)**

Run: `pnpm --dir front test:e2e`
Expected: the new test passes against the dev-login admin session. If it fails because the dev seed has no clubs, adjust the assertion to the empty-hint branch — do not weaken the drill-in assertion when clubs exist.

- [ ] **Step 4: Update CHANGELOG**

In `CHANGELOG.md`, under the `Unreleased` section, add a bullet describing shipped behavior (not plan language):

```markdown
- `/admin/clubs`: triage list now orders clubs by operational severity (긴급/주의/정상), shows the blocking reasons inline, and adds a severity filter so operators see at-risk clubs first.
```

- [ ] **Step 5: Run the full frontend regression suite**

Run: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
Expected: PASS — all green.

- [ ] **Step 6: Commit**

```bash
git add front/tests/e2e CHANGELOG.md
git commit -m "test: cover admin clubs triage e2e and note changelog"
```

---

## Verification Gates (whole plan)

- [ ] `pnpm --dir front test platform-admin-club-triage-model` — model unit tests pass.
- [ ] `pnpm --dir front test admin-clubs-route` — route ordering, badge, filter, and prior tests pass.
- [ ] `pnpm --dir front lint` — no lint errors.
- [ ] `pnpm --dir front build` — production build succeeds.
- [ ] `pnpm --dir front test:e2e` — admin clubs triage happy path passes.
- [ ] `git diff --check` — no whitespace/conflict markers in changed files.
- [ ] Manual browser smoke: dev-login as platform admin, open `/admin/clubs`, confirm at-risk clubs sort to the top with a readable badge, the filter narrows the list, and clicking a club name opens the detail route.

## Public Safety

- No server change, no new data exposure. Triage labels and reasons are derived from already-exposed club fields (`status`, `domainCount`/`domainActionRequiredCount`, `firstHostOnboardingState`). No member data, secrets, provider errors, or private operational details are added to the UI, tests, fixtures, or docs.

## Deferred Follow-up (next S3+ plan)

Per-club notification-failure and AI-failure counts in the list. This needs a server set-based aggregation extending `CLUB_BASE_SQL` in `JdbcPlatformAdminClubAdapter` with `left join` subqueries over `notification_deliveries` (status in `FAILED`,`DEAD`) and the AI audit table (status `FAILED`, last 7 days), new fields on `PlatformAdminClubListItem` / `PlatformAdminClubResponse` (with safe defaults), the matching frontend `operationalSignals` field, and an `@Tag("integration")` test that seeds the FK chain (`clubs` → `notification_event_outbox` + `memberships` → `notification_deliveries`). Fold those counts into `clubTriageSeverity` (failure count > 0 ⇒ critical) when shipped.
