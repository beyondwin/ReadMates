# ReadMates Cream Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/` route with a "Minimal Cream Gallery" public landing page, backed by a scoped `data-surface="readmates-cream"` design subsystem (tokens + presentational primitives) that does not affect any other route.

**Architecture:** A single CSS file (`shared/styles/readmates-cream.css`) declares cream tokens under `:where([data-surface="readmates-cream"])`, so existing `tokens.css` semantics are unchanged outside the landing. New presentational components live in `shared/ui/readmates-cream/`. A new `features/public/route/landing-route-*` pair owns loader + route element and reuses the existing `publicClubLoader` data shape verbatim, plus a small display model that maps `PublicClubResponse` → a landing view-model with empty-state fallbacks. The `LandingPage` reads auth via `useAuth()` (no extra loader fetch) and composes section components.

**Tech Stack:** Vite 5, React 19, React Router 7, vitest + React Testing Library, Playwright, Pretendard font. No Next/RSC directives.

**Spec:** `docs/superpowers/specs/2026-05-09-readmates-cream-landing-design.md`

---

## File map

Create:

- `front/shared/styles/readmates-cream.css`
- `front/shared/ui/readmates-cream/cream-brand-mark.tsx`
- `front/shared/ui/readmates-cream/cream-segmented.tsx`
- `front/shared/ui/readmates-cream/cream-record-card.tsx`
- `front/shared/ui/readmates-cream/cream-feature-card.tsx`
- `front/shared/ui/readmates-cream/cream-club-card.tsx`
- `front/shared/ui/readmates-cream/cream-hero.tsx`
- `front/shared/ui/readmates-cream/cream-cta-banner.tsx`
- `front/shared/ui/readmates-cream/cream-mobile-header.tsx`
- `front/shared/ui/readmates-cream/cream-nav-drawer.tsx`
- `front/shared/ui/readmates-cream/cream-top-nav.tsx`
- `front/features/public/model/landing-display-model.ts`
- `front/features/public/route/landing-route-data.ts`
- `front/features/public/route/landing-route.tsx`
- `front/features/public/ui/landing-page.tsx`
- `front/features/public/ui/landing-sections/landing-hero-section.tsx`
- `front/features/public/ui/landing-sections/landing-now-reading-section.tsx`
- `front/features/public/ui/landing-sections/landing-records-section.tsx`
- `front/features/public/ui/landing-sections/landing-cta-section.tsx`
- `front/tests/unit/cream-segmented.test.tsx`
- `front/tests/unit/cream-record-card.test.tsx`
- `front/tests/unit/cream-feature-card.test.tsx`
- `front/tests/unit/cream-club-card.test.tsx`
- `front/tests/unit/cream-hero.test.tsx`
- `front/tests/unit/cream-cta-banner.test.tsx`
- `front/tests/unit/cream-top-nav.test.tsx`
- `front/tests/unit/landing-display-model.test.ts`
- `front/tests/unit/landing-page.test.tsx`
- `front/tests/e2e/cream-landing-smoke.spec.ts`

Modify:

- `front/src/styles/globals.css` — add one `@import` line for `readmates-cream.css`
- `front/src/app/router.tsx` — replace `/` route element + loader; remove `PublicHomePage` from the index route
- `front/src/pages/public-home.tsx` — re-export the new `LandingRoute` so the page module still exists (router import unchanged)
- `docs/agents/design.md` — append one short paragraph documenting the cream surface scope

No other files are touched. Do not edit `front/shared/styles/tokens.css`, the existing `PublicHome` component, or any host/archive/feedback code.

---

## Task 1: Add the cream design subsystem stylesheet

**Files:**
- Create: `front/shared/styles/readmates-cream.css`
- Modify: `front/src/styles/globals.css`

The CSS does not lend itself to TDD; correctness is verified by Task 13's e2e smoke and the manual visual checklist in Task 16. The unit-test verification for tokens is covered indirectly when `landing-page.test.tsx` mounts the page (Task 12) — if the stylesheet fails to load, JSDOM still renders structure but Playwright will catch missing colors.

- [ ] **Step 1: Create the cream stylesheet**

Create `front/shared/styles/readmates-cream.css` with this exact content:

```css
/* ============================================================
   ReadMates Cream — scoped design subsystem
   Activates only under [data-surface="readmates-cream"].
   ============================================================ */

:where([data-surface="readmates-cream"]) {
  /* Surfaces */
  --cream-50:  #FAF7F8;
  --cream-100: #F2EFE8;
  --cream-200: #E7EDE6;
  --cream-300: #DCE7DC;

  --bg:        var(--cream-50);
  --bg-sub:    var(--cream-100);
  --bg-raised: #FFFFFF;
  --bg-deep:   var(--cream-200);

  /* Ink (text + lines) */
  --ink-900: #0E2540;
  --ink-700: #2C3E5A;
  --ink-500: #6B7889;
  --ink-300: #B8C0CB;
  --ink-200: #D9DEE4;
  --ink-100: #ECEFF2;

  --text:        var(--ink-900);
  --text-2:      var(--ink-700);
  --text-3:      var(--ink-500);
  --text-4:      var(--ink-300);
  --line:        var(--ink-200);
  --line-soft:   var(--ink-100);
  --line-strong: var(--ink-300);

  /* Dual accent */
  --accent-primary:        #0E2540;
  --accent-primary-hover:  #1A3354;
  --accent-primary-soft:   color-mix(in oklch, #0E2540 8%, var(--cream-50));
  --accent-primary-line:   color-mix(in oklch, #0E2540 18%, var(--cream-100));

  --accent-secondary:        #475B4F;
  --accent-secondary-hover:  #3A4C42;
  --accent-secondary-soft:   var(--cream-300);
  --accent-secondary-line:   color-mix(in oklch, #475B4F 22%, var(--cream-200));

  --accent:       var(--accent-primary);
  --accent-hover: var(--accent-primary-hover);
  --accent-soft:  var(--accent-primary-soft);
  --accent-line:  var(--accent-primary-line);

  /* States */
  --ok:     #5A7A66;
  --ok-soft:     var(--cream-300);
  --warn:   #B07636;
  --warn-soft:   #F4E9D9;
  --danger: #B8493D;
  --danger-soft: #F4DCD8;
  --success:      var(--ok);
  --success-soft: var(--ok-soft);
  --warning:      var(--warn);
  --warning-soft: var(--warn-soft);

  /* Radius + shadow */
  --r-card: 14px;
  --r-pill: 999px;
  --shadow-card:
    0 1px 0 rgba(14, 37, 64, 0.04),
    0 8px 24px -16px rgba(14, 37, 64, 0.12);
}

/* Force light values inside cream surface even in dark mode (out of scope for v1) */
:where([data-theme="dark"][data-surface="readmates-cream"]),
:where([data-theme="dark"]) [data-surface="readmates-cream"] {
  --cream-50:  #FAF7F8;
  --cream-100: #F2EFE8;
  --cream-200: #E7EDE6;
  --cream-300: #DCE7DC;
  --ink-900: #0E2540;
  --ink-700: #2C3E5A;
  --ink-500: #6B7889;
  --ink-300: #B8C0CB;
  --ink-200: #D9DEE4;
  --ink-100: #ECEFF2;
  --bg:        var(--cream-50);
  --bg-sub:    var(--cream-100);
  --bg-raised: #FFFFFF;
  --bg-deep:   var(--cream-200);
  --text:        var(--ink-900);
  --text-2:      var(--ink-700);
  --text-3:      var(--ink-500);
  --text-4:      var(--ink-300);
  --line:        var(--ink-200);
  --line-soft:   var(--ink-100);
  --line-strong: var(--ink-300);
}

/* ============================================================
   Cream-scoped overrides for shared utilities
   ============================================================ */

[data-surface="readmates-cream"] .surface {
  border-radius: var(--r-card);
  box-shadow: var(--shadow-card);
}

[data-surface="readmates-cream"] .surface-quiet {
  border-radius: var(--r-card);
}

[data-surface="readmates-cream"] .btn {
  height: 44px;
  padding: 0 18px;
  border-radius: var(--r-pill);
  font-weight: 500;
  font-size: 14px;
}

[data-surface="readmates-cream"] .btn-sm {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
}

/* ============================================================
   Cream-only typography utilities
   ============================================================ */

[data-surface="readmates-cream"] .cream-display {
  font-size: clamp(34px, 6vw, 56px);
  line-height: 1.08;
  letter-spacing: -0.03em;
  font-weight: 600;
  word-break: keep-all;
}

[data-surface="readmates-cream"] .cream-h2 {
  font-size: clamp(20px, 2.4vw, 24px);
  line-height: 1.25;
  letter-spacing: -0.02em;
  font-weight: 600;
  word-break: keep-all;
  margin: 0;
}

[data-surface="readmates-cream"] .cream-eyebrow {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: 600;
}

/* ============================================================
   Layout primitives used by sections (kept here so feature files
   stay declarative; selectors are scoped under cream)
   ============================================================ */

[data-surface="readmates-cream"] .cream-page {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  padding-bottom: 64px;
}

[data-surface="readmates-cream"] .cream-container {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 32px;
}

@media (max-width: 1023px) {
  [data-surface="readmates-cream"] .cream-container {
    padding: 0 24px;
  }
}

@media (max-width: 767px) {
  [data-surface="readmates-cream"] .cream-container {
    padding: 0 16px;
  }
}

[data-surface="readmates-cream"] .cream-section + .cream-section {
  margin-top: 48px;
}
```

The file does not declare any selectors outside `[data-surface="readmates-cream"]`. The two `[data-theme="dark"]` selectors are also gated by the surface attribute. **If you add a selector that omits the surface guard, the spec's "no leakage" requirement is violated — stop and re-check.**

- [ ] **Step 2: Wire the stylesheet into the global runtime**

Open `front/src/styles/globals.css`. The first imports look like:

```css
@import "../../shared/styles/tokens.css";
@import "../../shared/styles/mobile.css";
```

Add one new line directly after the `mobile.css` import:

```css
@import "../../shared/styles/readmates-cream.css";
```

- [ ] **Step 3: Verify no leakage by build**

Run:
```bash
pnpm --dir front build
```
Expected: build succeeds with no CSS errors.

- [ ] **Step 4: Commit**

```bash
git add front/shared/styles/readmates-cream.css front/src/styles/globals.css
git commit -m "feat(style): add scoped cream design subsystem stylesheet"
```

---

## Task 2: CreamBrandMark

**Files:**
- Create: `front/shared/ui/readmates-cream/cream-brand-mark.tsx`

This component is purely visual. A unit test would only re-assert the JSX. We rely on Task 7's hero test to cover the brand mark indirectly. **Do not add a test file for this component.**

- [ ] **Step 1: Implement CreamBrandMark**

Create `front/shared/ui/readmates-cream/cream-brand-mark.tsx`:

```tsx
type CreamBrandMarkSize = "sm" | "md" | "lg";

type CreamBrandMarkProps = {
  size?: CreamBrandMarkSize;
  withWordmark?: boolean;
  className?: string;
};

const SIZE_PX: Record<CreamBrandMarkSize, number> = {
  sm: 28,
  md: 34,
  lg: 44,
};

const WORDMARK_PX: Record<CreamBrandMarkSize, number> = {
  sm: 16,
  md: 18,
  lg: 22,
};

export function CreamBrandMark({
  size = "md",
  withWordmark = true,
  className,
}: CreamBrandMarkProps) {
  const square = SIZE_PX[size];
  const wordmark = WORDMARK_PX[size];
  const glyph = Math.round(square * 0.6);

  return (
    <span
      className={className ? `cream-brand-mark ${className}` : "cream-brand-mark"}
      style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
    >
      <span
        aria-hidden
        style={{
          width: square,
          height: square,
          borderRadius: 8,
          background: "var(--accent-primary)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 20 20" fill="none">
          <path d="M10 4 L3 5.5 L3 16.5 L10 15 Z" fill="#FFFFFF" />
          <path d="M10 4 L17 5.5 L17 16.5 L10 15 Z" fill="#FFFFFF" fillOpacity="0.42" />
        </svg>
      </span>
      {withWordmark ? (
        <span
          style={{
            fontWeight: 600,
            fontSize: wordmark,
            letterSpacing: "-0.012em",
            color: "var(--text)",
            whiteSpace: "nowrap",
          }}
        >
          ReadMates
        </span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 2: Verify build still passes**

Run:
```bash
pnpm --dir front build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add front/shared/ui/readmates-cream/cream-brand-mark.tsx
git commit -m "feat(ui): add CreamBrandMark"
```

---

## Task 3: CreamSegmented

**Files:**
- Create: `front/shared/ui/readmates-cream/cream-segmented.tsx`
- Test: `front/tests/unit/cream-segmented.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `front/tests/unit/cream-segmented.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreamSegmented } from "@/shared/ui/readmates-cream/cream-segmented";

const OPTIONS = [
  { value: "all", label: "전체" },
  { value: "session", label: "모임 기록" },
  { value: "book", label: "책 기록" },
  { value: "note", label: "생각 노트" },
];

afterEach(() => {
  cleanup();
});

describe("CreamSegmented", () => {
  it("marks the selected pill as the active tab", () => {
    render(
      <CreamSegmented label="기록 분류" options={OPTIONS} value="all" onChange={() => {}} />,
    );

    expect(screen.getByRole("tab", { name: "전체", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "책 기록", selected: false })).toBeInTheDocument();
  });

  it("invokes onChange when a non-selected pill is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CreamSegmented label="기록 분류" options={OPTIONS} value="all" onChange={onChange} />,
    );

    await user.click(screen.getByRole("tab", { name: "책 기록" }));

    expect(onChange).toHaveBeenCalledWith("book");
  });

  it("moves selection with arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CreamSegmented label="기록 분류" options={OPTIONS} value="session" onChange={onChange} />,
    );

    screen.getByRole("tab", { name: "모임 기록" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("book");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- cream-segmented
```
Expected: FAIL with "Cannot find module '@/shared/ui/readmates-cream/cream-segmented'".

- [ ] **Step 3: Implement CreamSegmented**

Create `front/shared/ui/readmates-cream/cream-segmented.tsx`:

```tsx
import { useId, type KeyboardEvent } from "react";

export type CreamSegmentedOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

type CreamSegmentedProps<TValue extends string = string> = {
  label: string;
  options: ReadonlyArray<CreamSegmentedOption<TValue>>;
  value: TValue;
  onChange: (next: TValue) => void;
  className?: string;
};

export function CreamSegmented<TValue extends string = string>({
  label,
  options,
  value,
  onChange,
  className,
}: CreamSegmentedProps<TValue>) {
  const tablistId = useId();
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    onChange(options[nextIndex].value);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      id={tablistId}
      className={className ? `cream-segmented ${className}` : "cream-segmented"}
      onKeyDown={handleKeyDown}
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        background: "var(--bg-sub)",
        borderRadius: 999,
        border: "1px solid var(--line-soft)",
      }}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.value)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              background: isSelected ? "var(--accent-primary)" : "transparent",
              color: isSelected ? "#FFFFFF" : "var(--text-2)",
              border: "1px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --dir front test -- cream-segmented
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/readmates-cream/cream-segmented.tsx front/tests/unit/cream-segmented.test.tsx
git commit -m "feat(ui): add CreamSegmented with keyboard nav"
```

---

## Task 4: CreamRecordCard

**Files:**
- Create: `front/shared/ui/readmates-cream/cream-record-card.tsx`
- Test: `front/tests/unit/cream-record-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `front/tests/unit/cream-record-card.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { CreamRecordCard } from "@/shared/ui/readmates-cream/cream-record-card";

afterEach(() => {
  cleanup();
});

function renderCard(props: Parameters<typeof CreamRecordCard>[0]) {
  return render(
    <MemoryRouter>
      <CreamRecordCard {...props} />
    </MemoryRouter>,
  );
}

describe("CreamRecordCard", () => {
  it("renders title, kind chip, date, and counts as a link", () => {
    renderCard({
      kind: "session",
      title: "4월 정기 모임",
      date: "2024.04.20",
      likeCount: 24,
      commentCount: 6,
      href: "/sessions/april",
    });

    const link = screen.getByRole("link", { name: /4월 정기 모임/ });
    expect(link).toHaveAttribute("href", "/sessions/april");
    expect(screen.getByText("모임 기록")).toBeVisible();
    expect(screen.getByText("2024.04.20")).toBeVisible();
    expect(screen.getByText("24")).toBeVisible();
    expect(screen.getByText("6")).toBeVisible();
  });

  it("falls back to a placeholder image when imageUrl is missing", () => {
    renderCard({
      kind: "note",
      title: "인상 깊은 문장들",
      date: "2024.04.15",
      likeCount: 18,
      commentCount: 3,
      href: "/notes/1",
    });

    expect(screen.getByText("생각 노트")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- cream-record-card
```
Expected: FAIL with module not found.

- [ ] **Step 3: Implement CreamRecordCard**

Create `front/shared/ui/readmates-cream/cream-record-card.tsx`:

```tsx
import { Link } from "react-router-dom";

export type CreamRecordKind = "session" | "book" | "note";

const KIND_LABEL: Record<CreamRecordKind, string> = {
  session: "모임 기록",
  book: "책 기록",
  note: "생각 노트",
};

const KIND_CHIP_STYLE: Record<CreamRecordKind, { background: string; color: string }> = {
  session: { background: "var(--accent-primary-soft)", color: "var(--accent-primary)" },
  book: { background: "var(--accent-secondary-soft)", color: "var(--accent-secondary)" },
  note: { background: "var(--bg-deep)", color: "var(--text-2)" },
};

type CreamRecordCardProps = {
  kind: CreamRecordKind;
  title: string;
  date: string;
  likeCount: number;
  commentCount: number;
  href: string;
  imageUrl?: string | null;
};

export function CreamRecordCard({
  kind,
  title,
  date,
  likeCount,
  commentCount,
  href,
  imageUrl,
}: CreamRecordCardProps) {
  const chip = KIND_CHIP_STYLE[kind];
  return (
    <Link
      to={href}
      className="cream-record-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        background: "var(--bg-raised)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-card)",
        boxShadow: "var(--shadow-card)",
        color: "var(--text)",
        textDecoration: "none",
      }}
    >
      <div
        aria-hidden
        style={{
          aspectRatio: "4 / 3",
          width: "100%",
          borderRadius: 10,
          background: imageUrl ? `center/cover no-repeat url(${JSON.stringify(imageUrl)})` : "var(--cream-200)",
        }}
      >
        {imageUrl ? <img src={imageUrl} alt="" style={{ display: "none" }} /> : null}
      </div>
      <span
        style={{
          alignSelf: "flex-start",
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 500,
          ...chip,
        }}
      >
        {KIND_LABEL[kind]}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "var(--text)",
          wordBreak: "keep-all",
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{date}</span>
      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-3)" }}>
        <span aria-label="좋아요 수" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span aria-hidden>♥</span>
          <span>{likeCount}</span>
        </span>
        <span aria-label="댓글 수" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span aria-hidden>💬</span>
          <span>{commentCount}</span>
        </span>
      </div>
    </Link>
  );
}
```

The hidden `<img>` is intentional: the test asserts no `<img role="img">` is in the document when no `imageUrl` is supplied; when an image IS supplied we still keep the rendered visual via background-image and the hidden `<img>` only ensures the URL is referenced for resource preloading. The test explicitly only covers the no-image case.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --dir front test -- cream-record-card
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/readmates-cream/cream-record-card.tsx front/tests/unit/cream-record-card.test.tsx
git commit -m "feat(ui): add CreamRecordCard"
```

---

## Task 5: CreamFeatureCard

**Files:**
- Create: `front/shared/ui/readmates-cream/cream-feature-card.tsx`
- Test: `front/tests/unit/cream-feature-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `front/tests/unit/cream-feature-card.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { CreamFeatureCard } from "@/shared/ui/readmates-cream/cream-feature-card";

afterEach(() => {
  cleanup();
});

function renderInRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("CreamFeatureCard", () => {
  it("renders the session variant with meta, title, and CTA", () => {
    renderInRouter(
      <CreamFeatureCard
        variant="session"
        eyebrow="다음 모임"
        meta="2024.05.18 (토) 20:00"
        title="소년이 온다"
        subtitle="진행 중 · 3/6 (회차)"
        action={{ label: "모임 상세 보기", href: "/sessions/next" }}
      />,
    );

    expect(screen.getByText("다음 모임")).toBeVisible();
    expect(screen.getByText("2024.05.18 (토) 20:00")).toBeVisible();
    expect(screen.getByRole("heading", { name: "소년이 온다" })).toBeVisible();
    expect(screen.getByText("진행 중 · 3/6 (회차)")).toBeVisible();
    expect(screen.getByRole("link", { name: /모임 상세 보기/ })).toHaveAttribute(
      "href",
      "/sessions/next",
    );
  });

  it("falls back to placeholder copy when no action is supplied", () => {
    renderInRouter(
      <CreamFeatureCard
        variant="book"
        eyebrow="현재 함께 읽는 책"
        meta="최은영"
        title="아주 희미한 빛으로도"
        subtitle="“희미한 빛으로도 우리는 서로를 발견할 수 있습니다.”"
      />,
    );

    expect(screen.getByText("현재 함께 읽는 책")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- cream-feature-card
```
Expected: FAIL.

- [ ] **Step 3: Implement CreamFeatureCard**

Create `front/shared/ui/readmates-cream/cream-feature-card.tsx`:

```tsx
import { Link } from "react-router-dom";
import { BookCover } from "@/shared/ui/book-cover";

export type CreamFeatureVariant = "session" | "book";

type CreamFeatureCardProps = {
  variant: CreamFeatureVariant;
  eyebrow: string;
  meta?: string;
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  imageUrl?: string | null;
  bookAuthor?: string | null;
};

export function CreamFeatureCard({
  variant,
  eyebrow,
  meta,
  title,
  subtitle,
  action,
  imageUrl,
  bookAuthor,
}: CreamFeatureCardProps) {
  return (
    <article
      className="surface cream-feature-card"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(96px, 36%) 1fr",
        gap: 18,
        padding: 16,
        background: "var(--bg-raised)",
        borderColor: "var(--line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center" }}>
        {variant === "book" ? (
          <BookCover title={title} author={bookAuthor} imageUrl={imageUrl} width="100%" />
        ) : (
          <div
            aria-hidden
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              borderRadius: 12,
              background: imageUrl
                ? `center/cover no-repeat url(${JSON.stringify(imageUrl)})`
                : "var(--cream-200)",
            }}
          />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <span className="cream-eyebrow">{eyebrow}</span>
        {meta ? (
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{meta}</span>
        ) : null}
        <h3
          className="cream-h2"
          style={{ fontSize: 20, marginTop: 4, color: "var(--text)" }}
        >
          {title}
        </h3>
        {subtitle ? (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "var(--text-2)",
              wordBreak: "keep-all",
            }}
          >
            {subtitle}
          </p>
        ) : null}
        {action ? (
          <Link
            to={action.href}
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: "flex-start", marginTop: 12 }}
          >
            {action.label} <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --dir front test -- cream-feature-card
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/readmates-cream/cream-feature-card.tsx front/tests/unit/cream-feature-card.test.tsx
git commit -m "feat(ui): add CreamFeatureCard for session and book variants"
```

---

## Task 6: CreamClubCard

**Files:**
- Create: `front/shared/ui/readmates-cream/cream-club-card.tsx`
- Test: `front/tests/unit/cream-club-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `front/tests/unit/cream-club-card.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CreamClubCard } from "@/shared/ui/readmates-cream/cream-club-card";

afterEach(() => {
  cleanup();
});

describe("CreamClubCard", () => {
  it("renders all key-value rows that are provided", () => {
    render(
      <CreamClubCard
        status={{ label: "온라인", tone: "secondary" }}
        name="읽는사이"
        description="책과 기록을 통해 더 나은 내일을 함께 만들어가는 공간"
        rows={[
          { key: "host", icon: "🧑", label: "호스트", value: "서온" },
          { key: "members", icon: "👥", label: "멤버 수", value: "1,248명" },
          { key: "founded", icon: "📅", label: "개설일", value: "2023.03.14" },
          { key: "records", icon: "📓", label: "누적 기록", value: "3,642개" },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "읽는사이" })).toBeVisible();
    expect(screen.getByText("온라인")).toBeVisible();
    expect(screen.getByText("호스트")).toBeVisible();
    expect(screen.getByText("서온")).toBeVisible();
    expect(screen.getByText("1,248명")).toBeVisible();
  });

  it("hides rows whose value is null", () => {
    render(
      <CreamClubCard
        status={{ label: "온라인", tone: "secondary" }}
        name="읽는사이"
        description=""
        rows={[
          { key: "host", icon: "🧑", label: "호스트", value: null },
          { key: "members", icon: "👥", label: "멤버 수", value: "12명" },
        ]}
      />,
    );

    expect(screen.queryByText("호스트")).toBeNull();
    expect(screen.getByText("멤버 수")).toBeVisible();
    expect(screen.getByText("12명")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- cream-club-card
```
Expected: FAIL.

- [ ] **Step 3: Implement CreamClubCard**

Create `front/shared/ui/readmates-cream/cream-club-card.tsx`:

```tsx
type StatusTone = "primary" | "secondary";

type ClubCardRow = {
  key: string;
  icon: string;
  label: string;
  value: string | null;
};

type CreamClubCardProps = {
  status: { label: string; tone: StatusTone };
  name: string;
  description: string;
  rows: ReadonlyArray<ClubCardRow>;
};

export function CreamClubCard({ status, name, description, rows }: CreamClubCardProps) {
  const statusColor =
    status.tone === "secondary" ? "var(--accent-secondary)" : "var(--accent-primary)";
  const statusBg =
    status.tone === "secondary" ? "var(--accent-secondary-soft)" : "var(--accent-primary-soft)";
  const visibleRows = rows.filter((row) => row.value !== null && row.value !== "");

  return (
    <aside
      className="surface cream-club-card"
      style={{
        background: "var(--bg-raised)",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="cream-h2" style={{ fontSize: 22 }}>
          {name}
        </h2>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            background: statusBg,
            color: statusColor,
            fontSize: 12,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: statusColor,
            }}
          />
          {status.label}
        </span>
      </div>
      {description ? (
        <p
          style={{
            margin: 0,
            color: "var(--text-2)",
            fontSize: 14,
            lineHeight: 1.6,
            wordBreak: "keep-all",
          }}
        >
          {description}
        </p>
      ) : null}
      {visibleRows.length > 0 ? (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            rowGap: 10,
            columnGap: 12,
            margin: 0,
            paddingTop: 10,
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          {visibleRows.map((row) => (
            <div key={row.key} style={{ display: "contents" }}>
              <dt aria-hidden style={{ color: "var(--text-3)" }}>
                {row.icon}
              </dt>
              <dt style={{ fontSize: 13, color: "var(--text-2)" }}>{row.label}</dt>
              <dd style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --dir front test -- cream-club-card
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/readmates-cream/cream-club-card.tsx front/tests/unit/cream-club-card.test.tsx
git commit -m "feat(ui): add CreamClubCard"
```

---

## Task 7: CreamHero

**Files:**
- Create: `front/shared/ui/readmates-cream/cream-hero.tsx`
- Test: `front/tests/unit/cream-hero.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `front/tests/unit/cream-hero.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { CreamHero } from "@/shared/ui/readmates-cream/cream-hero";

afterEach(() => {
  cleanup();
});

describe("CreamHero", () => {
  it("renders the headline, subhead, and primary CTA link", () => {
    render(
      <MemoryRouter>
        <CreamHero
          headline={["함께 읽고,", "기록하고, 나누어요"]}
          subhead="좋은 책을 함께 읽고, 생각을 기록하며, 서로의 기록을 나누는 클럽입니다."
          memberSummary={{ count: "1,248명", avatarLabels: ["A", "B", "C"] }}
          action={{ label: "클럽 설정", href: "/app/host" }}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: /함께 읽고,\s+기록하고, 나누어요/ }),
    ).toBeVisible();
    expect(screen.getByText("좋은 책을 함께 읽고, 생각을 기록하며, 서로의 기록을 나누는 클럽입니다.")).toBeVisible();
    expect(screen.getByText("멤버 1,248명")).toBeVisible();
    expect(screen.getByRole("link", { name: /클럽 설정/ })).toHaveAttribute("href", "/app/host");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- cream-hero
```
Expected: FAIL.

- [ ] **Step 3: Implement CreamHero**

Create `front/shared/ui/readmates-cream/cream-hero.tsx`:

```tsx
import { Link } from "react-router-dom";

type CreamHeroProps = {
  headline: ReadonlyArray<string>;
  subhead: string;
  memberSummary?: { count: string; avatarLabels: ReadonlyArray<string> };
  action: { label: string; href: string };
  imageUrl?: string | null;
  imageAlt?: string;
};

export function CreamHero({
  headline,
  subhead,
  memberSummary,
  action,
  imageUrl,
  imageAlt,
}: CreamHeroProps) {
  return (
    <section
      className="surface cream-hero"
      style={{
        background: "var(--cream-100)",
        borderColor: "var(--line-soft)",
        padding: "32px 32px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 540 }}>
        <h1 className="cream-display" style={{ margin: 0 }}>
          {headline.map((line, index) => (
            <span key={index} style={{ display: "block" }}>
              {line}
            </span>
          ))}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--text-2)",
            wordBreak: "keep-all",
          }}
        >
          {subhead}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {memberSummary ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden style={{ display: "inline-flex" }}>
                {memberSummary.avatarLabels.map((label, index) => (
                  <span
                    key={index}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: "var(--cream-300)",
                      border: "2px solid var(--cream-50)",
                      marginLeft: index === 0 ? 0 : -10,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--accent-secondary)",
                    }}
                  >
                    {label}
                  </span>
                ))}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                멤버 {memberSummary.count}
              </span>
            </span>
          ) : null}
          <Link to={action.href} className="btn btn-primary">
            {action.label}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
      <div
        aria-hidden={imageAlt ? undefined : true}
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 12,
          background: imageUrl
            ? `center/cover no-repeat url(${JSON.stringify(imageUrl)})`
            : "var(--cream-200)",
        }}
      >
        {imageUrl && imageAlt ? (
          <img src={imageUrl} alt={imageAlt} style={{ display: "none" }} />
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --dir front test -- cream-hero
```
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/readmates-cream/cream-hero.tsx front/tests/unit/cream-hero.test.tsx
git commit -m "feat(ui): add CreamHero"
```

---

## Task 8: CreamCtaBanner

**Files:**
- Create: `front/shared/ui/readmates-cream/cream-cta-banner.tsx`
- Test: `front/tests/unit/cream-cta-banner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `front/tests/unit/cream-cta-banner.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { CreamCtaBanner } from "@/shared/ui/readmates-cream/cream-cta-banner";

afterEach(() => {
  cleanup();
});

describe("CreamCtaBanner", () => {
  it("renders the headline, sub copy, and CTA link", () => {
    render(
      <MemoryRouter>
        <CreamCtaBanner
          title="당신의 기록이 누군가의 내일이 될 수 있어요"
          description="읽고, 기록하고, 나누는 여정에 함께하세요."
          action={{ label: "클럽에 기록 남기기", href: "/app/notes/new" }}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /당신의 기록이 누군가의 내일이 될 수 있어요/ }),
    ).toBeVisible();
    expect(screen.getByText(/읽고, 기록하고/)).toBeVisible();
    expect(screen.getByRole("link", { name: /클럽에 기록 남기기/ })).toHaveAttribute(
      "href",
      "/app/notes/new",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- cream-cta-banner
```
Expected: FAIL.

- [ ] **Step 3: Implement CreamCtaBanner**

Create `front/shared/ui/readmates-cream/cream-cta-banner.tsx`:

```tsx
import { Link } from "react-router-dom";

type CreamCtaBannerProps = {
  title: string;
  description: string;
  action: { label: string; href: string };
};

export function CreamCtaBanner({ title, description, action }: CreamCtaBannerProps) {
  return (
    <section
      className="surface cream-cta-banner"
      style={{
        background: "var(--cream-200)",
        borderColor: "var(--line-soft)",
        padding: "28px 32px",
        display: "flex",
        gap: 24,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 className="cream-h2">{title}</h2>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--text-2)",
            wordBreak: "keep-all",
          }}
        >
          {description}
        </p>
      </div>
      <Link to={action.href} className="btn btn-primary">
        {action.label}
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --dir front test -- cream-cta-banner
```
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/readmates-cream/cream-cta-banner.tsx front/tests/unit/cream-cta-banner.test.tsx
git commit -m "feat(ui): add CreamCtaBanner"
```

---

## Task 9: CreamMobileHeader, CreamNavDrawer, CreamTopNav

**Files:**
- Create: `front/shared/ui/readmates-cream/cream-mobile-header.tsx`
- Create: `front/shared/ui/readmates-cream/cream-nav-drawer.tsx`
- Create: `front/shared/ui/readmates-cream/cream-top-nav.tsx`
- Test: `front/tests/unit/cream-top-nav.test.tsx`

The test covers `CreamTopNav` only. The mobile header + drawer are visually verified in Task 16's manual review and indirectly in the e2e smoke (Task 13).

- [ ] **Step 1: Write the failing test for CreamTopNav**

Create `front/tests/unit/cream-top-nav.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { CreamTopNav } from "@/shared/ui/readmates-cream/cream-top-nav";

afterEach(() => {
  cleanup();
});

const NAV_LINKS = [
  { label: "소개", href: "/about" },
  { label: "읽는사이", href: "/" },
  { label: "공개 기록", href: "/records" },
];

describe("CreamTopNav", () => {
  it("shows a login button for guests", () => {
    render(
      <MemoryRouter>
        <CreamTopNav navLinks={NAV_LINKS} authState={{ kind: "guest" }} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("알림")).toBeNull();
  });

  it("shows the bell and profile pill for members", () => {
    render(
      <MemoryRouter>
        <CreamTopNav
          navLinks={NAV_LINKS}
          authState={{ kind: "member", displayName: "김읽는님" }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("알림")).toBeVisible();
    expect(screen.getByText("김읽는님")).toBeVisible();
    expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
  });

  it("renders all nav links", () => {
    render(
      <MemoryRouter>
        <CreamTopNav navLinks={NAV_LINKS} authState={{ kind: "guest" }} />
      </MemoryRouter>,
    );

    NAV_LINKS.forEach((link) => {
      expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- cream-top-nav
```
Expected: FAIL.

- [ ] **Step 3: Implement the three nav components**

Create `front/shared/ui/readmates-cream/cream-nav-drawer.tsx`:

```tsx
import { useEffect } from "react";
import { Link } from "react-router-dom";

export type CreamNavLink = { label: string; href: string };

type CreamNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  navLinks: ReadonlyArray<CreamNavLink>;
};

export function CreamNavDrawer({ open, onClose, navLinks }: CreamNavDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="메뉴"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14, 37, 64, 0.32)",
        zIndex: 60,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "min(320px, 86vw)",
          height: "100%",
          background: "var(--bg)",
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="메뉴 닫기"
          style={{
            alignSelf: "flex-end",
            padding: 8,
            color: "var(--text-2)",
          }}
        >
          ✕
        </button>
        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              onClick={onClose}
              style={{
                padding: "12px 8px",
                fontSize: 16,
                color: "var(--text)",
                borderRadius: 8,
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
```

Create `front/shared/ui/readmates-cream/cream-mobile-header.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { CreamBrandMark } from "./cream-brand-mark";
import { CreamNavDrawer, type CreamNavLink } from "./cream-nav-drawer";

export type CreamAuthState =
  | { kind: "guest" }
  | { kind: "member"; displayName: string };

type CreamMobileHeaderProps = {
  navLinks: ReadonlyArray<CreamNavLink>;
  authState: CreamAuthState;
};

export function CreamMobileHeader({ navLinks, authState }: CreamMobileHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        background: "var(--bg)",
        borderBottom: "1px solid var(--line-soft)",
        zIndex: 30,
      }}
    >
      <div
        className="cream-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 60,
        }}
      >
        <Link to="/" aria-label="ReadMates 홈" style={{ display: "inline-flex" }}>
          <CreamBrandMark size="sm" />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            aria-label="검색"
            style={{ width: 36, height: 36, color: "var(--text-2)" }}
          >
            🔍
          </button>
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setDrawerOpen(true)}
            style={{ width: 36, height: 36, color: "var(--text-2)" }}
          >
            ☰
          </button>
          {authState.kind === "guest" ? (
            <Link
              to="/login"
              className="btn btn-primary btn-sm"
              style={{ height: 32, padding: "0 12px" }}
            >
              로그인
            </Link>
          ) : (
            <span
              aria-label={`${authState.displayName} 프로필`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: "var(--cream-300)",
                color: "var(--accent-secondary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {authState.displayName.slice(0, 1)}
            </span>
          )}
        </div>
      </div>
      <CreamNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        navLinks={navLinks}
      />
    </header>
  );
}
```

Create `front/shared/ui/readmates-cream/cream-top-nav.tsx`:

```tsx
import { Link, NavLink } from "react-router-dom";
import { CreamBrandMark } from "./cream-brand-mark";
import type { CreamAuthState } from "./cream-mobile-header";
import type { CreamNavLink } from "./cream-nav-drawer";

type CreamTopNavProps = {
  navLinks: ReadonlyArray<CreamNavLink>;
  authState: CreamAuthState;
};

export function CreamTopNav({ navLinks, authState }: CreamTopNavProps) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        background: "var(--bg)",
        borderBottom: "1px solid var(--line-soft)",
        zIndex: 30,
      }}
    >
      <div
        className="cream-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 72,
          gap: 24,
        }}
      >
        <Link to="/" aria-label="ReadMates 홈" style={{ display: "inline-flex" }}>
          <CreamBrandMark size="md" />
        </Link>
        <nav aria-label="주요 영역" style={{ display: "flex", gap: 24 }}>
          {navLinks.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              style={({ isActive }) => ({
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "var(--text)" : "var(--text-2)",
              })}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="search"
            placeholder="기록 또는 책 검색"
            aria-label="기록 또는 책 검색"
            disabled
            style={{
              width: 240,
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid var(--line)",
              background: "var(--bg-sub)",
              color: "var(--text-2)",
              fontSize: 13,
            }}
          />
          {authState.kind === "guest" ? (
            <Link to="/login" className="btn btn-primary btn-sm">
              로그인
            </Link>
          ) : (
            <>
              <button
                type="button"
                aria-label="알림"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  color: "var(--text-2)",
                  background: "var(--bg-sub)",
                }}
              >
                🔔
              </button>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 10px 4px 4px",
                  borderRadius: 999,
                  background: "var(--bg-sub)",
                  border: "1px solid var(--line-soft)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: "var(--cream-300)",
                    color: "var(--accent-secondary)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {authState.displayName.slice(0, 1)}
                </span>
                <span style={{ fontSize: 13, color: "var(--text)" }}>
                  {authState.displayName}
                </span>
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --dir front test -- cream-top-nav
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/readmates-cream/cream-mobile-header.tsx \
        front/shared/ui/readmates-cream/cream-nav-drawer.tsx \
        front/shared/ui/readmates-cream/cream-top-nav.tsx \
        front/tests/unit/cream-top-nav.test.tsx
git commit -m "feat(ui): add CreamTopNav, CreamMobileHeader, CreamNavDrawer"
```

---

## Task 10: Landing display model

**Files:**
- Create: `front/features/public/model/landing-display-model.ts`
- Test: `front/tests/unit/landing-display-model.test.ts`

This module maps `PublicClubResponse` (the existing public-club API contract) into a stable view-model for the landing UI, with explicit empty-state branches for fields the backend does not yet return (`host`, `foundedAt`, `recordCount`, `nextSession`, `currentBook`, kinded `records`). It is a pure function — no React, no fetch, no router — so it lives under `features/public/model/`.

- [ ] **Step 1: Write the failing test**

Create `front/tests/unit/landing-display-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  toLandingViewModel,
  type LandingViewModel,
} from "@/features/public/model/landing-display-model";
import type { PublicClubResponse } from "@/features/public/api/public-contracts";

const BASE_RESPONSE: PublicClubResponse = {
  clubName: "읽는사이",
  tagline: "함께 읽고, 기록하고, 나누어요",
  about: "책과 기록을 통해 더 나은 내일을 함께 만들어가는 공간",
  stats: { sessions: 24, books: 18, members: 1248 },
  recentSessions: [
    {
      sessionId: "s-april",
      sessionNumber: 12,
      bookTitle: "소년이 온다",
      bookAuthor: "한강",
      bookImageUrl: null,
      date: "2024.04.20",
      summary: "광주의 봄, 우리가 다시 마주한 질문들",
      highlightCount: 8,
      oneLinerCount: 6,
    },
    {
      sessionId: "s-may",
      sessionNumber: 11,
      bookTitle: "아주 희미한 빛으로도",
      bookAuthor: "최은영",
      bookImageUrl: null,
      date: "2024.04.10",
      summary: "희미한 빛으로도 우리는 서로를 발견할 수 있다",
      highlightCount: 5,
      oneLinerCount: 3,
    },
  ],
};

describe("toLandingViewModel", () => {
  it("maps club identity, member count, and tagline", () => {
    const view: LandingViewModel = toLandingViewModel(BASE_RESPONSE);

    expect(view.club.name).toBe("읽는사이");
    expect(view.club.description).toBe("책과 기록을 통해 더 나은 내일을 함께 만들어가는 공간");
    expect(view.club.memberCountLabel).toBe("1,248명");
  });

  it("derives current book and next session from the most recent session as a fallback", () => {
    const view = toLandingViewModel(BASE_RESPONSE);

    expect(view.currentBook).toEqual({
      title: "소년이 온다",
      author: "한강",
      coverUrl: null,
      summary: "광주의 봄, 우리가 다시 마주한 질문들",
    });
    expect(view.nextSession).toBeNull();
  });

  it("returns empty record items when there are no recent sessions", () => {
    const view = toLandingViewModel({ ...BASE_RESPONSE, recentSessions: [] });

    expect(view.records.items).toEqual([]);
    expect(view.currentBook).toBeNull();
  });

  it("emits records as session-kind cards derived from recent sessions", () => {
    const view = toLandingViewModel(BASE_RESPONSE);

    expect(view.records.items).toHaveLength(2);
    expect(view.records.items[0]).toMatchObject({
      kind: "session",
      title: "소년이 온다",
      date: "2024.04.20",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- landing-display-model
```
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the display model**

Create `front/features/public/model/landing-display-model.ts`:

```ts
import type {
  PublicClubResponse,
  PublicSessionListItem,
} from "@/features/public/api/public-contracts";

export type LandingRecordKind = "session" | "book" | "note";

export type LandingRecordItem = {
  id: string;
  kind: LandingRecordKind;
  title: string;
  date: string;
  likeCount: number;
  commentCount: number;
  href: string;
  imageUrl: string | null;
};

export type LandingViewModel = {
  club: {
    name: string;
    description: string;
    statusLabel: string;
    memberCountLabel: string;
    recordCountLabel: string | null;
    foundedAtLabel: string | null;
    hostLabel: string | null;
  };
  nextSession: null;
  currentBook:
    | {
        title: string;
        author: string;
        coverUrl: string | null;
        summary: string;
      }
    | null;
  records: {
    items: ReadonlyArray<LandingRecordItem>;
    total: number;
  };
};

function formatCount(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}명`;
}

function sessionToRecord(session: PublicSessionListItem): LandingRecordItem {
  return {
    id: session.sessionId,
    kind: "session",
    title: session.bookTitle,
    date: session.date,
    likeCount: session.highlightCount,
    commentCount: session.oneLinerCount,
    href: `/sessions/${encodeURIComponent(session.sessionId)}`,
    imageUrl: session.bookImageUrl,
  };
}

export function toLandingViewModel(response: PublicClubResponse): LandingViewModel {
  const latest = response.recentSessions[0] ?? null;

  return {
    club: {
      name: response.clubName,
      description: response.about,
      statusLabel: "온라인",
      memberCountLabel: formatCount(response.stats.members),
      recordCountLabel: null,
      foundedAtLabel: null,
      hostLabel: null,
    },
    nextSession: null,
    currentBook: latest
      ? {
          title: latest.bookTitle,
          author: latest.bookAuthor,
          coverUrl: latest.bookImageUrl,
          summary: latest.summary,
        }
      : null,
    records: {
      items: response.recentSessions.map(sessionToRecord),
      total: response.recentSessions.length,
    },
  };
}
```

The `nextSession` and the kinded record categories (`book`, `note`) intentionally stay null/empty in v1 — backend extensions are tracked as follow-ups. Keep this comment in your follow-up notes:

> follow-up: extend public-club API with `host`, `foundedAt`, `recordCount`, `nextSession`, kinded `records` previews; widen `toLandingViewModel` accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --dir front test -- landing-display-model
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add front/features/public/model/landing-display-model.ts front/tests/unit/landing-display-model.test.ts
git commit -m "feat(public): add landing display model with empty-state fallbacks"
```

---

## Task 11: Landing loader

**Files:**
- Create: `front/features/public/route/landing-route-data.ts`

The loader is a thin wrapper around the existing `publicClubLoader`. We preserve its return shape (`PublicClubRouteData`) so route-level error boundaries keep working unchanged. The view-model derivation happens at render time inside `landing-route.tsx`.

- [ ] **Step 1: Implement the loader**

Create `front/features/public/route/landing-route-data.ts`:

```ts
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  publicClubLoader,
  type PublicClubRouteData,
} from "@/features/public/route/public-route-data";

export type LandingRouteData = PublicClubRouteData;

export async function landingLoader(args: LoaderFunctionArgs): Promise<LandingRouteData> {
  return publicClubLoader(args);
}
```

(No test for this — it is one statement of delegation. Behavior is covered by `publicClubLoader` tests where they exist, and by the integration test in Task 12.)

- [ ] **Step 2: Verify build still passes**

Run:
```bash
pnpm --dir front build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add front/features/public/route/landing-route-data.ts
git commit -m "feat(public): add landing route loader"
```

---

## Task 12: Landing page composition + route element

**Files:**
- Create: `front/features/public/ui/landing-sections/landing-hero-section.tsx`
- Create: `front/features/public/ui/landing-sections/landing-now-reading-section.tsx`
- Create: `front/features/public/ui/landing-sections/landing-records-section.tsx`
- Create: `front/features/public/ui/landing-sections/landing-cta-section.tsx`
- Create: `front/features/public/ui/landing-page.tsx`
- Create: `front/features/public/route/landing-route.tsx`
- Test: `front/tests/unit/landing-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `front/tests/unit/landing-page.test.tsx`:

```tsx
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { LandingPage } from "@/features/public/ui/landing-page";
import type { LandingViewModel } from "@/features/public/model/landing-display-model";

const VIEW: LandingViewModel = {
  club: {
    name: "읽는사이",
    description: "책과 기록을 통해 더 나은 내일을 함께 만들어가는 공간",
    statusLabel: "온라인",
    memberCountLabel: "1,248명",
    recordCountLabel: null,
    foundedAtLabel: null,
    hostLabel: null,
  },
  nextSession: null,
  currentBook: {
    title: "아주 희미한 빛으로도",
    author: "최은영",
    coverUrl: null,
    summary: "희미한 빛으로도 우리는 서로를 발견할 수 있습니다.",
  },
  records: {
    items: [
      {
        id: "r1",
        kind: "session",
        title: "4월 정기 모임",
        date: "2024.04.20",
        likeCount: 24,
        commentCount: 6,
        href: "/sessions/r1",
        imageUrl: null,
      },
    ],
    total: 1,
  },
};

afterEach(() => {
  cleanup();
});

function renderPage(authState: Parameters<typeof LandingPage>[0]["authState"]) {
  return render(
    <MemoryRouter>
      <LandingPage view={VIEW} authState={authState} />
    </MemoryRouter>,
  );
}

describe("LandingPage", () => {
  it("renders hero, club card, current book card, records, and CTA for guests", () => {
    renderPage({ kind: "guest" });

    expect(
      screen.getByRole("heading", { level: 1, name: /함께 읽고/ }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "읽는사이" })).toBeVisible();
    expect(screen.getByText(/현재 함께 읽는 책/)).toBeVisible();
    expect(screen.getByText("아주 희미한 빛으로도")).toBeVisible();
    expect(screen.getByRole("link", { name: /4월 정기 모임/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /ReadMates 시작하기/ })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("renders the member CTA when logged in", () => {
    renderPage({ kind: "member", displayName: "김읽는님" });

    expect(screen.getByRole("link", { name: /클럽에 기록 남기기/ })).toBeVisible();
  });

  it("shows next-session empty copy when nextSession is null", () => {
    renderPage({ kind: "guest" });

    expect(screen.getByText(/다음 모임이 정해지면 안내드릴게요/)).toBeVisible();
  });

  it("shows empty-records copy when records.items is empty", () => {
    render(
      <MemoryRouter>
        <LandingPage
          view={{ ...VIEW, records: { items: [], total: 0 } }}
          authState={{ kind: "guest" }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/아직 함께 남긴 기록이 없어요/)).toBeVisible();
  });

  it("scopes the cream surface via data-surface on the root", () => {
    const { container } = renderPage({ kind: "guest" });
    const root = container.querySelector('[data-surface="readmates-cream"]');
    expect(root).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --dir front test -- landing-page
```
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the hero section**

Create `front/features/public/ui/landing-sections/landing-hero-section.tsx`:

```tsx
import { CreamHero } from "@/shared/ui/readmates-cream/cream-hero";
import { CreamClubCard } from "@/shared/ui/readmates-cream/cream-club-card";
import type { LandingViewModel } from "@/features/public/model/landing-display-model";

type LandingAuthState =
  | { kind: "guest" }
  | { kind: "member"; displayName: string };

type Props = {
  view: LandingViewModel;
  authState: LandingAuthState;
};

export function LandingHeroSection({ view, authState }: Props) {
  const heroAction =
    authState.kind === "guest"
      ? { label: "로그인하고 함께하기", href: "/login" }
      : { label: "내 공간으로", href: "/app" };

  const rows = [
    { key: "host", icon: "🧑", label: "호스트", value: view.club.hostLabel },
    { key: "members", icon: "👥", label: "멤버 수", value: view.club.memberCountLabel },
    { key: "founded", icon: "📅", label: "개설일", value: view.club.foundedAtLabel },
    { key: "records", icon: "📓", label: "누적 기록", value: view.club.recordCountLabel },
  ];

  return (
    <section
      className="cream-section"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 24,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 24,
          alignItems: "stretch",
        }}
        className="cream-hero-grid"
      >
        <CreamHero
          headline={["함께 읽고,", "기록하고, 나누어요"]}
          subhead="좋은 책을 함께 읽고, 생각을 기록하며, 서로의 기록을 나누는 클럽입니다."
          memberSummary={{
            count: view.club.memberCountLabel,
            avatarLabels: ["A", "B", "C"],
          }}
          action={heroAction}
        />
        <CreamClubCard
          status={{ label: view.club.statusLabel, tone: "secondary" }}
          name={view.club.name}
          description={view.club.description}
          rows={rows}
        />
      </div>
    </section>
  );
}
```

Append once-only responsive rule to `front/shared/styles/readmates-cream.css` so the hero grid stacks on tablet:

```css
@media (max-width: 1023px) {
  [data-surface="readmates-cream"] .cream-hero-grid {
    grid-template-columns: 1fr;
  }
}
```

(Add this block at the end of the file.)

- [ ] **Step 4: Implement the now-reading section**

Create `front/features/public/ui/landing-sections/landing-now-reading-section.tsx`:

```tsx
import { CreamFeatureCard } from "@/shared/ui/readmates-cream/cream-feature-card";
import type { LandingViewModel } from "@/features/public/model/landing-display-model";

type Props = { view: LandingViewModel };

export function LandingNowReadingSection({ view }: Props) {
  return (
    <section
      className="cream-section cream-now-reading-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
      }}
    >
      {view.nextSession ? null : (
        <CreamFeatureCard
          variant="session"
          eyebrow="다음 모임"
          title="다음 모임이 정해지면 안내드릴게요"
          subtitle="확정되는 대로 이곳에서 일정과 책을 만나볼 수 있어요."
        />
      )}
      {view.currentBook ? (
        <CreamFeatureCard
          variant="book"
          eyebrow="현재 함께 읽는 책"
          meta={view.currentBook.author}
          title={view.currentBook.title}
          subtitle={`“${view.currentBook.summary}”`}
          imageUrl={view.currentBook.coverUrl}
          bookAuthor={view.currentBook.author}
        />
      ) : (
        <CreamFeatureCard
          variant="book"
          eyebrow="현재 함께 읽는 책"
          title="다음 책을 고르고 있어요"
        />
      )}
    </section>
  );
}
```

Append to `readmates-cream.css`:

```css
@media (max-width: 767px) {
  [data-surface="readmates-cream"] .cream-now-reading-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Implement the records section**

Create `front/features/public/ui/landing-sections/landing-records-section.tsx`:

```tsx
import { useState } from "react";
import { CreamSegmented } from "@/shared/ui/readmates-cream/cream-segmented";
import { CreamRecordCard } from "@/shared/ui/readmates-cream/cream-record-card";
import type { LandingRecordKind, LandingViewModel } from "@/features/public/model/landing-display-model";

type Props = { view: LandingViewModel };

const FILTERS: ReadonlyArray<{ value: "all" | LandingRecordKind; label: string }> = [
  { value: "all", label: "전체" },
  { value: "session", label: "모임 기록" },
  { value: "book", label: "책 기록" },
  { value: "note", label: "생각 노트" },
];

export function LandingRecordsSection({ view }: Props) {
  const [filter, setFilter] = useState<"all" | LandingRecordKind>("all");
  const items = filter === "all" ? view.records.items : view.records.items.filter((item) => item.kind === filter);

  return (
    <section className="cream-section">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <h2 className="cream-h2">함께 남긴 기록</h2>
        <CreamSegmented
          label="기록 분류"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />
      </div>
      {items.length === 0 ? (
        <div
          className="surface-quiet"
          style={{
            padding: "32px 24px",
            background: "var(--cream-100)",
            borderColor: "var(--line-soft)",
            color: "var(--text-2)",
            textAlign: "center",
          }}
        >
          아직 함께 남긴 기록이 없어요.
        </div>
      ) : (
        <div className="cream-records-grid">
          {items.map((item) => (
            <CreamRecordCard key={item.id} {...item} />
          ))}
        </div>
      )}
    </section>
  );
}
```

Append to `readmates-cream.css`:

```css
[data-surface="readmates-cream"] .cream-records-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1023px) {
  [data-surface="readmates-cream"] .cream-records-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  [data-surface="readmates-cream"] .cream-records-grid {
    grid-auto-flow: column;
    grid-auto-columns: min(64vw, 240px);
    grid-template-columns: none;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding-bottom: 8px;
  }
  [data-surface="readmates-cream"] .cream-records-grid > * {
    scroll-snap-align: start;
  }
}
```

- [ ] **Step 6: Implement the CTA section**

Create `front/features/public/ui/landing-sections/landing-cta-section.tsx`:

```tsx
import { CreamCtaBanner } from "@/shared/ui/readmates-cream/cream-cta-banner";

type LandingAuthState =
  | { kind: "guest" }
  | { kind: "member"; displayName: string };

type Props = { authState: LandingAuthState };

export function LandingCtaSection({ authState }: Props) {
  const action =
    authState.kind === "guest"
      ? { label: "ReadMates 시작하기", href: "/login" }
      : { label: "클럽에 기록 남기기", href: "/app/notes/new" };

  return (
    <section className="cream-section">
      <CreamCtaBanner
        title="당신의 기록이 누군가의 내일이 될 수 있어요"
        description="읽고, 기록하고, 나누는 여정에 함께하세요."
        action={action}
      />
    </section>
  );
}
```

- [ ] **Step 7: Implement the page composer**

Create `front/features/public/ui/landing-page.tsx`:

```tsx
import { CreamTopNav } from "@/shared/ui/readmates-cream/cream-top-nav";
import { CreamMobileHeader } from "@/shared/ui/readmates-cream/cream-mobile-header";
import { LandingHeroSection } from "./landing-sections/landing-hero-section";
import { LandingNowReadingSection } from "./landing-sections/landing-now-reading-section";
import { LandingRecordsSection } from "./landing-sections/landing-records-section";
import { LandingCtaSection } from "./landing-sections/landing-cta-section";
import type { LandingViewModel } from "@/features/public/model/landing-display-model";

export type LandingAuthState =
  | { kind: "guest" }
  | { kind: "member"; displayName: string };

const NAV_LINKS = [
  { label: "소개", href: "/about" },
  { label: "읽는사이", href: "/" },
  { label: "공개 기록", href: "/records" },
] as const;

type LandingPageProps = {
  view: LandingViewModel;
  authState: LandingAuthState;
};

export function LandingPage({ view, authState }: LandingPageProps) {
  return (
    <div data-surface="readmates-cream" className="cream-page">
      <div className="cream-top-nav-wrap">
        <CreamTopNav navLinks={NAV_LINKS} authState={authState} />
      </div>
      <div className="cream-mobile-header-wrap">
        <CreamMobileHeader navLinks={NAV_LINKS} authState={authState} />
      </div>
      <main className="cream-container" style={{ paddingTop: 32 }}>
        <LandingHeroSection view={view} authState={authState} />
        <LandingNowReadingSection view={view} />
        <LandingRecordsSection view={view} />
        <LandingCtaSection authState={authState} />
      </main>
    </div>
  );
}
```

Append to `readmates-cream.css`:

```css
[data-surface="readmates-cream"] .cream-mobile-header-wrap {
  display: none;
}

@media (max-width: 767px) {
  [data-surface="readmates-cream"] .cream-top-nav-wrap {
    display: none;
  }
  [data-surface="readmates-cream"] .cream-mobile-header-wrap {
    display: block;
  }
}
```

- [ ] **Step 8: Implement the route element**

Create `front/features/public/route/landing-route.tsx`:

```tsx
import { useLoaderData } from "react-router-dom";
import { useAuth } from "@/src/app/auth-state";
import { toLandingViewModel } from "@/features/public/model/landing-display-model";
import type { LandingRouteData } from "./landing-route-data";
import { LandingPage, type LandingAuthState } from "@/features/public/ui/landing-page";

export function LandingRoute() {
  const data = useLoaderData() as LandingRouteData;
  const auth = useAuth();
  const view = toLandingViewModel(data);
  const authState: LandingAuthState =
    auth.status === "ready" && auth.auth.authenticated && auth.auth.displayName
      ? { kind: "member", displayName: auth.auth.displayName }
      : { kind: "guest" };

  return <LandingPage view={view} authState={authState} />;
}
```

- [ ] **Step 9: Run test to verify everything passes**

Run:
```bash
pnpm --dir front test -- landing-page
```
Expected: 5 tests pass.

Then run the full unit suite to confirm no regression elsewhere:
```bash
pnpm --dir front test
```
Expected: previous suites still pass.

- [ ] **Step 10: Commit**

```bash
git add front/features/public/ui/landing-page.tsx \
        front/features/public/ui/landing-sections/ \
        front/features/public/route/landing-route.tsx \
        front/shared/styles/readmates-cream.css \
        front/tests/unit/landing-page.test.tsx
git commit -m "feat(public): compose cream landing page with sections"
```

---

## Task 13: Wire the new route into the router

**Files:**
- Modify: `front/src/app/router.tsx`
- Modify: `front/src/pages/public-home.tsx`

The router currently maps `/` to `<PublicHomePage />` with `publicClubLoader`. We replace just that route. `/clubs/:clubSlug` continues to use the old `PublicHomePage`.

- [ ] **Step 1: Update the page module to re-export the new route**

Open `front/src/pages/public-home.tsx`. The current single line is:

```tsx
export { PublicHomeRoute as default } from "@/features/public/route/public-home-route";
```

Replace with:

```tsx
export { LandingRoute as default } from "@/features/public/route/landing-route";
```

- [ ] **Step 2: Update the router**

Open `front/src/app/router.tsx`. Find the import of `PublicHomePage`:

```tsx
import PublicHomePage from "@/src/pages/public-home";
```

Add a sibling import directly below it:

```tsx
import { landingLoader } from "@/features/public/route/landing-route-data";
```

Find the route definition for `/`:

```tsx
{
  path: "/",
  element: <PublicHomePage />,
  loader: publicClubLoader,
  errorElement: <PublicRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="공개 홈을 불러오는 중" variant="public" />,
},
```

Replace it with:

```tsx
{
  path: "/",
  element: <PublicHomePage />,
  loader: landingLoader,
  errorElement: <PublicRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="홈을 불러오는 중" variant="public" />,
},
```

The `PublicHomePage` symbol now resolves to `LandingRoute` (because of Step 1). The `/clubs/:clubSlug` route uses a different module path (`features/public/ui/public-home`) and is unaffected — but verify by grepping:

```bash
grep -n 'public-home-route\|public-home"' front/src/app/router.tsx
```

The grep should show `/clubs/:clubSlug` still pointing at the OLD `PublicHomePage` reference. If both `/` and `/clubs/:clubSlug` use the same `PublicHomePage` import, we need to swap `/clubs/:clubSlug` to import the legacy route directly. Check the existing route table:

If `/clubs/:clubSlug` previously read `element: <PublicHomePage />`, change ITS imports so that legacy entries still see the legacy component. Add a separate import for the legacy component at the top:

```tsx
import { PublicHomeRoute as LegacyPublicHome } from "@/features/public/route/public-home-route";
```

And replace EVERY non-`/` use of `<PublicHomePage />` in this file with `<LegacyPublicHome />`. After this change, `<PublicHomePage />` is only used at `/`.

- [ ] **Step 3: Run unit tests**

Run:
```bash
pnpm --dir front test
```
Expected: all suites pass.

- [ ] **Step 4: Run lint and build**

Run:
```bash
pnpm --dir front lint
pnpm --dir front build
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add front/src/app/router.tsx front/src/pages/public-home.tsx
git commit -m "feat(router): serve cream landing on / route"
```

---

## Task 14: E2E smoke test

**Files:**
- Create: `front/tests/e2e/cream-landing-smoke.spec.ts`

The e2e suite already provisions a backend with seeded data. We add one short spec that loads `/` and asserts the landing structure renders.

- [ ] **Step 1: Write the e2e spec**

Create `front/tests/e2e/cream-landing-smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("cream landing", () => {
  test("renders headline, club card, records, and CTA at /", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("함께 읽고");
    await expect(page.getByRole("heading", { name: /읽는사이/ })).toBeVisible();
    await expect(page.getByText(/현재 함께 읽는 책/)).toBeVisible();
    await expect(page.getByText(/함께 남긴 기록/)).toBeVisible();
    await expect(page.getByRole("link", { name: /ReadMates 시작하기/ })).toBeVisible();
  });

  test("scopes the cream surface only to the landing page", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('[data-surface="readmates-cream"]')).toHaveCount(1);

    await page.goto("/login");

    await expect(page.locator('[data-surface="readmates-cream"]')).toHaveCount(0);
  });

  test("shows horizontal record rail on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const grid = page.locator(".cream-records-grid").first();
    await expect(grid).toBeVisible();
    const overflowX = await grid.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe("auto");
  });
});
```

- [ ] **Step 2: Run the e2e spec**

Run:
```bash
pnpm --dir front test:e2e -- cream-landing-smoke
```
Expected: 3 tests pass. (The webServer setup may take 1–4 minutes to spin up the API, MySQL, and Vite — see `playwright.config.ts`.)

If the tests fail because the seeded club name is not "읽는사이", adjust the assertion to match the seeded `clubName` returned by the dev API. Inspect the data once with:
```bash
curl -sS http://localhost:3100/api/bff/api/public/clubs/readmates | jq .clubName
```
and update the test if needed.

- [ ] **Step 3: Commit**

```bash
git add front/tests/e2e/cream-landing-smoke.spec.ts
git commit -m "test(e2e): smoke landing renders and cream scope is bounded"
```

---

## Task 15: Update design.md

**Files:**
- Modify: `docs/agents/design.md`

- [ ] **Step 1: Append the cream surface paragraph**

Open `docs/agents/design.md`. After the existing "Avoid:" list, before the "Interaction and accessibility:" section, insert this paragraph:

```markdown
The public landing at `/` runs on a scoped subsystem named `readmates-cream`. It activates only inside elements carrying `data-surface="readmates-cream"` and lives in `front/shared/styles/readmates-cream.css` plus `front/shared/ui/readmates-cream/`. Cream tokens (FAF7F8 / F2EFE8 / E7EDE6 / DCE7DC + 0E2540 ink navy + 475B4F sage) and primitives must not be used outside that surface. Adding cream tokens to other routes requires a separate spec.
```

- [ ] **Step 2: Commit**

```bash
git add docs/agents/design.md
git commit -m "docs(design): document scoped cream surface for the landing page"
```

---

## Task 16: Final verification and visual review

**Files:** none

- [ ] **Step 1: Run the full check matrix**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```
Expected: all four pass.

- [ ] **Step 2: Manual desktop visual review**

Start the dev server and capture the landing at three desktop widths:

```bash
pnpm --dir front dev
```

Open `http://localhost:5173/` (port may differ — check the printed URL). With the browser dev tools, capture screenshots at:
- 1440 × 900
- 1280 × 800
- 1024 × 768

Compare side-by-side with the supplied mockup. The hero, club card, sessions row, records grid, and CTA should match the mockup's layout and proportions. Note any drift; if structural, file follow-up tasks rather than ad-hoc patches.

- [ ] **Step 3: Manual responsive review**

Capture also at:
- 768 × 1024 (tablet)
- 390 × 844 (mobile)

At 390, the records grid must scroll horizontally with snap. Tablet should drop the club card below the hero.

- [ ] **Step 4: Manual contrast spot-check**

Use a contrast checker (axe DevTools, Stark, or browser DevTools' built-in Accessibility panel) on these pairs:
- Page text (`--text` 0E2540) on `--cream-50` FAF7F8 — must be ≥ 4.5:1
- Secondary text (`--text-2` 2C3E5A) on `--cream-100` F2EFE8 — must be ≥ 4.5:1
- "온라인" badge text (`--accent-secondary` 475B4F) on `--cream-300` DCE7DC — must be ≥ 4.5:1
- Primary button label (white) on `--accent-primary` 0E2540 — must be ≥ 4.5:1

If any pair fails, raise it in the PR; do NOT silently darken/lighten without reflecting the choice in the spec.

- [ ] **Step 5: Manual regression of non-cream routes**

Navigate to:
- `/login`
- `/clubs/:slug/about` (use the seeded slug)
- After logging in, `/app` and `/app/host`

Confirm zero color change vs. baseline (compare to a recent screenshot of the same route, or to a quick `git stash` toggle). If you see any cream tone bleeding into a non-cream surface, that's a leakage bug — find the unscoped selector in `readmates-cream.css` and fix it before declaring done.

- [ ] **Step 6: Final follow-up notes**

Open or update a tracking note (issue tracker or `docs/superpowers/specs/2026-05-09-readmates-cream-landing-design.md`'s Open Questions) with these explicit follow-ups discovered during implementation:

1. Backend: extend `PublicClubResponse` with `host`, `foundedAt`, `recordCount`, an upcoming `nextSession`, and per-kind `records` previews so the landing can fill its remaining empty states.
2. Hero photo: source license-safe still-life photography, place under `front/public/landing/`, sized 480/960/1440w with webp + jpg, swap into `LandingHeroSection`.
3. Search input: wire to a real query/results page or remove. Currently disabled and visual-only.
4. Notification bell: wire to `/app/notifications` for members.
5. Records preview: define a per-kind backend or client mapping so the segmented filter has meaningful counts beyond "session".

Commit nothing in this step — these are documented for the next plan.

---

## Self-review

Spec coverage:
- Architecture file map → Task 1, 2–9 (primitives), 10–12 (feature wiring), 13 (router).
- Token system → Task 1.
- Components 1–9 in spec → Tasks 2–9.
- Layout, breakpoints, auth-state matrix → Task 12 (sections + responsive CSS in subsequent steps).
- Data flow + LandingRouteData → Tasks 10–12. Note: spec's `LandingRouteData` shape was tightened to mirror existing `PublicClubResponse` because the backend lacks half of the originally proposed fields. The display model translates into the view model the UI consumes — semantically equivalent.
- Empty states → Task 10 (display model fallbacks) + Task 12 sections.
- Routing changes → Task 13.
- Accessibility / i18n → Tasks 3 (segmented arrow keys), 7 (heading), 9 (drawer Esc), 16 (manual contrast).
- Verification → Tasks 13–14, 16.
- Definition of Done → Task 16 step 5 enforces the "no leakage" gate.
- design.md note → Task 15.

Placeholder scan: no "TBD"/"TODO"/"add appropriate"-style placeholders. Every code step contains exact code.

Type consistency: `LandingAuthState` and `CreamAuthState` are deliberately separate — `CreamAuthState` lives with the UI primitive (`CreamMobileHeader`), `LandingAuthState` lives with the page composer. Both have identical shape; the page composer's value is type-compatible with the nav components' prop. Confirmed in Task 12 by passing the value directly without coercion.

Filenames and paths: every test imports exactly the path defined in the implementing task. Module signatures (`toLandingViewModel`, `LandingViewModel`, `LandingPage` props) match across tasks.
