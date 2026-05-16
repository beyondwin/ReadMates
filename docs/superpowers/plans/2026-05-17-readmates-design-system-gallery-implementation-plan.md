# ReadMates Design System Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the design-system docs into a clean Editorial Pattern Gallery and add the Public/Member pattern primitives it renders.

**Architecture:** Keep `design/system` as the source of truth and `design/docs` as the catalog. Add presentational React wrappers over the existing CSS contracts (`rm-book-cover`, `rm-avatar-chip`, `rm-empty-state`, `rm-locked-state`, `rm-document-panel`) without importing product routes, API clients, or auth state. Rework the docs app so the first impression is Overview -> Public -> Member -> Components -> Migration, with developer metadata as secondary information.

**Tech Stack:** pnpm workspace, React 19, TypeScript 5.8, Vite 8, Vitest, Testing Library, existing ReadMates design tokens and CSS contracts.

---

## Scope Check

This is one cohesive implementation slice: the docs gallery needs a small set of source-of-truth components, and those components need docs previews to be useful. The plan does not refactor production `front` screens, promote route-aware navigation, add Storybook, or implement Host operating ledger patterns.

## File Structure

- Create: `design/system/src/components/book-cover.tsx`  
  React wrapper for the existing `.rm-book-cover` CSS contract, including image and fallback states.
- Create: `design/system/src/components/book-cover.test.tsx`  
  Tests image alt, fallback title, author text, and size classes.
- Create: `design/system/src/components/avatar-chip.tsx`  
  Compact identity chip built from `.rm-avatar-chip`, with derived initials and optional metadata.
- Create: `design/system/src/components/avatar-chip.test.tsx`  
  Tests initials fallback, explicit initials, metadata, and long-name class behavior.
- Create: `design/system/src/components/state-panel.tsx`  
  `EmptyState` and `LockedState` components over `.rm-empty-state` and `.rm-locked-state`.
- Create: `design/system/src/components/state-panel.test.tsx`  
  Tests empty/locked titles, descriptions, action rendering, and reason classes.
- Create: `design/system/src/components/document-panel.tsx`  
  Document-like panel for introductions, reading notes, and summaries.
- Create: `design/system/src/components/document-panel.test.tsx`  
  Tests heading, eyebrow, metadata, divided content, and footer rendering.
- Modify: `design/system/src/index.ts`  
  Export the new components and public prop types.
- Modify: `design/system/src/styles/tokens.css`  
  Add focused modifier classes for the new wrappers while preserving existing CSS contract names.
- Modify: `design/system/src/design-system-boundaries.test.ts`  
  Keep the boundary test as-is unless the new source files expose a forbidden import. Do not weaken this test.
- Create: `design/docs/src/gallery-data.ts`  
  Public-safe copy, pattern metadata, and sample book/member data for the gallery.
- Modify: `design/docs/src/docs-data.ts`  
  Add the new components to migration/component status.
- Modify: `design/docs/src/app.test.tsx`  
  Drive the docs IA rewrite with tests for Overview, Public, Member, Components, and Migration.
- Modify: `design/docs/src/app.tsx`  
  Rebuild the docs app around the Editorial Pattern Gallery.
- Modify: `design/docs/src/app.css`  
  Add desktop sidebar, mobile top navigation, clean pattern previews, and responsive rules.
- Modify: `design/README.md`  
  Document the gallery purpose, public-safe sample rules, and local verification commands.

## Task 1: Add BookCover And AvatarChip Primitives

**Files:**
- Create: `design/system/src/components/book-cover.tsx`
- Create: `design/system/src/components/book-cover.test.tsx`
- Create: `design/system/src/components/avatar-chip.tsx`
- Create: `design/system/src/components/avatar-chip.test.tsx`
- Modify: `design/system/src/index.ts`
- Modify: `design/system/src/styles/tokens.css`

- [ ] **Step 1: Write the failing BookCover test**

Create `design/system/src/components/book-cover.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookCover } from "./book-cover";

describe("BookCover", () => {
  it("renders a public-safe fallback when no image source is provided", () => {
    render(<BookCover title="조용한 페이지들" author="가상의 저자" size="sm" />);

    const cover = screen.getByLabelText("조용한 페이지들, 가상의 저자");
    expect(cover).toHaveClass("rm-book-cover", "rm-book-cover--sm");
    expect(screen.getByText("조용한 페이지들")).toBeInTheDocument();
    expect(screen.getByText("가상의 저자")).toBeInTheDocument();
  });

  it("renders an image cover with stable alt text", () => {
    render(<BookCover title="Archive Notes" imageSrc="/covers/archive-notes.png" imageAlt="Archive Notes cover" />);

    const image = screen.getByRole("img", { name: "Archive Notes cover" });
    expect(image).toHaveAttribute("src", "/covers/archive-notes.png");
    expect(image).toHaveClass("rm-book-cover__image");
  });
});
```

- [ ] **Step 2: Run the BookCover test to verify it fails**

Run:

```bash
pnpm --filter @readmates/design-system exec vitest run src/components/book-cover.test.tsx
```

Expected: FAIL because `./book-cover` does not exist.

- [ ] **Step 3: Implement BookCover**

Create `design/system/src/components/book-cover.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import { cx } from "./classnames";

export type BookCoverSize = "sm" | "md" | "lg";

export type BookCoverProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  author?: string;
  imageSrc?: string;
  imageAlt?: string;
  size?: BookCoverSize;
};

const sizeClassName: Record<BookCoverSize, string> = {
  sm: "rm-book-cover--sm",
  md: "rm-book-cover--md",
  lg: "rm-book-cover--lg",
};

export function BookCover({
  title,
  author,
  imageSrc,
  imageAlt,
  size = "md",
  className,
  ...props
}: BookCoverProps) {
  const coverLabel = author ? `${title}, ${author}` : title;

  return (
    <div {...props} aria-label={coverLabel} className={cx("rm-book-cover", sizeClassName[size], className)}>
      {imageSrc ? (
        <img src={imageSrc} alt={imageAlt ?? `${title} cover`} className="rm-book-cover__image" />
      ) : (
        <div className="rm-book-cover__fallback" aria-hidden="true">
          <span className="tiny">{author ?? "ReadMates"}</span>
          <strong>{title}</strong>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing AvatarChip test**

Create `design/system/src/components/avatar-chip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarChip } from "./avatar-chip";

describe("AvatarChip", () => {
  it("derives initials from a Korean display name and renders metadata", () => {
    render(<AvatarChip name="민서 독자" meta="멤버" />);

    expect(screen.getByText("민독")).toHaveClass("rm-avatar-chip");
    expect(screen.getByText("민서 독자")).toHaveClass("rm-avatar-chip-group__name");
    expect(screen.getByText("멤버")).toHaveClass("rm-avatar-chip-group__meta");
  });

  it("allows explicit initials and size variants", () => {
    render(<AvatarChip name="Long English Reader Name" initials="LR" size="lg" tone="muted" />);

    const chip = screen.getByLabelText("Long English Reader Name");
    expect(chip).toHaveClass("rm-avatar-chip-group", "rm-avatar-chip-group--lg", "rm-avatar-chip-group--muted");
    expect(screen.getByText("LR")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the AvatarChip test to verify it fails**

Run:

```bash
pnpm --filter @readmates/design-system exec vitest run src/components/avatar-chip.test.tsx
```

Expected: FAIL because `./avatar-chip` does not exist.

- [ ] **Step 6: Implement AvatarChip**

Create `design/system/src/components/avatar-chip.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import { cx } from "./classnames";

export type AvatarChipSize = "sm" | "md" | "lg";
export type AvatarChipTone = "default" | "muted";

export type AvatarChipProps = HTMLAttributes<HTMLSpanElement> & {
  name: string;
  meta?: string;
  initials?: string;
  size?: AvatarChipSize;
  tone?: AvatarChipTone;
};

const sizeClassName: Record<AvatarChipSize, string> = {
  sm: "rm-avatar-chip-group--sm",
  md: "rm-avatar-chip-group--md",
  lg: "rm-avatar-chip-group--lg",
};

const toneClassName: Record<AvatarChipTone, string> = {
  default: "",
  muted: "rm-avatar-chip-group--muted",
};

function deriveInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "RM";
  }

  if (parts.length === 1) {
    return Array.from(parts[0]).slice(0, 2).join("").toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
}

export function AvatarChip({
  name,
  meta,
  initials,
  size = "md",
  tone = "default",
  className,
  ...props
}: AvatarChipProps) {
  return (
    <span
      {...props}
      aria-label={name}
      className={cx("rm-avatar-chip-group", sizeClassName[size], toneClassName[tone], className)}
    >
      <span className="rm-avatar-chip" aria-hidden="true">
        {initials ?? deriveInitials(name)}
      </span>
      <span className="rm-avatar-chip-group__text">
        <span className="rm-avatar-chip-group__name">{name}</span>
        {meta ? <span className="rm-avatar-chip-group__meta">{meta}</span> : null}
      </span>
    </span>
  );
}
```

- [ ] **Step 7: Add CSS modifiers for BookCover and AvatarChip**

Append this focused block near the existing `.rm-book-cover` and `.rm-avatar-chip` rules in `design/system/src/styles/tokens.css`:

```css
.rm-book-cover {
  width: var(--book-cover-width, 92px);
}

.rm-book-cover--sm { --book-cover-width: 56px; }
.rm-book-cover--md { --book-cover-width: 92px; }
.rm-book-cover--lg { --book-cover-width: 132px; }

.rm-book-cover__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rm-book-cover__fallback strong {
  color: var(--text);
  font-size: clamp(12px, 1.6vw, 15px);
  line-height: 1.24;
  font-weight: 600;
}

.rm-avatar-chip-group {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  max-width: 100%;
  color: var(--text-2);
}

.rm-avatar-chip-group--sm { --avatar-size: 22px; }
.rm-avatar-chip-group--md { --avatar-size: 28px; }
.rm-avatar-chip-group--lg { --avatar-size: 36px; }

.rm-avatar-chip-group--muted {
  color: var(--text-3);
}

.rm-avatar-chip-group--muted .rm-avatar-chip {
  --avatar-bg: var(--bg-deep);
  --avatar-border: var(--line-strong);
  --avatar-color: var(--text-3);
}

.rm-avatar-chip-group__text {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.rm-avatar-chip-group__name,
.rm-avatar-chip-group__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rm-avatar-chip-group__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.rm-avatar-chip-group__meta {
  font-size: 11px;
  color: var(--text-3);
}
```

- [ ] **Step 8: Export BookCover and AvatarChip**

Append these exports to `design/system/src/index.ts`:

```ts
export { AvatarChip } from "./components/avatar-chip";
export type { AvatarChipProps, AvatarChipSize, AvatarChipTone } from "./components/avatar-chip";
export { BookCover } from "./components/book-cover";
export type { BookCoverProps, BookCoverSize } from "./components/book-cover";
```

- [ ] **Step 9: Run targeted design-system tests**

Run:

```bash
pnpm --filter @readmates/design-system exec vitest run src/components/book-cover.test.tsx src/components/avatar-chip.test.tsx
```

Expected: PASS for both test files.

- [ ] **Step 10: Run the design-system build**

Run:

```bash
pnpm --filter @readmates/design-system build
```

Expected: TypeScript passes with no errors.

- [ ] **Step 11: Commit the visual primitives**

Run:

```bash
git add design/system/src/components/book-cover.tsx \
  design/system/src/components/book-cover.test.tsx \
  design/system/src/components/avatar-chip.tsx \
  design/system/src/components/avatar-chip.test.tsx \
  design/system/src/index.ts \
  design/system/src/styles/tokens.css
git commit -m "feat(design): add book and avatar primitives"
```

Expected: commit succeeds.

## Task 2: Add EmptyState, LockedState, And DocumentPanel

**Files:**
- Create: `design/system/src/components/state-panel.tsx`
- Create: `design/system/src/components/state-panel.test.tsx`
- Create: `design/system/src/components/document-panel.tsx`
- Create: `design/system/src/components/document-panel.test.tsx`
- Modify: `design/system/src/index.ts`
- Modify: `design/system/src/styles/tokens.css`

- [ ] **Step 1: Write the failing state panel tests**

Create `design/system/src/components/state-panel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { EmptyState, LockedState } from "./state-panel";

describe("EmptyState", () => {
  it("renders title, description, compact class, and action", () => {
    render(
      <EmptyState
        title="아직 공개된 읽기가 없습니다"
        description="공개 예정 세션이 생기면 이 자리에 표시됩니다."
        compact
        action={<Button variant="secondary">초안 보기</Button>}
      />,
    );

    const state = screen.getByRole("status");
    expect(state).toHaveClass("rm-empty-state", "rm-state-panel", "rm-state-panel--compact");
    expect(screen.getByText("아직 공개된 읽기가 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초안 보기" })).toHaveClass("btn-secondary");
  });
});

describe("LockedState", () => {
  it("renders a pending access state without relying on color alone", () => {
    render(
      <LockedState
        title="승인 대기 중입니다"
        description="호스트가 멤버 접근을 승인하면 읽기 책상이 열립니다."
        reason="pending"
      />,
    );

    const state = screen.getByRole("status");
    expect(state).toHaveClass("rm-locked-state", "rm-state-panel", "rm-state", "rm-state--pending");
    expect(screen.getByText("승인 대기")).toHaveClass("badge");
    expect(screen.getByText("호스트가 멤버 접근을 승인하면 읽기 책상이 열립니다.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the state panel tests to verify they fail**

Run:

```bash
pnpm --filter @readmates/design-system exec vitest run src/components/state-panel.test.tsx
```

Expected: FAIL because `./state-panel` does not exist.

- [ ] **Step 3: Implement state panels**

Create `design/system/src/components/state-panel.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";
import { Badge } from "./badge";
import { cx } from "./classnames";

export type StatePanelProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
};

export type LockedStateReason = "memberOnly" | "pending" | "closed";

export type LockedStateProps = StatePanelProps & {
  reason?: LockedStateReason;
};

const reasonClassName: Record<LockedStateReason, string> = {
  memberOnly: "rm-state--locked",
  pending: "rm-state--pending",
  closed: "rm-state--readonly",
};

const reasonLabel: Record<LockedStateReason, string> = {
  memberOnly: "멤버 전용",
  pending: "승인 대기",
  closed: "닫힘",
};

export function EmptyState({ title, description, action, compact = false, className, ...props }: StatePanelProps) {
  return (
    <div
      {...props}
      role="status"
      className={cx("rm-empty-state", "rm-state-panel", compact && "rm-state-panel--compact", className)}
    >
      <div className="rm-state-panel__content">
        <h3 className="h4">{title}</h3>
        {description ? <p className="small">{description}</p> : null}
      </div>
      {action ? <div className="rm-state-panel__action">{action}</div> : null}
    </div>
  );
}

export function LockedState({
  title,
  description,
  action,
  compact = false,
  reason = "memberOnly",
  className,
  ...props
}: LockedStateProps) {
  return (
    <div
      {...props}
      role="status"
      className={cx(
        "rm-locked-state",
        "rm-state-panel",
        "rm-state",
        reasonClassName[reason],
        compact && "rm-state-panel--compact",
        className,
      )}
    >
      <div className="rm-state-panel__content">
        <Badge tone={reason === "pending" ? "pending" : "locked"}>{reasonLabel[reason]}</Badge>
        <h3 className="h4">{title}</h3>
        {description ? <p className="small">{description}</p> : null}
      </div>
      {action ? <div className="rm-state-panel__action">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing DocumentPanel tests**

Create `design/system/src/components/document-panel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentPanel } from "./document-panel";

describe("DocumentPanel", () => {
  it("renders editorial document content with metadata and divided state", () => {
    render(
      <DocumentPanel eyebrow="Public note" title="읽기 소개" meta="가상 공개 클럽" divided>
        <p>책과 모임의 분위기를 짧게 소개합니다.</p>
      </DocumentPanel>,
    );

    const panel = screen.getByRole("region", { name: "읽기 소개" });
    expect(panel).toHaveClass("rm-document-panel", "rm-document-panel--divided");
    expect(screen.getByText("Public note")).toHaveClass("eyebrow");
    expect(screen.getByText("가상 공개 클럽")).toHaveClass("tiny");
  });

  it("renders footer content when provided", () => {
    render(
      <DocumentPanel title="세션 요약" footer={<span>마지막 업데이트: 오늘</span>}>
        <p>멤버가 읽을 요약 문장입니다.</p>
      </DocumentPanel>,
    );

    expect(screen.getByText("마지막 업데이트: 오늘")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the DocumentPanel tests to verify they fail**

Run:

```bash
pnpm --filter @readmates/design-system exec vitest run src/components/document-panel.test.tsx
```

Expected: FAIL because `./document-panel` does not exist.

- [ ] **Step 6: Implement DocumentPanel**

Create `design/system/src/components/document-panel.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classnames";

export type DocumentPanelTone = "default" | "quiet";

export type DocumentPanelProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  footer?: ReactNode;
  tone?: DocumentPanelTone;
  divided?: boolean;
  children: ReactNode;
};

const toneClassName: Record<DocumentPanelTone, string> = {
  default: "",
  quiet: "rm-document-panel--quiet",
};

export function DocumentPanel({
  eyebrow,
  title,
  meta,
  footer,
  tone = "default",
  divided = false,
  className,
  children,
  ...props
}: DocumentPanelProps) {
  return (
    <section
      {...props}
      aria-label={title}
      className={cx("rm-document-panel", toneClassName[tone], divided && "rm-document-panel--divided", className)}
    >
      <header className="rm-document-panel__header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3 className="h3">{title}</h3>
        </div>
        {meta ? <p className="tiny">{meta}</p> : null}
      </header>
      <div className="rm-document-panel__body">{children}</div>
      {footer ? <footer className="rm-document-panel__footer">{footer}</footer> : null}
    </section>
  );
}
```

- [ ] **Step 7: Add CSS for state panels and document panels**

Append this block near the existing `.rm-empty-state`, `.rm-locked-state`, and `.rm-document-panel` rules in `design/system/src/styles/tokens.css`:

```css
.rm-document-panel {
  display: grid;
  gap: var(--space-md);
  padding: var(--space-panel-tight);
}

.rm-document-panel--quiet {
  background: var(--bg-sub);
  border-color: var(--line-soft);
}

.rm-document-panel--divided .rm-document-panel__body,
.rm-document-panel__footer {
  border-top: 1px solid var(--line-soft);
  padding-top: var(--space-sm);
}

.rm-document-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.rm-document-panel__header .h3,
.rm-state-panel .h4 {
  margin: 0;
}

.rm-document-panel__body {
  min-width: 0;
}

.rm-document-panel__body > * {
  margin: 0;
}

.rm-document-panel__body > * + * {
  margin-top: var(--space-sm);
}

.rm-state-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.rm-state-panel--compact {
  padding: var(--space-sm);
}

.rm-state-panel__content {
  min-width: 0;
  display: grid;
  gap: var(--space-xs);
}

.rm-state-panel__content .small {
  margin: 0;
}

.rm-state-panel__action {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .rm-document-panel__header,
  .rm-state-panel {
    display: grid;
    justify-content: stretch;
  }

  .rm-state-panel__action .btn {
    width: 100%;
    min-height: 44px;
  }
}
```

- [ ] **Step 8: Export state panels and DocumentPanel**

Append these exports to `design/system/src/index.ts`:

```ts
export { DocumentPanel } from "./components/document-panel";
export type { DocumentPanelProps, DocumentPanelTone } from "./components/document-panel";
export { EmptyState, LockedState } from "./components/state-panel";
export type { LockedStateProps, LockedStateReason, StatePanelProps } from "./components/state-panel";
```

- [ ] **Step 9: Run targeted state and document tests**

Run:

```bash
pnpm --filter @readmates/design-system exec vitest run src/components/state-panel.test.tsx src/components/document-panel.test.tsx
```

Expected: PASS for both test files.

- [ ] **Step 10: Run all design-system tests and build**

Run:

```bash
pnpm --filter @readmates/design-system test
pnpm --filter @readmates/design-system build
```

Expected: all component tests and the design-system boundary test pass; TypeScript passes.

- [ ] **Step 11: Commit the state and document primitives**

Run:

```bash
git add design/system/src/components/state-panel.tsx \
  design/system/src/components/state-panel.test.tsx \
  design/system/src/components/document-panel.tsx \
  design/system/src/components/document-panel.test.tsx \
  design/system/src/index.ts \
  design/system/src/styles/tokens.css
git commit -m "feat(design): add state and document primitives"
```

Expected: commit succeeds.

## Task 3: Add Public-Safe Gallery Data And Component Status

**Files:**
- Create: `design/docs/src/gallery-data.ts`
- Modify: `design/docs/src/docs-data.ts`
- Modify: `design/docs/src/app.test.tsx`

- [ ] **Step 1: Write the failing docs app test for the new IA**

Replace `design/docs/src/app.test.tsx` with:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("Design system docs app", () => {
  it("renders the editorial gallery sections before component metadata", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /ReadMates should feel calm/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Public" })).toHaveAttribute("href", "#public");
    expect(screen.getByRole("link", { name: "Member" })).toHaveAttribute("href", "#member");
    expect(screen.getByRole("heading", { name: "Public Literary Page" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Member Reading Desk" })).toBeInTheDocument();
  });

  it("renders real design-system gallery components and migration status", () => {
    render(<App />);

    const publicSection = screen.getByRole("region", { name: "Public Literary Page" });
    expect(within(publicSection).getByText("조용한 페이지들")).toBeInTheDocument();
    expect(within(publicSection).getByText("멤버 전용")).toHaveClass("badge");

    const memberSection = screen.getByRole("region", { name: "Member Reading Desk" });
    expect(within(memberSection).getByLabelText("민서 독자")).toBeInTheDocument();
    expect(screen.getAllByText("BookCover").length).toBeGreaterThan(0);
    expect(screen.getByText("TopNav / MobileHeader / MobileTabBar")).toBeInTheDocument();
    expect(screen.getByText("legacy")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the docs test to verify it fails**

Run:

```bash
pnpm --filter @readmates/design-system-docs test
```

Expected: FAIL because the current app still renders `Foundations`, `Components`, `Responsive`, and `Migration` without Public/Member gallery sections.

- [ ] **Step 3: Add public-safe gallery data**

Create `design/docs/src/gallery-data.ts`:

```ts
export type PatternKey = "public" | "member";

export type GalleryBook = {
  title: string;
  author: string;
};

export type PatternDoc = {
  key: PatternKey;
  eyebrow: string;
  title: string;
  description: string;
  book: GalleryBook;
  states: string[];
  components: string[];
};

export const overviewCopy = {
  eyebrow: "ReadMates Design Language",
  title: "ReadMates should feel calm, editorial, and usable.",
  description:
    "A private reading room, a quiet literary page, and a personal reading desk should share one source of truth without becoming a generic dashboard.",
};

export const patternDocs: PatternDoc[] = [
  {
    key: "public",
    eyebrow: "Public Literary Page",
    title: "Public Literary Page",
    description:
      "외부 방문자가 읽는 클럽 소개와 초대 장면입니다. 넓은 여백, 잡지형 헤드라인, 절제된 CTA를 우선합니다.",
    book: {
      title: "조용한 페이지들",
      author: "가상의 저자",
    },
    states: ["공개 소개", "멤버 전용 경계", "초대 CTA"],
    components: ["DocumentPanel", "BookCover", "EmptyState", "LockedState"],
  },
  {
    key: "member",
    eyebrow: "Member Reading Desk",
    title: "Member Reading Desk",
    description:
      "멤버가 현재 읽는 책, 세션 상태, 다음 액션을 확인하는 개인 책상 장면입니다. 정보 밀도는 높지만 차갑게 보이지 않아야 합니다.",
    book: {
      title: "Archive Notes",
      author: "ReadMates Studio",
    },
    states: ["현재 읽기", "참여 상태", "다음 액션"],
    components: ["BookCover", "AvatarChip", "DocumentPanel", "LockedState"],
  },
];

export const memberSample = {
  name: "민서 독자",
  meta: "이번 달 참여 멤버",
};
```

- [ ] **Step 4: Extend component status metadata**

Append these entries before the legacy navigation entry in `design/docs/src/docs-data.ts`:

```ts
  {
    name: "BookCover",
    status: "stable",
    description: "Book representation for public showcases and member reading desks, with image fallback.",
    mobile: "Uses fixed aspect ratio and stable width variants so adjacent text can stack below it on narrow screens.",
    source: "@readmates/design-system",
  },
  {
    name: "AvatarChip",
    status: "stable",
    description: "Compact identity chip for host and member display with initials fallback.",
    mobile: "Text metadata truncates inside the chip group; long names need nearby full text when critical.",
    source: "@readmates/design-system",
  },
  {
    name: "EmptyState / LockedState",
    status: "stable",
    description: "Quiet empty states and explicit permission boundaries for public and member scenes.",
    mobile: "Actions stack to full-width touch targets.",
    source: "@readmates/design-system",
  },
  {
    name: "DocumentPanel",
    status: "stable",
    description: "Document-like panel for introductions, reading notes, and session summaries.",
    mobile: "Header metadata stacks before body content; avoid nested cards inside the panel.",
    source: "@readmates/design-system",
  },
```

- [ ] **Step 5: Run the docs test to confirm it still fails for the app rewrite**

Run:

```bash
pnpm --filter @readmates/design-system-docs test
```

Expected: FAIL because `gallery-data.ts` exists and metadata is extended, but `App` has not been rewritten to render Public/Member gallery sections.

- [ ] **Step 6: Keep the failing docs test uncommitted for the app rewrite**

Run:

```bash
git status --short -- design/docs/src/gallery-data.ts design/docs/src/docs-data.ts design/docs/src/app.test.tsx
```

Expected: the three docs files are modified or untracked. Do not commit yet; Task 4 makes the failing test pass and commits the gallery app as one passing slice.

## Task 4: Rebuild The Docs App As A Clean Pattern Gallery

**Files:**
- Modify: `design/docs/src/app.tsx`
- Modify: `design/docs/src/app.css`

- [ ] **Step 1: Replace the docs app with the gallery IA**

Replace `design/docs/src/app.tsx` with:

```tsx
import {
  AvatarChip,
  Badge,
  BookCover,
  Button,
  Divider,
  DocumentPanel,
  EmptyState,
  LockedState,
} from "@readmates/design-system";
import { componentDocs } from "./docs-data";
import { memberSample, overviewCopy, patternDocs, type PatternDoc } from "./gallery-data";

function StatusBadge({ status }: { status: "stable" | "experimental" | "legacy" | "deprecated" }) {
  const tone =
    status === "stable" ? "success" : status === "legacy" ? "warning" : status === "deprecated" ? "locked" : "accent";

  return <Badge tone={tone}>{status}</Badge>;
}

function SectionNav() {
  return (
    <aside className="rm-docs__sidebar" aria-label="Design system sections">
      <strong>ReadMates DS</strong>
      <a href="#overview">Overview</a>
      <a href="#public">Public</a>
      <a href="#member">Member</a>
      <a href="#components">Components</a>
      <a href="#migration">Migration</a>
    </aside>
  );
}

function PatternPreview({ pattern }: { pattern: PatternDoc }) {
  const isPublic = pattern.key === "public";

  return (
    <section
      className={`rm-docs__pattern rm-docs__pattern--${pattern.key}`}
      id={pattern.key}
      aria-label={pattern.title}
    >
      <div className="rm-docs__pattern-copy">
        <p className="eyebrow">{pattern.eyebrow}</p>
        <h2 className="h2">{pattern.title}</h2>
        <p className="body">{pattern.description}</p>
        <div className="rm-docs__chips" aria-label={`${pattern.title} states`}>
          {pattern.states.map((state) => (
            <Badge key={state} tone={isPublic ? "accent" : "success"} dot>
              {state}
            </Badge>
          ))}
        </div>
      </div>

      <div className="rm-docs__pattern-canvas">
        <BookCover title={pattern.book.title} author={pattern.book.author} size={isPublic ? "lg" : "md"} />
        <DocumentPanel
          eyebrow={isPublic ? "Invitation" : "Reading Desk"}
          title={isPublic ? "읽기를 함께 여는 공개 장면" : "나의 이번 읽기"}
          meta={isPublic ? "Public-safe sample" : "Member sample"}
          divided
        >
          <p>{isPublic ? "공개 페이지는 분위기를 먼저 전달하고 행동은 절제합니다." : "멤버 책상은 책, 상태, 다음 행동을 한 흐름으로 보여줍니다."}</p>
          {isPublic ? (
            <LockedState
              title="멤버 전용 콘텐츠"
              description="읽기 노트와 세션 기록은 멤버에게만 공개됩니다."
              reason="memberOnly"
              compact
            />
          ) : (
            <div className="rm-docs__member-row">
              <AvatarChip name={memberSample.name} meta={memberSample.meta} />
              <Button variant="primary">다음 세션 보기</Button>
            </div>
          )}
        </DocumentPanel>
      </div>

      <div className="rm-docs__pattern-components">
        {pattern.components.map((component) => (
          <code key={component}>{component}</code>
        ))}
      </div>
    </section>
  );
}

export function App() {
  const publicPattern = patternDocs.find((pattern) => pattern.key === "public");
  const memberPattern = patternDocs.find((pattern) => pattern.key === "member");

  if (!publicPattern || !memberPattern) {
    throw new Error("Design gallery requires public and member pattern docs.");
  }

  return (
    <main className="rm-docs">
      <SectionNav />

      <section className="rm-docs__content">
        <header className="rm-docs__overview" id="overview">
          <p className="eyebrow">{overviewCopy.eyebrow}</p>
          <h1 className="h1">{overviewCopy.title}</h1>
          <p className="body-lg">{overviewCopy.description}</p>
          <div className="rm-docs__overview-actions">
            <a className="btn btn-primary" href="#public">
              Public 보기
            </a>
            <a className="btn btn-secondary" href="#member">
              Member 보기
            </a>
          </div>
        </header>

        <section className="rm-docs__section" aria-labelledby="patterns-heading">
          <div className="rm-docs__section-heading">
            <p className="eyebrow">Pattern Gallery</p>
            <h2 className="h2" id="patterns-heading">
              Public and member scenes
            </h2>
          </div>
          <div className="rm-docs__pattern-grid">
            <PatternPreview pattern={publicPattern} />
            <PatternPreview pattern={memberPattern} />
          </div>
        </section>

        <section className="rm-docs__section" id="components" aria-labelledby="components-heading">
          <div className="rm-docs__section-heading">
            <p className="eyebrow">Components</p>
            <h2 className="h2" id="components-heading">
              Components used by the gallery
            </h2>
          </div>
          <div className="rm-docs__component-samples">
            <EmptyState
              title="아직 공개된 읽기가 없습니다"
              description="공개 예정 세션이 생기면 이 자리에 표시됩니다."
              action={<Button variant="secondary">초안 보기</Button>}
            />
            <LockedState
              title="승인 대기 중입니다"
              description="호스트가 승인하면 멤버 책상이 열립니다."
              reason="pending"
            />
          </div>
        </section>

        <section className="rm-docs__section" id="migration" aria-labelledby="migration-heading">
          <div className="rm-docs__section-heading">
            <p className="eyebrow">Migration</p>
            <h2 className="h2" id="migration-heading">
              Component status
            </h2>
          </div>
          <div className="rm-docs__component-list">
            {componentDocs.map((component) => (
              <article key={component.name} className="rm-ledger-row rm-docs__component-row">
                <div>
                  <h3 className="h4">{component.name}</h3>
                  <p className="small">{component.description}</p>
                  <p className="tiny">{component.mobile}</p>
                </div>
                <div className="rm-docs__component-meta">
                  <StatusBadge status={component.status} />
                  <code>{component.source}</code>
                </div>
              </article>
            ))}
          </div>
        </section>

        <Divider soft />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Replace docs CSS with the clean responsive gallery layout**

Replace `design/docs/src/app.css` with:

```css
.rm-docs {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  background: var(--bg);
  color: var(--text);
}

.rm-docs__sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 28px 22px;
  border-right: 1px solid var(--line);
  background: var(--bg-sub);
}

.rm-docs__sidebar strong {
  margin-bottom: 10px;
}

.rm-docs__sidebar a {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  color: var(--text-2);
  font-size: 14px;
}

.rm-docs__content {
  width: min(100%, 1180px);
  padding: 52px 32px 88px;
}

.rm-docs__overview,
.rm-docs__section {
  display: grid;
  gap: 18px;
  margin-bottom: 52px;
}

.rm-docs__overview {
  max-width: 820px;
}

.rm-docs__overview .h1 {
  margin: 0;
}

.rm-docs__overview-actions,
.rm-docs__chips,
.rm-docs__member-row,
.rm-docs__pattern-components {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.rm-docs__section-heading {
  display: grid;
  gap: 6px;
}

.rm-docs__section-heading .h2 {
  margin: 0;
}

.rm-docs__pattern-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.rm-docs__pattern {
  min-width: 0;
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  background: var(--bg-raised);
}

.rm-docs__pattern--public {
  background: color-mix(in oklch, var(--bg-raised), var(--paper-100) 54%);
}

.rm-docs__pattern--member {
  background: color-mix(in oklch, var(--bg-sub), var(--bg-raised) 40%);
}

.rm-docs__pattern-copy {
  display: grid;
  gap: 10px;
}

.rm-docs__pattern-copy .h2,
.rm-docs__pattern-copy .body {
  margin: 0;
}

.rm-docs__pattern-canvas {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.rm-docs__pattern-components code,
.rm-docs__component-meta code {
  font-family: var(--f-mono);
  font-size: 11px;
  color: var(--text-3);
}

.rm-docs__component-samples,
.rm-docs__component-list {
  display: grid;
  gap: 12px;
}

.rm-docs__component-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  padding: 18px;
}

.rm-docs__component-meta {
  display: grid;
  justify-items: end;
  align-content: start;
  gap: 8px;
}

@media (max-width: 900px) {
  .rm-docs {
    display: block;
  }

  .rm-docs__sidebar {
    position: sticky;
    z-index: 1;
    height: auto;
    top: 0;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    padding: 14px 16px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .rm-docs__sidebar strong {
    width: 100%;
    margin-bottom: 0;
  }

  .rm-docs__sidebar a {
    min-height: 44px;
  }

  .rm-docs__content {
    padding: 32px 16px 72px;
  }

  .rm-docs__pattern-grid,
  .rm-docs__component-row {
    grid-template-columns: 1fr;
  }

  .rm-docs__component-meta {
    justify-items: start;
  }
}

@media (max-width: 640px) {
  .rm-docs__pattern {
    padding: 16px;
  }

  .rm-docs__pattern-canvas {
    grid-template-columns: 1fr;
  }

  .rm-docs__pattern-canvas .rm-book-cover {
    justify-self: start;
  }

  .rm-docs__overview-actions .btn,
  .rm-docs__member-row .btn {
    width: 100%;
    min-height: 44px;
  }
}
```

- [ ] **Step 3: Run the docs test**

Run:

```bash
pnpm --filter @readmates/design-system-docs test
```

Expected: PASS.

- [ ] **Step 4: Build the docs app**

Run:

```bash
pnpm --filter @readmates/design-system-docs build
```

Expected: Vite builds `design/docs/dist` without TypeScript or bundle errors.

- [ ] **Step 5: Commit the gallery docs app**

Run:

```bash
git add design/docs/src/gallery-data.ts \
  design/docs/src/docs-data.ts \
  design/docs/src/app.test.tsx \
  design/docs/src/app.tsx \
  design/docs/src/app.css
git commit -m "feat(design): add editorial pattern gallery docs"
```

Expected: commit succeeds.

## Task 5: Document The Gallery Workflow And Run Full Verification

**Files:**
- Modify: `design/README.md`

- [ ] **Step 1: Update the design README with the gallery workflow**

Append this section to `design/README.md`:

````markdown
## Gallery catalog

`design/docs` opens with an Editorial Pattern Gallery for design and planning review.
The first stable gallery scenes are:

- Public Literary Page: public-safe club introduction, invitation, and member-only boundary examples.
- Member Reading Desk: current book, member identity, session state, and next-action examples.

Gallery samples must stay public-safe. Do not include real members, emails, invite tokens, private domains, deployment state, secrets, or token-shaped examples.

Run local checks before merging gallery or component changes:

```bash
pnpm design:check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

For visual review, run:

```bash
pnpm --dir design/docs exec vite --host 0.0.0.0 --port 5174 --strictPort
```

Then inspect `http://localhost:5174` in desktop and mobile viewport widths.
````

- [ ] **Step 2: Run the full design-system check**

Run:

```bash
pnpm design:check
```

Expected: `@readmates/design-system` build/test and `@readmates/design-system-docs` build/test pass.

- [ ] **Step 3: Run frontend regression checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: lint, unit tests, and production build pass. If lint prints the existing ignored coverage warning, note it in the completion summary without treating it as a new regression.

- [ ] **Step 4: Run documentation whitespace check**

Run:

```bash
git diff --check -- design/README.md docs/superpowers/plans/2026-05-17-readmates-design-system-gallery-implementation-plan.md
```

Expected: no output.

- [ ] **Step 5: Start the docs dev server for visual review**

Run:

```bash
pnpm --dir design/docs exec vite --host 0.0.0.0 --port 5174 --strictPort
```

Expected: Vite prints a local URL for port `5174`. Keep this process running while inspecting the browser, then stop it with Ctrl-C after review.

- [ ] **Step 6: Visual QA desktop and mobile**

Open `http://localhost:5174` and check these conditions:

- Desktop shows a simple left navigation with Overview, Public, Member, Components, Migration.
- Overview starts with a short brand statement, not a long instructional block.
- Public and Member scenes render side by side at desktop width.
- Public scene shows `BookCover`, `DocumentPanel`, and a member-only `LockedState`.
- Member scene shows `BookCover`, `AvatarChip`, `DocumentPanel`, and a primary next action.
- Mobile width changes navigation to top wrapping links and stacks Public/Member previews.
- No Korean or English text overflows buttons, badges, chips, panels, or navigation links.

- [ ] **Step 7: Commit README update after checks pass**

Run:

```bash
git add design/README.md
git commit -m "docs(design): document gallery review workflow"
```

Expected: commit succeeds.

## Task 6: Final Integration Review

**Files:**
- Inspect: `git diff --stat origin/main..HEAD`
- Inspect: `git status --short --branch`

- [ ] **Step 1: Confirm the working tree is clean**

Run:

```bash
git status --short --branch
```

Expected: the branch is ahead of its base and has no unstaged or staged files.

- [ ] **Step 2: Review the diff shape**

Run:

```bash
git diff --stat origin/main..HEAD
```

Expected: changes are limited to `design/system`, `design/docs`, `design/README.md`, and this plan/spec history. No `front` product routes, `server`, deploy scripts, or private data files should appear.

- [ ] **Step 3: Re-run final checks if any file changed after Task 5**

Run this only if code or CSS changed after Task 5 verification:

```bash
pnpm design:check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all commands pass.

- [ ] **Step 4: Completion summary**

Report:

- Changed surface: `design/system`, `design/docs`, `design/README.md`.
- Checks run: exact commands and pass/fail result.
- Visual QA: desktop and mobile viewport status.
- Remaining risk: no product `front` screens were migrated, and Host operating ledger remains deferred by design.
