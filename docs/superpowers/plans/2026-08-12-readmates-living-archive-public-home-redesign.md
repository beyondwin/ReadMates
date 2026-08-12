# ReadMates Living Archive Public Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the ReadMates public home as the user-approved `People Between the Volumes` composition with high visual fidelity, using real public data and preserving every existing route, access, metadata, and invite boundary.

**Architecture:** Keep `publicClubQuery` as the mandatory route data and fetch only the latest public session detail as fail-soft enrichment. Project both payloads through a pure living-archive model, render a prop-driven public-home component family, and scope the new typography, cloth/paper material, responsive composition, and motion to the public home. The approved 1487×1058 concept is a test-only visual authority, never a product raster background.

**Tech Stack:** React 19, TypeScript 6, React Router 8 view transitions, TanStack Query 5, Vite 8, scoped CSS, a fixed-copy Noto Serif KR WOFF2 subset, Vitest/Testing Library, Playwright E2E and Docker Component Testing.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-08-12-readmates-living-archive-public-home-redesign-design.md`.
- Canonical visual reference: `exec-822d0e31-13e4-4210-802d-e3f20aa23279.png`, 1487×1058, SHA-256 `5300d886fcc62edb8bd2c1b4a71dd3a0e58e39d6701cb4effa1f000fdd8a02ee`.
- This is a fidelity build, not a mood translation. The desktop header, two-line brand phrase, full-width shelf, pulled-open latest volume, reader traces, bright next slot, shelf ledge, and lower two-column strip must match the approved composition and normalized geometry in the design spec.
- The AI image's broken text, invented books, invented dates, and invented people are not product truth. Replace them with approved fixed copy, current public API data, and public-safe fixtures. Never manufacture extra sessions or authors merely to fill the shelf.
- Green remains a cloth-spine material color only. Heading, body, button, link, focus, and navigation text must use carbon, warm gray, cobalt, vermilion, or brass according to the approved palette.
- Do not use the approved concept PNG as a page background, hero image, or runtime asset. It may exist only under `front/tests/visual-references/` for side-by-side design review.
- Do not change the server, BFF, API response shapes, public visibility rules, OAuth behavior, login return targets, invite behavior, database, or migrations.
- Keep route-first dependencies: route owns query/fallback; model stays pure; UI imports no feature API/query/route module and performs no fetch.
- `publicSessionQuery` is optional enrichment. Its 404, network error, or empty result must omit reader traces without promoting the home to a route error.
- Dynamic book, author, member, quote, and date text remains Pretendard. Noto Serif KR is limited to fixed public-home brand and section headings.
- The desktop shelf is not horizontally scrollable. Tablet shows fewer spines. Mobile is a vertical recomposition, not a scaled shelf and not a forced horizontal scroller.
- Motion is available immediately, runs once, uses transform/opacity/stroke-dashoffset, and has a static `prefers-reduced-motion` final state. No scroll hijacking, autoplay carousel, perpetual loop, WebGL, or parallax.
- Use semantic headings/lists, 44px controls, visible keyboard focus, `aria-pressed` or equivalent relation state, and a textual relation cue in addition to color.
- Use TDD RED/GREEN, focused regression, deterministic CT fixtures, two bounded screenshot review rounds, the Impeccable mechanical detector once, independent finish review, `git diff --check`, narrow commits, and final frontend gates.
- The relevant acceptance-matrix rows are `Guest/public exposure` and `UI or runtime state`. `Actor/authorization`, `BFF or OAuth`, `Persistence or migration`, and provider rows remain out of scope because their contracts are preserved rather than changed.
- Do not add real member data, private domains, local absolute paths, secrets, deployment state, OCIDs, or token-shaped examples.
- Execute implementation in an isolated worktree created through `using-git-worktrees`; do not implement directly on local `main`.

---

## File Structure

- Create `front/tests/visual-references/public-home-people-between-volumes.png`: exact approved concept, test/review only.
- Create `front/public/assets/living-archive/noto-serif-kr-living-archive-500.woff2`: fixed-copy heading subset from the official Noto Serif KR webfont.
- Create `front/public/assets/living-archive/OFL-NotoSerifKR.txt`: upstream font license.
- Create `front/public/assets/living-archive/paper-grain.svg`: low-opacity static paper grain.
- Create `front/public/assets/living-archive/cloth-weave.svg`: low-opacity static book-cloth weave.
- Create `front/features/public/model/public-home-living-archive.ts`: pure projection for spines, featured volume, traces, and aggregate remainder.
- Create `front/features/public/model/public-home-living-archive.test.ts`: order, truthfulness, trace selection, and fallback tests.
- Modify `front/features/public/route/public-home-route.tsx`: fetch latest detail as optional enrichment and assemble the view.
- Create `front/features/public/route/public-home-route.test.tsx`: successful enrichment and fail-soft error coverage.
- Create `front/features/public/ui/public-home-header.tsx`: desktop-only approved ReadMates/읽는사이 header composition and accessible menu.
- Create `front/features/public/ui/public-home-header.test.tsx`: menu, keyboard, link-scope, and text-color contract.
- Modify `front/src/app/layouts/public-route-layout.tsx`: use the home-specific header only on public-home routes.
- Rewrite `front/features/public/ui/public-home.tsx`: compose the new public-home sections from a prepared view.
- Create `front/features/public/ui/living-archive-hero.tsx`: brand phrase plus shelf scene.
- Create `front/features/public/ui/archive-shelf.tsx`: real-session spines, older-record index marker, shelf ledge, and next slot.
- Create `front/features/public/ui/featured-volume.tsx`: pulled-open latest record and primary CTA.
- Create `front/features/public/ui/reader-traces.tsx`: three-person relation UI and scalable SVG paths.
- Create `front/features/public/ui/public-reading-rhythm.tsx`: four-step shelf-filling sequence.
- Create `front/features/public/ui/public-membership-boundary.tsx`: public reading versus invite-only participation.
- Create `front/features/public/ui/public-archive-index.tsx`: compact non-repetitive public archive index.
- Create `front/features/public/ui/public-home-living-archive.css`: scoped palette, geometry, material, responsive, motion, focus, and reduced-motion rules.
- Modify `front/index.html`: persist the public-home direction contract as the first body comment.
- Modify `front/features/public/ui/public-link.tsx`: forward `viewTransition` only to Router Link, not fallback anchors.
- Modify `front/features/public/ui/public-session.tsx`: expose the matching featured-cover view-transition target.
- Modify `front/tests/unit/public-home.test.tsx`: replace old repeated-card expectations with living-archive semantics and public-route continuity.
- Modify `front/features/public/ui/public-home.ct.tsx`: exact reference viewport, tablet/mobile/zoom/reduced-motion coverage, and screenshots.
- Modify `front/tests/e2e/responsive-navigation-chrome.spec.ts`: update public-home mobile-first-viewport assertions.
- Modify `front/tests/e2e/guest-browsing.spec.ts`: retain public/member entry and detail failure behavior.
- Modify `front/src/styles/globals.css`: remove superseded public-home-only rules; keep shared public-record/session styles.
- Create `DESIGN.md`: record the shipped public-home visual world while explicitly preserving existing member/host/admin worlds.
- Create `front/.impeccable/surfaces/front-features-public-ui-public-home-tsx.md`: route-specific visitor and fidelity brief.
- Modify `CHANGELOG.md`: record the public-home redesign under `Unreleased`.

---

### Task 1: Preserve the Approved Visual Authority and Add Scoped Material Foundations

**Files:**
- Create: `front/tests/visual-references/public-home-people-between-volumes.png`
- Create: `front/public/assets/living-archive/noto-serif-kr-living-archive-500.woff2`
- Create: `front/public/assets/living-archive/OFL-NotoSerifKR.txt`
- Create: `front/public/assets/living-archive/paper-grain.svg`
- Create: `front/public/assets/living-archive/cloth-weave.svg`
- Create: `front/features/public/ui/public-home-living-archive.css`

**Interfaces:**
- Consumes the approved task artifact through a task-specific `READMATES_APPROVED_HOME_REFERENCE` environment variable supplied by the coordinator.
- Produces a review-only PNG whose SHA-256 is exactly the approved hash.
- Produces a fixed-copy `Noto Serif KR` weight 500 WOFF2 under 40KB plus the upstream OFL license.
- Produces static `/assets/living-archive/*.svg` texture assets under 10KB each.
- Produces `.living-archive-home` scoped tokens; no root theme or other route changes.

- [ ] **Step 1: Copy and verify the approved reference without turning it into a runtime asset**

Run after the coordinator points `READMATES_APPROVED_HOME_REFERENCE` at the attached artifact:

```bash
mkdir -p front/tests/visual-references
install -m 0644 "$READMATES_APPROVED_HOME_REFERENCE" \
  front/tests/visual-references/public-home-people-between-volumes.png
shasum -a 256 front/tests/visual-references/public-home-people-between-volumes.png
```

Expected hash: `5300d886fcc62edb8bd2c1b4a71dd3a0e58e39d6701cb4effa1f000fdd8a02ee`.

- [ ] **Step 2: Add the verified fixed-copy heading subset from the official font service**

Run:

```bash
mkdir -p front/public/assets/living-archive
font_work_dir=$(mktemp -d)
font_text='책 사이에 사람이 남습니다서로 다른 문장이 한 권의 기억이 됩니다최근 대화 펼치기사람과 문장의 연결함께 읽는 리듬책 선택각자의 읽기함께 대화기록 보관기록은 누구나 읽고, 참여는 초대받은 멤버와 이어갑니다공개 기록기록 아카이브다음 자리첫 기록을 준비하고 있습니다'
curl -fsSLG \
  -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36' \
  --data-urlencode 'family=Noto Serif KR:wght@500' \
  --data-urlencode 'display=swap' \
  --data-urlencode "text=$font_text" \
  'https://fonts.googleapis.com/css2' \
  -o "$font_work_dir/font.css"
font_url=$(sed -n 's/.*url(\(https:[^)]*\)).*/\1/p' "$font_work_dir/font.css" | head -1)
test -n "$font_url"
curl -fsSL "$font_url" -o front/public/assets/living-archive/noto-serif-kr-living-archive-500.woff2
curl -fsSL https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifkr/OFL.txt \
  -o front/public/assets/living-archive/OFL-NotoSerifKR.txt
find "$font_work_dir" -depth -delete
```

Expected: `file front/public/assets/living-archive/noto-serif-kr-living-archive-500.woff2` reports WOFF2, the file is under 40KB, and no runtime Google Fonts request is added.

- [ ] **Step 3: Add the two small texture sources**

Create `front/public/assets/living-archive/paper-grain.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <filter id="paper" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" seed="18"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="table" tableValues="0 0.055"/></feComponentTransfer>
  </filter>
  <rect width="160" height="160" filter="url(#paper)" opacity="0.42"/>
</svg>
```

Create `front/public/assets/living-archive/cloth-weave.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path d="M0 2.5H24M0 8.5H24M0 14.5H24M0 20.5H24" stroke="#fff" stroke-opacity=".08" stroke-width=".7"/>
  <path d="M2.5 0V24M8.5 0V24M14.5 0V24M20.5 0V24" stroke="#000" stroke-opacity=".08" stroke-width=".7"/>
</svg>
```

- [ ] **Step 4: Start the scoped CSS contract**

Create `front/features/public/ui/public-home-living-archive.css` with the local subset and page tokens:

```css
@font-face {
  font-family: "ReadMates Living Archive Serif";
  src: url("/assets/living-archive/noto-serif-kr-living-archive-500.woff2") format("woff2");
  font-style: normal;
  font-weight: 500;
  font-display: swap;
}

.living-archive-home,
.living-archive-home-header {
  --archive-bone: #f5f2eb;
  --archive-carbon: #171817;
  --archive-gray: #66635d;
  --archive-cobalt: #315bce;
  --archive-vermilion: #d65a3a;
  --archive-brass: #b38a45;
  --archive-forest: #233a31;
  --archive-brick: #763d35;
  --archive-mustard: #9a7131;
  --archive-ink-blue: #243b4a;
  --archive-stone: #6e675d;
  color: var(--archive-carbon);
}

.living-archive-home {
  min-width: 0;
  background-color: var(--archive-bone);
  background-image: url("/assets/living-archive/paper-grain.svg");
}

.living-archive-heading {
  font-family: "ReadMates Living Archive Serif", "Noto Serif KR", var(--f-sans);
  font-weight: 500;
  color: var(--archive-carbon);
}
```

- [ ] **Step 5: Verify the foundation**

Run:

```bash
test "$(shasum -a 256 front/tests/visual-references/public-home-people-between-volumes.png | awk '{print $1}')" = \
  "5300d886fcc62edb8bd2c1b4a71dd3a0e58e39d6701cb4effa1f000fdd8a02ee"
file front/public/assets/living-archive/noto-serif-kr-living-archive-500.woff2 | rg "Web Open Font Format"
test "$(stat -f '%z' front/public/assets/living-archive/noto-serif-kr-living-archive-500.woff2)" -lt 40000
test "$(stat -f '%z' front/public/assets/living-archive/paper-grain.svg)" -lt 10000
test "$(stat -f '%z' front/public/assets/living-archive/cloth-weave.svg)" -lt 10000
corepack pnpm --dir front build
```

Expected: all checks PASS, font files are bundled locally, and the reference PNG is absent from `front/dist`.

- [ ] **Step 6: Commit the visual foundation**

```bash
git add \
  front/tests/visual-references/public-home-people-between-volumes.png \
  front/public/assets/living-archive/noto-serif-kr-living-archive-500.woff2 \
  front/public/assets/living-archive/OFL-NotoSerifKR.txt \
  front/public/assets/living-archive/paper-grain.svg \
  front/public/assets/living-archive/cloth-weave.svg \
  front/features/public/ui/public-home-living-archive.css
git commit -m "feat(front): add living archive visual foundation"
```

---

### Task 2: Build the Truthful Living-Archive Projection Model

**Files:**
- Create: `front/features/public/model/public-home-living-archive.test.ts`
- Create: `front/features/public/model/public-home-living-archive.ts`

**Interfaces:**
- Produces `PublicHomeLivingArchiveView` with normalized club copy, ordered real spines, one featured session, max-three distinct reader traces, and a real aggregate remainder.
- Consumes `PublicClubView` plus `PublicSessionDetailView | null | undefined` through type-only imports.
- Ignores detail whose `sessionId` does not equal the latest list item's ID.
- Never expands `stats.sessions` into invented session records.

- [ ] **Step 1: Write the failing pure-model tests**

Create `front/features/public/model/public-home-living-archive.test.ts` with these exact cases:

```ts
import { describe, expect, it } from "vitest";
import { buildPublicHomeLivingArchiveView } from "./public-home-living-archive";
import type { PublicClubView, PublicSessionDetailView } from "./public-display-model";

const club: PublicClubView = {
  clubName: "읽는사이",
  tagline: "함께 읽고 각자의 언어로 남기는 독서모임",
  about: "서로의 질문을 따라 읽습니다.",
  stats: { sessions: 8, books: 8, members: 6 },
  recentSessions: [
    { sessionId: "s8", sessionNumber: 8, bookTitle: "오래된 미래", bookAuthor: "헬레나 노르베리 호지", bookImageUrl: null, date: "2026-04-18", summary: "요약", highlightCount: 3, oneLinerCount: 2 },
    { sessionId: "s7", sessionNumber: 7, bookTitle: "파친코", bookAuthor: "이민진", bookImageUrl: null, date: "2026-03-21", summary: "요약 2", highlightCount: 1, oneLinerCount: 1 },
  ],
};

const detail: PublicSessionDetailView = {
  sessionId: "s8",
  sessionNumber: 8,
  bookTitle: "오래된 미래",
  bookAuthor: "헬레나 노르베리 호지",
  bookImageUrl: null,
  date: "2026-04-18",
  summary: "요약",
  oneLiners: [
    { authorName: "민정", authorShortName: "민", avatarKey: "cloud-green-book", text: "오늘의 문장" },
    { authorName: "민정", authorShortName: "민", avatarKey: "cloud-green-book", text: "같은 사람의 두 번째 문장" },
    { authorName: "지은", authorShortName: "지", avatarKey: "tulip-notebook", text: "다른 문장" },
  ],
  highlights: [
    { authorName: "현우", authorShortName: "현", avatarKey: "toast-brown-book", text: "세 번째 사람", sortOrder: 1 },
  ],
};

describe("buildPublicHomeLivingArchiveView", () => {
  it("keeps only real recent sessions and reports the unseen aggregate", () => {
    const view = buildPublicHomeLivingArchiveView(club, detail);
    expect(view.featured?.session.sessionId).toBe("s8");
    expect(view.spines.map((spine) => spine.session.sessionId)).toEqual(["s7"]);
    expect(view.olderPublishedCount).toBe(6);
  });

  it("selects one public sentence per person and caps traces at three", () => {
    const view = buildPublicHomeLivingArchiveView(club, detail);
    expect(view.traces.map((trace) => [trace.authorName, trace.text, trace.accent])).toEqual([
      ["민정", "오늘의 문장", "cobalt"],
      ["지은", "다른 문장", "vermilion"],
      ["현우", "세 번째 사람", "carbon"],
    ]);
  });

  it("drops mismatched or absent detail without dropping the featured record", () => {
    const mismatched = { ...detail, sessionId: "other" };
    expect(buildPublicHomeLivingArchiveView(club, mismatched).traces).toEqual([]);
    expect(buildPublicHomeLivingArchiveView(club, null).featured?.session.sessionId).toBe("s8");
  });

  it("renders an honest empty shelf and clamps invalid aggregate counts", () => {
    const view = buildPublicHomeLivingArchiveView({ ...club, stats: { sessions: -4, books: -1, members: -1 }, recentSessions: [] }, null);
    expect(view.featured).toBeNull();
    expect(view.spines).toEqual([]);
    expect(view.olderPublishedCount).toBe(0);
    expect(view.emptyState).toBe(true);
  });
});
```

- [ ] **Step 2: Run the RED model test**

```bash
corepack pnpm --dir front test -- features/public/model/public-home-living-archive.test.ts
```

Expected: FAIL because `public-home-living-archive.ts` does not exist.

- [ ] **Step 3: Implement the pure projection**

Create `front/features/public/model/public-home-living-archive.ts` with these public types and deterministic rules:

```ts
import type {
  PublicClubView,
  PublicSessionDetailView,
  PublicSessionListItemView,
} from "./public-display-model";
import { displayText, getPublicClubDisplay, getPublicSessionListItemDisplay, nonNegativeCount } from "./public-display-model";

export type ArchiveSpineTone = "forest" | "mustard" | "brick" | "ink-blue" | "stone";
export type ReaderTraceAccent = "cobalt" | "vermilion" | "carbon";

export type LivingArchiveSpine = {
  session: PublicSessionListItemView;
  title: string;
  author: string;
  dateLabel: string;
  tone: ArchiveSpineTone;
};

export type LivingArchiveTrace = {
  id: string;
  index: number;
  authorName: string;
  authorShortName: string;
  avatarKey: string;
  text: string;
  accent: ReaderTraceAccent;
};

export type PublicHomeLivingArchiveView = {
  club: ReturnType<typeof getPublicClubDisplay>;
  featured: { session: PublicSessionListItemView; display: ReturnType<typeof getPublicSessionListItemDisplay> } | null;
  spines: LivingArchiveSpine[];
  traces: LivingArchiveTrace[];
  olderPublishedCount: number;
  emptyState: boolean;
};

const SPINE_TONES: ArchiveSpineTone[] = ["forest", "mustard", "brick", "ink-blue", "stone"];
const TRACE_ACCENTS: ReaderTraceAccent[] = ["cobalt", "vermilion", "carbon"];

export function buildPublicHomeLivingArchiveView(
  club: PublicClubView,
  detail: PublicSessionDetailView | null | undefined,
): PublicHomeLivingArchiveView {
  const featuredSession = club.recentSessions[0] ?? null;
  const validDetail = featuredSession && detail?.sessionId === featuredSession.sessionId ? detail : null;
  const publicHighlights = [...(validDetail?.highlights ?? [])]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter(
      (highlight): highlight is typeof highlight & { authorName: string; authorShortName: string } =>
        Boolean(highlight.authorName?.trim() && highlight.authorShortName?.trim()),
    );
  const people = [
    ...(validDetail?.oneLiners ?? []),
    ...publicHighlights,
  ];
  const seenAuthors = new Set<string>();
  const traces = people
    .filter((entry) => {
      const author = entry.authorName.trim();
      const text = entry.text.trim();
      const authorKey = `${author}|${entry.avatarKey}`;
      if (!author || !text || seenAuthors.has(authorKey)) return false;
      seenAuthors.add(authorKey);
      return true;
    })
    .slice(0, 3)
    .map((entry, index) => ({
      id: `${featuredSession?.sessionId ?? "empty"}:${index}`,
      index: index + 1,
      authorName: entry.authorName.trim(),
      authorShortName: displayText(entry.authorShortName, entry.authorName.slice(0, 1)),
      avatarKey: entry.avatarKey,
      text: entry.text.trim(),
      accent: TRACE_ACCENTS[index] ?? "carbon",
    }));
  const spines = club.recentSessions.slice(1).map((session, index) => {
    const display = getPublicSessionListItemDisplay(session);
    return { session, title: display.title, author: display.author, dateLabel: display.date, tone: SPINE_TONES[index % SPINE_TONES.length] ?? "stone" };
  });
  const published = nonNegativeCount(club.stats.sessions);

  return {
    club: getPublicClubDisplay(club),
    featured: featuredSession ? { session: featuredSession, display: getPublicSessionListItemDisplay(featuredSession) } : null,
    spines,
    traces,
    olderPublishedCount: Math.max(0, published - club.recentSessions.length),
    emptyState: featuredSession === null,
  };
}
```

- [ ] **Step 4: Run GREEN and focused regression**

```bash
corepack pnpm --dir front test -- \
  features/public/model/public-home-living-archive.test.ts \
  features/public/model/public-display-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the projection**

```bash
git add \
  front/features/public/model/public-home-living-archive.ts \
  front/features/public/model/public-home-living-archive.test.ts
git commit -m "feat(front): project living archive public data"
```

---

### Task 3: Fetch the Featured Session Detail as Fail-Soft Route Enrichment

**Files:**
- Create: `front/features/public/route/public-home-route.test.tsx`
- Modify: `front/features/public/route/public-home-route.tsx`

**Interfaces:**
- Calls `publicSessionQuery(clubSlug, latestSessionId)` only when a latest public session exists.
- Keeps public club query mandatory and metadata unchanged.
- Passes `PublicHomeLivingArchiveView` to `PublicHome`.
- Does not throw the optional query error into `PublicRouteError`.

- [ ] **Step 1: Write the failing route tests**

Create `front/features/public/route/public-home-route.test.tsx` using a `createMemoryRouter`, shared `QueryClient`, `publicClubLoaderFactory`, and `PublicRouteError`. Cover both results:

```ts
it("enriches the latest public record with approved reader traces", async () => {
  installFetch({ detailStatus: 200 });
  renderHomeRoute();
  expect(await screen.findByRole("heading", { name: "책 사이에 사람이 남습니다" })).toBeInTheDocument();
  expect(await screen.findByText("오늘의 문장"), "optional detail is rendered").toBeInTheDocument();
  expect(screen.getByText("민정")).toBeInTheDocument();
});

it("keeps the public home when latest detail fails", async () => {
  installFetch({ detailStatus: 503 });
  renderHomeRoute();
  expect(await screen.findByRole("heading", { name: "책 사이에 사람이 남습니다" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: /오래된 미래.*기록 펼치기/ })).toHaveAttribute("href", "/sessions/s8");
  expect(screen.queryByText("오늘의 문장")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /문제가 생겼/ })).not.toBeInTheDocument();
});
```

The helper must return the club response for `/api/public/clubs/reading-sai` and either the detail response or HTTP 503 for `/api/public/clubs/reading-sai/sessions/s8`. Do not mock TanStack Query or the route component.

- [ ] **Step 2: Run RED**

```bash
corepack pnpm --dir front test -- features/public/route/public-home-route.test.tsx
```

Expected: FAIL because no detail request occurs and the old `PublicHome` prop contract remains.

- [ ] **Step 3: Implement unconditional hooks with conditional optional querying**

Rewrite the route body to this data flow:

```tsx
export function PublicHomeRoute() {
  const data = useLoaderData() as PublicClubRouteData;
  const clubQuery = useQuery(publicClubQuery(data.clubSlug));
  const featuredSessionId = clubQuery.data?.recentSessions[0]?.sessionId ?? "";
  const featuredSessionQuery = useQuery({
    ...publicSessionQuery(data.clubSlug, featuredSessionId),
    enabled: Boolean(featuredSessionId),
    retry: false,
    throwOnError: false,
  });

  if (!clubQuery.data) return <PublicPageMetadataHead />;

  const view = buildPublicHomeLivingArchiveView(clubQuery.data, featuredSessionQuery.data ?? null);
  return (
    <>
      <PublicPageMetadataHead metadata={buildPublicClubPageMetadata(clubQuery.data, "home")} />
      <PublicHome view={view} publicBasePath={data.publicBasePath} />
    </>
  );
}
```

- [ ] **Step 4: Run GREEN and the public route regression set**

```bash
corepack pnpm --dir front test -- \
  features/public/route/public-home-route.test.tsx \
  tests/unit/public-records-page.test.tsx \
  tests/unit/public-session-page.test.tsx \
  features/public/ui/public-page-metadata-head.test.tsx
```

Expected: PASS; metadata and required route failures still follow existing behavior.

- [ ] **Step 5: Commit the route enrichment**

```bash
git add \
  front/features/public/route/public-home-route.tsx \
  front/features/public/route/public-home-route.test.tsx
git commit -m "feat(front): enrich public home with reader traces"
```

---

### Task 4: Match the Approved Home Header Without Changing Other Public Routes

**Files:**
- Create: `front/features/public/ui/public-home-header.test.tsx`
- Create: `front/features/public/ui/public-home-header.tsx`
- Modify: `front/src/app/layouts/public-route-layout.tsx`
- Modify: `front/features/public/ui/public-home-living-archive.css`

**Interfaces:**
- Public-home desktop header shows `ReadMates`, `읽는사이`, `공개 기록 보기`, and an explicit `메뉴 열기` control.
- Menu exposes `클럽 소개`, the current auth action, and closes with Escape/outside click.
- `/about`, `/records`, and `/sessions/:id` continue using the existing `TopNav`.
- Mobile continues using `MobileHeader`; the new desktop header is hidden below 769px.

- [ ] **Step 1: Write the failing header and layout tests**

Cover:

```tsx
expect(screen.getByRole("link", { name: "ReadMates 읽는사이" })).toHaveAttribute("href", "/clubs/sample-book-club");
expect(screen.getByRole("link", { name: "공개 기록 보기" })).toHaveAttribute("href", "/clubs/sample-book-club/records");
await user.click(screen.getByRole("button", { name: "메뉴 열기" }));
expect(screen.getByRole("navigation", { name: "공개 홈 메뉴" })).toBeVisible();
expect(screen.getByRole("link", { name: "클럽 소개" })).toHaveAttribute("href", "/clubs/sample-book-club/about");
await user.keyboard("{Escape}");
expect(screen.queryByRole("navigation", { name: "공개 홈 메뉴" })).not.toBeInTheDocument();
```

In a layout-level test, assert the special header exists at `/clubs/sample-book-club` and the normal public navigation exists at `/clubs/sample-book-club/records`.

- [ ] **Step 2: Run RED**

```bash
corepack pnpm --dir front test -- features/public/ui/public-home-header.test.tsx
```

Expected: FAIL because the header component does not exist.

- [ ] **Step 3: Implement the home-only header**

Use this DOM contract in `public-home-header.tsx`:

```tsx
<header className="living-archive-home-header">
  <div className="living-archive-home-header__inner">
    <LinkComponent to={homeHref} className="living-archive-home-header__brand" aria-label="ReadMates 읽는사이">
      <span className="living-archive-home-header__wordmark">ReadMates</span>
      <span aria-hidden="true" className="living-archive-home-header__divider" />
      <span className="living-archive-home-header__club">읽는사이</span>
    </LinkComponent>
    <div className="living-archive-home-header__actions">
      <LinkComponent to={recordsHref} className="living-archive-home-header__records">공개 기록 보기</LinkComponent>
      <button type="button" className="living-archive-home-header__menu-button" aria-expanded={open} aria-controls="living-archive-home-menu" aria-label={open ? "메뉴 닫기" : "메뉴 열기"} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
      </button>
    </div>
  </div>
  {open ? (
    <nav id="living-archive-home-menu" className="living-archive-home-header__menu" aria-label="공개 홈 메뉴">
      <LinkComponent to={aboutHref}>클럽 소개</LinkComponent>
      <LinkComponent to={authAction.href}>{authAction.label}</LinkComponent>
    </nav>
  ) : null}
</header>
```

`public-route-layout.tsx` must compute `const isPublicHome = location.pathname === basePath || (basePath === "" && location.pathname === "/")` and choose `PublicHomeHeader` only inside the existing desktop-only branch.

- [ ] **Step 4: Match the approved header geometry and color**

Add scoped rules with a 92–96px desktop header, `40px` horizontal inset at the 1487px reference viewport, no bottom border, carbon text, underlined record link, and a 44px menu target. Do not style the shared `TopNav`.

- [ ] **Step 5: Run GREEN and navigation regressions**

```bash
corepack pnpm --dir front test -- \
  features/public/ui/public-home-header.test.tsx \
  tests/unit/public-navigation-auth.test.tsx \
  tests/unit/responsive-navigation.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the header**

```bash
git add \
  front/features/public/ui/public-home-header.tsx \
  front/features/public/ui/public-home-header.test.tsx \
  front/src/app/layouts/public-route-layout.tsx \
  front/features/public/ui/public-home-living-archive.css
git commit -m "feat(front): match living archive public header"
```

---

### Task 5: Build the Canonical First Viewport — Shelf, Featured Volume, People, and Next Slot

**Files:**
- Create: `front/features/public/ui/living-archive-hero.tsx`
- Create: `front/features/public/ui/archive-shelf.tsx`
- Create: `front/features/public/ui/featured-volume.tsx`
- Create: `front/features/public/ui/reader-traces.tsx`
- Rewrite: `front/features/public/ui/public-home.tsx`
- Modify: `front/features/public/ui/public-home-living-archive.css`
- Modify: `front/index.html`
- Modify: `front/tests/unit/public-home.test.tsx`

**Interfaces:**
- `PublicHome({ view, publicBasePath })` receives no API payload or query object.
- H1 is fixed `책 사이에 사람이 남습니다`; supporting line is fixed `서로 다른 문장이 한 권의 기억이 됩니다`.
- Every spine link keeps the original encoded session route.
- Featured volume exposes `기록 펼치기`; secondary action exposes `공개 기록 보기`.
- Reader traces are buttons with `aria-pressed`; hover, focus, and click choose the same relation.
- Empty data renders an empty shelf and club introduction, not fake volumes.

- [ ] **Step 1: Replace the old unit expectations with RED living-archive behavior**

Build the view through `buildPublicHomeLivingArchiveView(publicClubFixture, publicSessionDetailFixture)` and assert:

```tsx
expect(screen.getByRole("heading", { level: 1, name: "책 사이에 사람이 남습니다" })).toBeInTheDocument();
expect(screen.getByText("서로 다른 문장이 한 권의 기억이 됩니다")).toBeInTheDocument();
expect(screen.getByRole("region", { name: "읽는사이 살아 있는 기록 서가" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /No\.6 가난한 찰리의 연감 기록 펼치기/ })).toHaveAttribute("href", "/sessions/00000000-0000-0000-0000-000000000306");
expect(screen.getByRole("link", { name: "공개 기록 보기" })).toHaveAttribute("href", "/records");
expect(screen.getByText("다음 자리")).toBeInTheDocument();
expect(screen.getAllByRole("button", { name: /문장 연결 보기/ })).toHaveLength(3);
expect(container.querySelector(".living-archive-home")).not.toHaveTextContent("작게 읽고 깊게 나누는 모임");
expect(container.querySelectorAll(".public-note-list, .public-record-facts, .public-membership-panel")).toHaveLength(0);
```

Retain encoded-ID, empty-data, scoped-club action, no-sample-data, and `BookCover` fallback assertions.

- [ ] **Step 2: Run RED**

```bash
corepack pnpm --dir front test -- tests/unit/public-home.test.tsx
```

Expected: FAIL against the old public-home composition.

- [ ] **Step 3: Implement the exact component contracts**

Use these signatures:

```ts
export type PublicHomeProps = { view: PublicHomeLivingArchiveView; publicBasePath?: string };
export type LivingArchiveHeroProps = { view: PublicHomeLivingArchiveView; publicBasePath: string };
export type ArchiveShelfProps = { featured: PublicHomeLivingArchiveView["featured"]; spines: LivingArchiveSpine[]; olderPublishedCount: number; traces: LivingArchiveTrace[]; publicBasePath: string };
export type FeaturedVolumeProps = { featured: NonNullable<PublicHomeLivingArchiveView["featured"]>; traces: LivingArchiveTrace[]; publicBasePath: string };
export type ReaderTracesProps = { traces: LivingArchiveTrace[]; activeTrace: number | null; onSelect: (index: number | null) => void };
```

The hero DOM order must be:

```tsx
<section className="living-archive-hero" aria-labelledby="living-archive-title">
  <div className="living-archive-hero__copy">
    <h1 id="living-archive-title" className="living-archive-heading living-archive-hero__title">책 사이에<br />사람이 남습니다</h1>
    <p className="living-archive-hero__promise">서로 다른 문장이 한 권의 기억이 됩니다</p>
  </div>
  <ReaderTraces traces={view.traces} activeTrace={activeTrace} onSelect={setActiveTrace} />
  <ArchiveShelf
    featured={view.featured}
    spines={view.spines}
    olderPublishedCount={view.olderPublishedCount}
    traces={view.traces}
    publicBasePath={publicBasePath}
  />
</section>
```

The shelf must use a semantic list for real sessions, render `olderPublishedCount > 0` as one non-clickable folio marker `이전 공개 기록 N개`, and render a decorative but text-labeled `다음 자리`. It must not map aggregate counts to invented books.

- [ ] **Step 4: Persist the approved direction contract in the production build**

Insert this comment as the first child of `<body>` in `front/index.html`, before the React root:

```html
<!--
THESIS: The public home proves that people remain between accumulated volumes; it refuses the standard headline plus feature-card landing page.
OWN-WORLD: Warm bone paper, carbon type, low-chroma cloth spines, brass folios, cobalt and vermilion reader lines, one bright next slot.
STORY: A visitor recognizes a living reading-club archive, opens the latest public conversation, and understands that participation remains invite-only.
FIRST VIEWPORT: A two-line Korean thesis floats above a full-width shelf; the pulled-open latest volume sits at 56%, reader traces connect from above, and the next slot sits at 82%.
FORM: User-pinned People Between the Volumes; seed user-pinned-people-between-volumes-20260812.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
```

After the first production build, run `rg -n "user-pinned-people-between-volumes-20260812" front/dist/index.html`. Expected: one match.

- [ ] **Step 5: Implement the relation lines and accessible interaction**

Use one responsive SVG overlay with `viewBox="0 0 1487 420"`, three fixed paths, `pathLength="1"`, and one class per accent. Each trace button sets the active relation on pointer enter, focus, and click; pointer leave clears only a hover-selected relation, while click/tap keeps `aria-pressed=true` until another trace or the same trace is selected. On mobile, hide the SVG and retain the same numbered relation in document flow.

- [ ] **Step 6: Implement the reference geometry**

At `min-width: 1180px`, the CSS must use these anchor values:

```css
.living-archive-hero { min-height: 682px; position: relative; padding-top: 18px; }
.living-archive-hero__copy { position: relative; z-index: 3; width: min(44vw, 650px); margin-left: max(40px, calc((100vw - 1407px) / 2)); }
.living-archive-hero__title { margin: 0; font-size: clamp(58px, 4.35vw, 70px); line-height: 1.08; letter-spacing: -0.045em; }
.living-archive-shelf { position: absolute; inset-inline: 0; top: 292px; height: 390px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(270px, 19%) minmax(150px, 11%) minmax(0, .55fr); align-items: end; }
.living-archive-shelf__ledge { position: absolute; inset-inline: 0; bottom: 0; height: 34px; background: var(--archive-bone); border-block: 1px solid rgb(23 24 23 / 18%); box-shadow: 0 8px 18px rgb(23 24 23 / 12%); }
.featured-volume { min-height: 535px; transform: translateY(18px); }
.living-archive-next-slot { min-height: 365px; margin-bottom: 34px; }
```

The featured volume must occupy the visual center around 56% of viewport width; the next slot around 82%. Adjust the grid tracks rather than adding absolute per-book coordinates. At the 1487×1058 fixture, keep all design-spec normalized anchors within tolerance.

- [ ] **Step 7: Run GREEN and focused shared-component regressions**

```bash
corepack pnpm --dir front test -- \
  tests/unit/public-home.test.tsx \
  tests/unit/book-cover.test.tsx \
  shared/ui/avatar-chip.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the canonical viewport**

```bash
git add \
  front/features/public/ui/living-archive-hero.tsx \
  front/features/public/ui/archive-shelf.tsx \
  front/features/public/ui/featured-volume.tsx \
  front/features/public/ui/reader-traces.tsx \
  front/features/public/ui/public-home.tsx \
  front/features/public/ui/public-home-living-archive.css \
  front/index.html \
  front/tests/unit/public-home.test.tsx
git commit -m "feat(front): build living archive public hero"
```

---

### Task 6: Complete the Lower Editorial Strip, Responsive Recomposition, and Meaningful Motion

**Files:**
- Create: `front/features/public/ui/public-reading-rhythm.tsx`
- Create: `front/features/public/ui/public-membership-boundary.tsx`
- Create: `front/features/public/ui/public-archive-index.tsx`
- Modify: `front/features/public/ui/public-home.tsx`
- Modify: `front/features/public/ui/public-home-living-archive.css`
- Modify: `front/features/public/ui/public-link.tsx`
- Modify: `front/features/public/ui/public-session.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/unit/public-home.test.tsx`

**Interfaces:**
- Lower strip starts immediately below the shelf and uses straight border divisions, not floating cards.
- Information order is recent meeting → people and sentences → reading rhythm → public/invite boundary → archive index.
- Mobile order is brand phrase → featured meeting → reader traces → next slot/membership entry → vertical archive.
- `Link viewTransition` is forwarded only inside a router and falls back to a normal anchor outside a router.
- Shared public-record and public-session styles remain intact.

- [ ] **Step 1: Write RED tests for lower-section semantics and transition fallback**

Add assertions for:

```tsx
expect(screen.getByRole("heading", { name: "최근 대화 펼치기" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "함께 읽는 리듬" })).toBeInTheDocument();
expect(screen.getByText("책 선택")).toBeInTheDocument();
expect(screen.getByText("각자의 읽기")).toBeInTheDocument();
expect(screen.getByText("함께 대화")).toBeInTheDocument();
expect(screen.getByText("기록 보관")).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "기록은 누구나 읽고, 참여는 초대받은 멤버와 이어갑니다" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "둘러보기" })).toHaveAttribute("href", "/clubs/reading-sai/app");
expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute("href", "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp");
```

Add a `PublicLink` unit case that renders outside a router and verifies the resulting anchor has no `viewtransition` attribute.

- [ ] **Step 2: Run RED**

```bash
corepack pnpm --dir front test -- tests/unit/public-home.test.tsx features/public/ui/public-link.test.tsx
```

Expected: FAIL because lower components and the fallback transition filter do not exist.

- [ ] **Step 3: Implement the lower strip without repeated content**

`PublicHome` must compose:

```tsx
<main className="living-archive-home">
  <LivingArchiveHero view={view} publicBasePath={publicBasePath} />
  {view.featured ? (
    <section className="living-archive-conversation-strip" aria-labelledby="recent-conversation-title">
      <div className="living-archive-conversation-strip__book">
        <h2 id="recent-conversation-title" className="living-archive-heading">최근 대화 펼치기</h2>
        <BookCover
          title={view.featured.display.title}
          author={view.featured.display.author}
          imageUrl={view.featured.session.bookImageUrl}
          width={170}
        />
      </div>
      <div className="living-archive-conversation-strip__record">
        <blockquote>{view.traces[0]?.text ?? view.featured.display.summary}</blockquote>
        <div className="living-archive-conversation-strip__people">
          {view.traces.map((trace) => (
            <AvatarChip key={trace.id} avatarKey={trace.avatarKey} name={trace.authorName} label="" sizeRole="author" />
          ))}
        </div>
        <Link to={publicSessionHref(view.featured.session, publicBasePath)}>기록 펼치기</Link>
      </div>
    </section>
  ) : null}
  <PublicReadingRhythm />
  <PublicMembershipBoundary publicBasePath={publicBasePath} />
  <PublicArchiveIndex spines={view.spines} featured={view.featured} publicBasePath={publicBasePath} />
</main>
```

The conversation strip is a 60/40 bordered grid at desktop and a one-column stack at mobile. It may repeat the featured title once but must not repeat its full summary in both panels. The archive index shows only session number, title, and date.

- [ ] **Step 4: Implement view-transition progressive enhancement**

Update `public-link.tsx` so `viewTransition` is preserved for `RouterLink` and removed from fallback `<a>`. Add `viewTransition` to the featured-volume link. Add matching `view-transition-name: readmates-featured-volume` to the home featured cover and public-session identity cover inside an `@supports (view-transition-name: none)` block. Do not add a polyfill.

- [ ] **Step 5: Implement bounded motion and static reduced-motion state**

Use:

```css
@keyframes archive-volume-enter {
  from { opacity: 0; transform: translateY(18px) rotateY(-2deg); }
  to { opacity: 1; transform: translateY(18px) rotateY(0); }
}

.featured-volume { animation: archive-volume-enter 650ms cubic-bezier(.2,.72,.2,1) both; }
.reader-trace__path { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 420ms ease, opacity 180ms ease; }
.reader-trace__path[data-active="true"] { stroke-dashoffset: 0; }

@media (prefers-reduced-motion: reduce) {
  .living-archive-home *, .living-archive-home *::before, .living-archive-home *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
  .featured-volume { opacity: 1; transform: translateY(18px); }
  .reader-trace__path { stroke-dashoffset: 0; }
}
```

- [ ] **Step 6: Implement responsive recomposition**

At `max-width: 1179px`, reduce visible spines by CSS only while keeping every session in the archive index. At `max-width: 768px`, remove absolute shelf layout and SVG lines, switch the hero to normal document flow, show featured volume first, use a vertical trace list, then the next-slot/membership block and archive index. Assert no `overflow-x: auto` or `white-space: nowrap` on the home shelf.

- [ ] **Step 7: Remove only superseded old home CSS**

Delete the old `.public-home-hero*`, `.public-latest-record*` rules that are home-only and no longer referenced. Keep `.public-record-index-row`, `.public-session-*`, `.public-archive-row` rules still used by `/records`, `/about`, or `/sessions/:id`. Confirm each deletion with `rg` before removal.

- [ ] **Step 8: Run GREEN and focused regressions**

```bash
corepack pnpm --dir front test -- \
  tests/unit/public-home.test.tsx \
  features/public/ui/public-link.test.tsx \
  tests/unit/public-session-page.test.tsx \
  tests/unit/public-records-page.test.tsx
corepack pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 9: Commit the completed responsive surface**

```bash
git add \
  front/features/public/ui/public-reading-rhythm.tsx \
  front/features/public/ui/public-membership-boundary.tsx \
  front/features/public/ui/public-archive-index.tsx \
  front/features/public/ui/public-home.tsx \
  front/features/public/ui/public-home-living-archive.css \
  front/features/public/ui/public-link.tsx \
  front/features/public/ui/public-link.test.tsx \
  front/features/public/ui/public-session.tsx \
  front/src/styles/globals.css \
  front/tests/unit/public-home.test.tsx
git commit -m "feat(front): complete living archive public home"
```

---

### Task 7: Prove Visual Fidelity, Accessibility, Route Continuity, and Record the Shipped World

**Files:**
- Modify: `front/features/public/ui/public-home.ct.tsx`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify: `front/tests/e2e/guest-browsing.spec.ts`
- Create: `front/__screenshots__/features/public/ui/public-home.ct.tsx/public-home-living-archive-reference.png`
- Create: `front/__screenshots__/features/public/ui/public-home.ct.tsx/public-home-living-archive-tablet.png`
- Create: `front/__screenshots__/features/public/ui/public-home.ct.tsx/public-home-living-archive-mobile.png`
- Create: `front/__screenshots__/features/public/ui/public-home.ct.tsx/public-home-living-archive-mobile-320.png`
- Create: `DESIGN.md`
- Create: `front/.impeccable/surfaces/front-features-public-ui-public-home-tsx.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces deterministic visual evidence at 1487×1058, 768×1024, 390×844, and 320×720.
- Produces 200% zoom and reduced-motion assertions without horizontal overflow or hidden actions.
- Produces side-by-side reference review crops for header/hero, shelf, and lower strip.
- Preserves public metadata, public-record detail, records index, guest/member entry, and mobile navigation behavior.

- [ ] **Step 1: Replace the old CT with a truthful deterministic public-home fixture**

Pass a `PublicHomeLivingArchiveView` containing six public-safe fixture sessions and three public-safe reader traces. The reference viewport mounts the real `PublicHomeHeader` plus `PublicHome` inside a memory router; mobile layout chrome remains covered by E2E. Add screenshot tests:

```ts
for (const viewport of [
  { name: "reference", width: 1487, height: 1058 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 720 },
] as const) {
  test(`PublicHome matches the living archive composition on ${viewport.name}`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mount(
      <MemoryRouter initialEntries={["/clubs/reading-sai"]}>
        {viewport.name === "reference" ? (
          <PublicHomeHeader authenticated={false} publicBasePath="/clubs/reading-sai" LinkComponent={Link} />
        ) : null}
        <PublicHome view={publicHomeView} publicBasePath="/clubs/reading-sai" />
      </MemoryRouter>,
    );
    await expect(page).toHaveScreenshot(`public-home-living-archive-${viewport.name}.png`, { animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
```

- [ ] **Step 2: Add geometry and typography assertions at the reference viewport**

Measure the header, H1, shelf, featured volume, next slot, ledge, and lower strip. Convert bounding boxes to viewport percentages and assert the design-spec tolerance. Assert H1 font includes `ReadMates Living Archive Serif`, dynamic quote/title fonts include `Pretendard`, and computed text colors never equal the forest spine color.

- [ ] **Step 3: Add focus/tap/reduced-motion/zoom checks**

Assert every trace button is at least 44px on touch, keyboard focus changes the same `aria-pressed`/path state as pointer interaction, `prefers-reduced-motion` exposes final positions, and `page.evaluate(() => document.body.style.zoom = "2")` or browser-context 200% equivalent does not create horizontal page overflow at 320px.

- [ ] **Step 4: Update the E2E public-home assertions**

In `responsive-navigation-chrome.spec.ts`, replace the deleted `.public-home-hero__latest`/peek checks with the new H1, featured volume, and first viewport checks. In `guest-browsing.spec.ts`, route the optional session-detail request to 503 for one case and prove the home, public records link, and member-entry actions remain visible.

- [ ] **Step 5: Generate the first deterministic screenshot set**

```bash
corepack pnpm --dir front test:ct:update:docker
corepack pnpm --dir front test:ct:docker
```

Expected: PASS with four new/updated baselines.

- [ ] **Step 6: Perform bounded visual review round one**

Capture or reuse these actual crops at 1487×1058:

1. header plus brand phrase,
2. reader traces plus shelf/featured volume/next slot,
3. shelf ledge plus lower editorial strip.

Open each actual crop and the matching region of `front/tests/visual-references/public-home-people-between-volumes.png` side by side. Batch every material mismatch in geometry, type character, cloth/paper material, line weight, color, and content density into one fix pass. A generic-card result is a rebuild failure, not a polish item.

- [ ] **Step 7: Perform one confirmation screenshot round**

Run the Docker CT again and inspect reference desktop plus 390px mobile together. Stop local polishing after this confirmation round.

- [ ] **Step 8: Run the Impeccable detector once**

```bash
test -n "$IMPECCABLE_SKILL_ROOT"
node "$IMPECCABLE_SKILL_ROOT/scripts/detect.mjs" --json \
  front/features/public/ui/public-home.tsx \
  front/features/public/ui/living-archive-hero.tsx \
  front/features/public/ui/archive-shelf.tsx \
  front/features/public/ui/featured-volume.tsx \
  front/features/public/ui/reader-traces.tsx \
  front/features/public/ui/public-home-living-archive.css
```

Fix mechanical findings in one batch. Do not run the detector a second time.

- [ ] **Step 9: Request independent finish review**

Spawn `impeccable-finish-reviewer` fresh with `fork_turns: "none"`. Pass the original request, the canonical reference PNG, desktop/mobile screenshot paths, the design-spec fidelity contract, detector findings, and `$IMPECCABLE_SKILL_ROOT/reference/craft-floor.md`. If the reviewer calls for wholesale rebuild, stop and return the named failed regions to the user. Otherwise apply material fixes in one batch, recapture, and obtain the reviewer's resolution verdict.

- [ ] **Step 10: Record the shipped design world**

Use the Impeccable documenter to create `DESIGN.md` from the built result. It must state that Living Archive is the public-home visual world and does not silently restyle member, host, or admin surfaces. Write `front/.impeccable/surfaces/front-features-public-ui-public-home-tsx.md` with the visitor mode, canonical reference identity, real-data constraint, memorable shelf interaction, and mobile recomposition.

- [ ] **Step 11: Update changelog and acceptance handoff**

Add one `Unreleased` item describing the public-home redesign and optional latest-session enrichment. Record selected acceptance rows (`Guest/public exposure`, `UI or runtime state`), excluded adjacent rows, automated evidence, manual side-by-side evidence, and no production/deploy validation.

- [ ] **Step 12: Run the complete verification set at final HEAD**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front test:coverage
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
corepack pnpm --dir front test:ct:docker
git diff --check
local_path_prefix='/'"Users/"
if rg -n "$local_path_prefix|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|api[_-]?key|token-shaped" \
  front/features/public front/tests/visual-references DESIGN.md CHANGELOG.md; then
  exit 1
fi
```

Expected: every command PASS. The final `rg` must return no private path, identity, secret, or token-shaped content introduced by this slice.

- [ ] **Step 13: Commit evidence and documentation**

```bash
git add \
  front/features/public/ui/public-home.ct.tsx \
  front/__screenshots__/features/public/ui/public-home.ct.tsx \
  front/tests/e2e/responsive-navigation-chrome.spec.ts \
  front/tests/e2e/guest-browsing.spec.ts \
  front/.impeccable/surfaces/front-features-public-ui-public-home-tsx.md \
  DESIGN.md \
  CHANGELOG.md
git commit -m "test(front): prove living archive public home"
```

---

## Final Fidelity Gate

The implementation is complete only when all of the following are true:

- The 1487×1058 actual screenshot reads as the same design as the canonical reference before any explanation: same first-viewport hierarchy, shelf silhouette, pulled-open volume, people-to-book lines, bright next slot, ledge, and lower strip.
- Header height, H1 start, shelf top/bottom, featured center, next-slot center, and lower-strip start meet the design-spec normalized tolerances.
- No old card-grid public home remains under the new palette.
- No green heading/body/button/link/navigation text exists.
- Every visible book and person comes from public data or a clearly aggregate, non-personal index marker.
- Optional detail failure removes traces only; mandatory club failure still uses the existing route error.
- Desktop, tablet, 390px, 320px, 200% zoom, keyboard, tap, and reduced-motion evidence is present.
- The independent finish reviewer returns a resolved/pass disposition or the user explicitly accepts listed open findings.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-12-readmates-living-archive-public-home-redesign.md`. Two execution options:

1. **Subagent-Driven (recommended):** execute task-by-task in this session using `subagent-driven-development`, with fresh implementer/reviewer boundaries and the canonical reference passed to every visual task.
2. **Inline Execution:** execute the same checklist in one isolated worktree using `executing-plans`, preserving RED/GREEN, bounded screenshot rounds, and the independent finish review.
