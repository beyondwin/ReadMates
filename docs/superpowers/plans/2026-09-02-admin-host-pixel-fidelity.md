# Admin·Host Approved Mockup Pixel Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 Admin `01–07`과 Host `07–17` 시안을 code-native React UI로 픽셀 근접 재현하면서 기존 기능·권한·안전·접근성 계약을 보존한다.

**Architecture:** 승인 PNG와 deterministic fixture를 immutable manifest로 묶고, Playwright CT가 reference hash·candidate screenshot·overlay·diff·geometry report를 한 실행에서 생성한다. 공통 typography와 role-scoped shell을 먼저 맞춘 뒤 Admin과 Host의 load-bearing slice를 RED/GREEN으로 수렴시키고, 나머지 승인 화면과 실제 route E2E를 같은 계약에 연결한다.

**Tech Stack:** React 19, TypeScript 6, Vite 8, React Router 8, Vitest 4, Playwright 1.61 CT/E2E, CSS custom properties, bundled Pretendard Variable, Node `fs`/`crypto`, browser Canvas API

**Spec:** `docs/superpowers/specs/2026-09-02-admin-host-pixel-fidelity-design.md`

**Plan base:** `0b6c1dd79`

ADR impact: new — ADR-0053

ADR-0053 remains `Proposed` until Tasks 1–11 and the acceptance evidence agree.

## Global Constraints

- ADR impact는 `new`; ADR-0053은 구현·테스트·active docs가 일치할 때까지 `Proposed`다.
- 시각 권위는 Admin `design/mockups/2026-08-30-admin-operations-redesign/01–07`과 Host `docs/development/host-redesign-mockups/07–17`이다.
- 승인 PNG를 runtime background 또는 UI image로 렌더링하지 않는다.
- Desktop candidate는 reference intrinsic viewport, mobile candidate는 390 CSS px viewport에서 capture한다.
- Geometry tolerance는 major region 4 CSS px, 반복 component 내부 정렬·간격 2 CSS px다.
- 기능, 접근성, 권한, safe-command, receipt, authority-loss, cursor, recovery 계약은 삭제하거나 약화하지 않는다.
- 시안에 없는 보조 조작은 progressive disclosure 또는 다음 단계로 재배치한다.
- Admin label은 `오늘 할 일`; Host semantic order는 `현재 모임 → 단계 → 다음 행동 → 준비 현황 → 작업함`이다.
- 보이는 interactive target은 최소 44px이고, visible focus, reduced motion, Korean/English wrapping, mobile safe-area를 유지한다.
- 실제 회원·클럽·배포 데이터, secret, private domain, 로컬 절대 경로를 tracked artifact에 넣지 않는다.
- API, DTO, BFF, server, migration, deploy는 비범위다. 해당 경계가 필요해지면 구현을 중단하고 새 승인을 받는다.
- Root `packageManager`인 `pnpm@11.13.1`을 Corepack으로 실행한다.
- Shared token/CSS/component/fixture가 바뀌면 manifest invalidation map의 모든 downstream reference를 다시 검증한다.
- Candidate snapshot 갱신은 합격 증거가 아니다. Reference/candidate/overlay/diff/measurement와 독립 검토가 모두 필요하다.

---

## File Structure and Ownership

### New files

- `front/tests/e2e/support/approved-mockup-manifest.ts` — 18개 승인 자산의 path, SHA-256, canvas, CSS viewport, tolerance, owning CT를 단일 source로 보존한다.
- `front/tests/e2e/support/approved-mockup-contract.ts` — hash 검증, geometry assertion, Canvas normalize/overlay/diff, JSON report 생성을 담당한다.
- `front/tests/unit/approved-mockup-contract.test.ts` — manifest integrity와 geometry tolerance의 fail-closed 동작을 검증한다.
- `front/features/host/ui/approved-host-ledgers.fixtures.tsx` — Host `10–14`, `17`에 대응하는 safe deterministic presentation fixture만 소유한다.
- `front/features/host/ui/approved-host-ledgers.ct.tsx` — Host meetings/people/records/settings/schedule-review/person-detail 승인 화면의 CT와 reference 비교를 소유한다.
- `docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md` — 실제 자동·수동 evidence, reviewer 결과, 의도적 차이, 잔여 위험을 기록한다.

### Existing files with scoped changes

- `front/package.json` — approved visual CT focused command를 추가한다. 새 runtime dependency는 추가하지 않는다.
- `front/shared/ui/app-club-shell.story.tsx`, `front/shared/ui/app-club-shell.ct.tsx` — 실제 Host shell desktop/mobile fixture와 member non-regression을 함께 고정한다.
- `front/features/platform-admin/route/admin-shell-layout.{tsx,ct.tsx,test.tsx}` — Admin header/rail/mobile shell geometry와 정확한 navigation copy를 맞춘다.
- `front/features/platform-admin/ui/admin-shell.css`, `admin-page-patterns.css`, `admin-editorial-ledger.css`, `admin-club-management.css`, `admin-service-status.css`, `admin-processing-records.css` — Admin `01–07`의 role-scoped visual implementation을 소유한다.
- `front/features/platform-admin/ui/admin-today-ledger.{tsx,test.tsx}`, `admin-today-controls.{tsx,test.tsx}`, `admin-operations-queue.tsx`, `admin-operation-mobile-detail.tsx` — queue-first order와 secondary disclosure를 소유한다.
- `front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts`, `admin-editorial-ledger.ct.tsx` — Admin `01–07`의 deterministic candidate를 소유한다.
- `front/features/host/ui/shell/host-shell.css`, `host-shell.ct.tsx` — Host-only top navigation/mobile bottom navigation geometry를 소유한다.
- `front/features/host/ui/workbox/host-work-item.tsx`, `host-workbox.{css,test.tsx,ct.tsx}` — compact row와 보조 조작 disclosure를 소유한다.
- `front/features/host/ui/operating-room/host-operating-room-page.tsx`, `operating-room.css`, `host-operating-room-responsive.ct.tsx`, `operating-room.ct.tsx` — Host `07–09`, `15–16`의 semantic order와 geometry를 소유한다.
- `front/features/host/ui/host-editorial-ledger.css`, `meeting-list/meeting-toc.css`, `members/member-ledger.css`, `person/host-person-detail.css` — Host `10–14`, `17`의 route-specific ledger styling을 소유한다.
- `front/features/host/ui/settings/*.tsx`, `front/features/host/ui/schedule-review/host-schedule-review-header.tsx` — 기존 기능을 유지한 채 승인 composition에 필요한 presentation wrappers만 조정한다.
- `front/tests/e2e/admin-operations-command-center.spec.ts`, `admin-clubs-triage.spec.ts`, `host-lifecycle-route-continuity.spec.ts`, `host-workbox-stage4.spec.ts`, `host-authority-loss.spec.ts` — real route, Back/Forward, mutation/recovery non-regression을 소유한다.
- `front/DESIGN.md`, affected Admin/Host active design docs, `docs/development/architecture.md`, `CHANGELOG.md`, ADR-0053과 두 ADR index — 구현된 visual authority와 evidence를 active 문서로 승격한다.

### Files that must not change

- `design/mockups/2026-08-30-admin-operations-redesign/*.png`와 sidecar JSON
- `docs/development/host-redesign-mockups/07–17*.png`
- `front/features/**/api`, `queries`, server/BFF/migration/deploy files

---

### Task 1: Immutable Approved-Mockup Contract and Diff Harness

**Files:**
- Create: `front/tests/e2e/support/approved-mockup-manifest.ts`
- Create: `front/tests/e2e/support/approved-mockup-contract.ts`
- Create: `front/tests/unit/approved-mockup-contract.test.ts`
- Modify: `front/package.json`

**Interfaces:**
- Produces: `APPROVED_MOCKUPS: readonly ApprovedMockupEntry[]`
- Produces: `approvedMockup(id): ApprovedMockupEntry`
- Produces: `approvedMockupsAffectedBy(changedPaths): readonly ApprovedMockupEntry[]`
- Produces: `verifyApprovedReference(entry): void`
- Produces: `expectGeometryWithinTolerance(actual, expected, toleranceCssPx): void`
- Produces: `expectLocatorGeometry(locator, expected, toleranceCssPx): Promise<void>`
- Produces: `isSemanticDocumentOrder(locators): Promise<boolean>`
- Produces: `captureApprovedComparison({ page, testInfo, entry, candidate, regions }): Promise<ApprovedComparisonReport>`
- Consumes: Node `createHash`, `readFileSync`, `writeFileSync`; browser Canvas only. No image package is added.

- [ ] **Step 1: Write failing manifest and geometry tests**

```ts
import { describe, expect, it } from "vitest";
import { APPROVED_MOCKUPS, approvedMockupsAffectedBy } from "../e2e/support/approved-mockup-manifest";
import { expectGeometryWithinTolerance, verifyApprovedReference } from "../e2e/support/approved-mockup-contract";

describe("approved mockup contract", () => {
  it("registers the exact 7 Admin and 11 Host authorities with unique ids", () => {
    expect(APPROVED_MOCKUPS.filter((entry) => entry.role === "admin")).toHaveLength(7);
    expect(APPROVED_MOCKUPS.filter((entry) => entry.role === "host")).toHaveLength(11);
    expect(new Set(APPROVED_MOCKUPS.map((entry) => entry.id)).size).toBe(18);
    for (const entry of APPROVED_MOCKUPS) verifyApprovedReference(entry);
  });

  it("fails closed above the 4 CSS px major-region tolerance", () => {
    expect(() => expectGeometryWithinTolerance(
      { x: 0, y: 0, width: 100, height: 80 },
      { x: 0, y: 0, width: 104.01, height: 80 },
      4,
    )).toThrow(/width delta 4.01px/);
  });

  it("maps shared visual dependencies to every downstream authority", () => {
    expect(approvedMockupsAffectedBy(["shared/ui/app-club-shell.tsx"])
      .filter((entry) => entry.role === "host")).toHaveLength(11);
    expect(approvedMockupsAffectedBy(["features/platform-admin/ui/admin-shell.css"]))
      .toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `corepack pnpm --dir front exec vitest run tests/unit/approved-mockup-contract.test.ts`

Expected: FAIL because both support modules are missing.

- [ ] **Step 3: Create the fail-closed manifest types and exact entries**

```ts
export type ApprovedMockupEntry = {
  id: string;
  role: "admin" | "host";
  referencePath: string;
  sha256: string;
  referenceSize: { width: number; height: number };
  cssViewport: { width: number; height: number };
  dependencyPaths: readonly string[];
  ownerTest: string;
  maxDiffPixelRatio: 0.02;
  maxChannelDelta: 51;
  majorRegionToleranceCssPx: 4;
  repeatedAlignmentToleranceCssPx: 2;
};

export function approvedMockupsAffectedBy(changedPaths: readonly string[]): readonly ApprovedMockupEntry[] {
  const normalized = new Set(changedPaths.map((path) => path.replace(/^front\//, "")));
  return APPROVED_MOCKUPS.filter((entry) => entry.dependencyPaths.some((path) => normalized.has(path)));
}
```

Register these entries exactly. Set `referenceSize` to 1672×941 for Admin desktop entries, 853×1844 for Admin mobile entries, 1536×1024 for Host desktop entries, and 866×1846 for Host mobile entries. `cssViewport` remains the table value below. Each `dependencyPaths` list contains its route fixture/component/CSS plus shared shell/token files that can alter the rendered frame; shared Admin paths map to all seven Admin entries and shared Host paths map to all eleven Host entries.

| id | reference path | SHA-256 | CSS viewport | owner CT |
| --- | --- | --- | --- | --- |
| `admin-today-desktop` | `../design/mockups/2026-08-30-admin-operations-redesign/01-today-desktop.png` | `5d4d778850e45bce7449002c186ccea6fa7f830d1cee76ff38a904b1971ea76b` | 1672×941 | `admin-editorial-ledger.ct.tsx` |
| `admin-clubs-desktop` | `../design/mockups/2026-08-30-admin-operations-redesign/02-clubs-desktop.png` | `273f2fbfc4df955ce837b0120cb9b518f10991be546c218d707ded9a32d67c91` | 1672×941 | `admin-editorial-ledger.ct.tsx` |
| `admin-service-desktop` | `../design/mockups/2026-08-30-admin-operations-redesign/03-service-status-desktop.png` | `6b6af23ba5eb6b25437d5ff2bdbe50f9d9dcbf8e62092705ed28485a1a584b2b` | 1672×941 | `admin-editorial-ledger.ct.tsx` |
| `admin-records-desktop` | `../design/mockups/2026-08-30-admin-operations-redesign/04-processing-records-desktop.png` | `0d318e14a7757e279cb4595a3bfc299335a6262a95edf23ed5c719b62940cbd3` | 1672×941 | `admin-editorial-ledger.ct.tsx` |
| `admin-space-switcher-desktop` | `../design/mockups/2026-08-30-admin-operations-redesign/05-space-switcher-desktop.png` | `dfc9222888cf41cdd4f0e3c03c260be349f5fe3120068486f0151fc1a07578a8` | 1672×941 | `admin-shell-layout.ct.tsx` |
| `admin-today-mobile` | `../design/mockups/2026-08-30-admin-operations-redesign/06-today-mobile.png` | `c3171752bfd56d7957dea6cfb06f4031692113024a0bf3b2bcc452f61b6d9aeb` | 390×844 | `admin-editorial-ledger.ct.tsx` |
| `admin-work-detail-mobile` | `../design/mockups/2026-08-30-admin-operations-redesign/07-work-detail-mobile.png` | `a6098cbb77c991197e7e03e2b803438342a66daad3d83c46b2dc74b90de16291` | 390×844 | `admin-editorial-ledger.ct.tsx` |
| `host-prep-desktop` | `../docs/development/host-redesign-mockups/07-host-lifecycle-operating-room-approved.png` | `fc5f8fd00301d90f3616c335306ca9cf99c59293589841ca3601afdbb04c25a9` | 1536×1024 | `host-operating-room-responsive.ct.tsx` |
| `host-live-desktop` | `../docs/development/host-redesign-mockups/08-host-operating-room-live-approved.png` | `9a0b50081506f266eccff15606e2e74da0b926b699166d9ce56020c8b263ff15` | 1536×1024 | `host-operating-room-responsive.ct.tsx` |
| `host-closing-desktop` | `../docs/development/host-redesign-mockups/09-host-operating-room-closing-approved.png` | `be94c7e1adc587d27c6f5e37b2a2f61f658d47e067b44961f8bb6e527542ac08` | 1536×1024 | `host-operating-room-responsive.ct.tsx` |
| `host-meetings-desktop` | `../docs/development/host-redesign-mockups/10-host-meetings-library-approved.png` | `7385c5f2369be3b3fcbfe7a87f737a4325802890e3dff2d9892161e0eed28f94` | 1536×1024 | `approved-host-ledgers.ct.tsx` |
| `host-people-desktop` | `../docs/development/host-redesign-mockups/11-host-people-ledger-approved.png` | `a1b2afb663cc9cdf304563f189bc2306908eb9da28cb3da9cd94d47ba908c50f` | 1536×1024 | `approved-host-ledgers.ct.tsx` |
| `host-records-desktop` | `../docs/development/host-redesign-mockups/12-host-records-ledger-approved.png` | `8ca899b88148f9491149017653d7d71e8b8d34642f4f8b92c794b5f3717254cf` | 1536×1024 | `approved-host-ledgers.ct.tsx` |
| `host-settings-desktop` | `../docs/development/host-redesign-mockups/13-host-invites-settings-approved.png` | `80cb99506f90337660fcf42857d5f556e8a92a9932cf0e3f9f15e39180675b95` | 1536×1024 | `approved-host-ledgers.ct.tsx` |
| `host-schedule-review-desktop` | `../docs/development/host-redesign-mockups/14-host-unread-schedule-review-approved.png` | `ca58ef916dd5487dca5811f395ed44792febfa86a4c3bf60f4bd5f9333a0bd61` | 1536×1024 | `approved-host-ledgers.ct.tsx` |
| `host-prep-mobile` | `../docs/development/host-redesign-mockups/15-mobile-host-operating-room-prep-approved.png` | `fde68389cc111e6c9cfe06543a50ac749cca937f65f3cd4f07d7369796e3ec3a` | 390×832 | `host-operating-room-responsive.ct.tsx` |
| `host-live-mobile` | `../docs/development/host-redesign-mockups/16-mobile-host-live-attendance-approved.png` | `b3fd160481039d28857ee9de88593c897f4ee9a51a19de99fb395453ee4e33d5` | 390×832 | `host-operating-room-responsive.ct.tsx` |
| `host-person-mobile` | `../docs/development/host-redesign-mockups/17-mobile-host-person-detail-approved.png` | `12c542d4d409f2390c987acbb2c0bed886fa874bfe256f4fda8653df1afe44c5` | 390×832 | `approved-host-ledgers.ct.tsx` |

Use this invalidation ownership when filling `dependencyPaths`:

| dependency group | affected manifest ids |
| --- | --- |
| Admin shell, page patterns, typography, tokens | all `admin-*` ids |
| Admin Today queue/docket/controls | `admin-today-desktop`, `admin-today-mobile`, `admin-work-detail-mobile` |
| Admin club/service/records/switcher route files | the matching `admin-clubs-desktop`, `admin-service-desktop`, `admin-records-desktop`, or `admin-space-switcher-desktop` id |
| Host `AppClubShell`, shell CSS, typography, tokens | all `host-*` ids |
| Host operating room and workbox | `host-prep-desktop`, `host-live-desktop`, `host-closing-desktop`, `host-prep-mobile`, `host-live-mobile` |
| Host meeting/member/record/settings/review/person route files | their matching desktop id; member/person shared files also affect `host-person-mobile` |

- [ ] **Step 4: Implement hash, geometry, Canvas comparison, and report writing**

Use these result contracts; a mismatch or missing reference throws before screenshot approval:

```ts
export type ApprovedRegion = {
  name: string;
  actual: { x: number; y: number; width: number; height: number };
  expected: { x: number; y: number; width: number; height: number };
  toleranceCssPx: 2 | 4;
};

export type Geometry = ApprovedRegion["actual"];
export type ApprovedSize = Pick<Geometry, "width" | "height">;

export type ApprovedComparisonInput = {
  page: Page;
  testInfo: TestInfo;
  entry: ApprovedMockupEntry;
  candidate: Locator;
  regions: readonly ApprovedRegion[];
};

export type ApprovedComparisonReport = {
  id: string;
  referenceSha256: string;
  candidateSha256: string;
  normalizedSize: { width: number; height: number };
  mismatchPixelRatio: number;
  regions: Array<ApprovedRegion & { deltas: { x: number; y: number; width: number; height: number } }>;
};
```

Export these CT-facing helpers from the same module so every later task uses one typed contract:

```ts
import type { Locator, Page, TestInfo } from "@playwright/test";

export function approvedMockup(id: string): ApprovedMockupEntry {
  const entry = APPROVED_MOCKUPS.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown approved mockup: ${id}`);
  return entry;
}

export async function expectLocatorGeometry(
  locator: Locator,
  expected: Geometry,
  toleranceCssPx: 2 | 4,
): Promise<void> {
  const actual = await locator.boundingBox();
  if (!actual) throw new Error("Approved geometry locator has no bounding box");
  expectGeometryWithinTolerance(actual, expected, toleranceCssPx);
}

export async function isSemanticDocumentOrder(locators: readonly Locator[]): Promise<boolean> {
  const handles = await Promise.all(locators.map((locator) => locator.elementHandle()));
  if (handles.some((handle) => handle === null)) throw new Error("Semantic order locator is missing");
  return handles[0]!.evaluate((first, rest) => {
    const nodes = [first, ...(rest as Node[])];
    return nodes.every((node, index) => index === 0 || Boolean(
      nodes[index - 1]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ));
  }, handles.slice(1));
}
```

Resolve each reference with `resolve(process.cwd(), entry.referencePath)` while Playwright runs from `front/`. `maxChannelDelta: 51` mirrors the repository's Playwright 0.2 threshold on an 8-bit channel. A normalized pixel is mismatched when any alpha-composited sRGB channel exceeds it. Implement comparison with this concrete flow:

```ts
export async function captureApprovedComparison(input: ApprovedComparisonInput): Promise<ApprovedComparisonReport> {
  const { page, testInfo, entry, candidate, regions } = input;
  verifyApprovedReference(entry);
  for (const region of regions) {
    expectGeometryWithinTolerance(region.actual, region.expected, region.toleranceCssPx);
  }
  const reference = readFileSync(resolve(process.cwd(), entry.referencePath));
  const candidatePng = await candidate.screenshot({ animations: "disabled" });
  const rendered = await page.evaluate(compareApprovedPngs, {
    referenceBase64: reference.toString("base64"),
    candidateBase64: candidatePng.toString("base64"),
    size: entry.referenceSize,
    maxChannelDelta: entry.maxChannelDelta,
  });
  const report = buildApprovedComparisonReport(entry, candidatePng, rendered.mismatchPixelRatio, regions);
  writeApprovedArtifacts(testInfo, entry.id, reference, rendered, report);
  if (report.mismatchPixelRatio > entry.maxDiffPixelRatio) {
    throw new Error(`${entry.id} mismatch ratio ${report.mismatchPixelRatio} exceeds ${entry.maxDiffPixelRatio}`);
  }
  return report;
}
```

Use this browser-serializable implementation; white compositing makes transparent pixels comparable and limits the threshold to visible RGB channels:

```ts
export async function compareApprovedPngs({ referenceBase64, candidateBase64, size, maxChannelDelta }: {
  referenceBase64: string;
  candidateBase64: string;
  size: ApprovedSize;
  maxChannelDelta: number;
}) {
  const load = (base64: string) => new Promise<HTMLImageElement>((resolveImage, rejectImage) => {
    const image = new Image();
    image.onload = () => resolveImage(image);
    image.onerror = () => rejectImage(new Error("Approved PNG decode failed"));
    image.src = `data:image/png;base64,${base64}`;
  });
  const [referenceImage, candidateImage] = await Promise.all([load(referenceBase64), load(candidateBase64)]);
  if (!referenceImage.width || !referenceImage.height || !candidateImage.width || !candidateImage.height) {
    throw new Error("Approved PNG has zero dimensions");
  }
  const referenceRatio = referenceImage.width / referenceImage.height;
  const candidateRatio = candidateImage.width / candidateImage.height;
  if (Math.abs(referenceRatio - candidateRatio) > 0.005) {
    throw new Error(`Approved aspect ratio mismatch: ${referenceRatio} vs ${candidateRatio}`);
  }
  const canvas = () => {
    const value = document.createElement("canvas");
    value.width = size.width;
    value.height = size.height;
    return value;
  };
  const render = (image: HTMLImageElement) => {
    const value = canvas();
    const context = value.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Approved Canvas 2D is unavailable");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    return { value, data: context.getImageData(0, 0, size.width, size.height) };
  };
  const reference = render(referenceImage);
  const candidate = render(candidateImage);
  const diff = canvas();
  const diffContext = diff.getContext("2d");
  if (!diffContext) throw new Error("Approved diff Canvas 2D is unavailable");
  const diffData = diffContext.createImageData(size.width, size.height);
  let mismatchPixels = 0;
  for (let index = 0; index < reference.data.data.length; index += 4) {
    const mismatch = [0, 1, 2].some((channel) =>
      Math.abs(reference.data.data[index + channel]! - candidate.data.data[index + channel]!) > maxChannelDelta);
    if (mismatch) mismatchPixels += 1;
    diffData.data.set(mismatch ? [200, 45, 45, 255] : [0, 0, 0, 0], index);
  }
  diffContext.putImageData(diffData, 0, 0);
  const overlay = canvas();
  const overlayContext = overlay.getContext("2d");
  if (!overlayContext) throw new Error("Approved overlay Canvas 2D is unavailable");
  overlayContext.globalAlpha = 1;
  overlayContext.drawImage(reference.value, 0, 0);
  overlayContext.globalAlpha = 0.5;
  overlayContext.drawImage(candidate.value, 0, 0);
  return {
    candidate: candidate.value.toDataURL("image/png"),
    overlay: overlay.toDataURL("image/png"),
    diff: diff.toDataURL("image/png"),
    mismatchPixelRatio: mismatchPixels / (size.width * size.height),
  };
}
```

Finish the Node side with direct field projection and fail-closed PNG decoding:

```ts
function buildApprovedComparisonReport(
  entry: ApprovedMockupEntry,
  candidatePng: Buffer,
  mismatchPixelRatio: number,
  regions: readonly ApprovedRegion[],
): ApprovedComparisonReport {
  return {
    id: entry.id,
    referenceSha256: entry.sha256,
    candidateSha256: createHash("sha256").update(candidatePng).digest("hex"),
    normalizedSize: entry.referenceSize,
    mismatchPixelRatio,
    regions: regions.map((region) => ({
      ...region,
      deltas: Object.fromEntries((["x", "y", "width", "height"] as const).map((key) =>
        [key, Math.abs(region.actual[key] - region.expected[key])],
      )) as ApprovedComparisonReport["regions"][number]["deltas"],
    })),
  };
}

function decodePngDataUrl(value: string): Buffer {
  const prefix = "data:image/png;base64,";
  if (!value.startsWith(prefix)) throw new Error("Approved artifact is not a PNG data URL");
  const decoded = Buffer.from(value.slice(prefix.length), "base64");
  if (decoded.length === 0) throw new Error("Approved artifact decoded to zero bytes");
  return decoded;
}

function writeApprovedArtifacts(
  testInfo: TestInfo,
  id: string,
  reference: Buffer,
  rendered: { candidate: string; overlay: string; diff: string },
  report: ApprovedComparisonReport,
): void {
  const output = (suffix: string) => testInfo.outputPath("approved-mockup", `${id}-${suffix}`);
  mkdirSync(dirname(output("report.json")), { recursive: true });
  writeFileSync(output("reference.png"), reference);
  writeFileSync(output("candidate.png"), decodePngDataUrl(rendered.candidate));
  writeFileSync(output("overlay.png"), decodePngDataUrl(rendered.overlay));
  writeFileSync(output("diff.png"), decodePngDataUrl(rendered.diff));
  writeFileSync(output("report.json"), `${JSON.stringify(report, null, 2)}\n`);
}
```

- [ ] **Step 5: Add the focused script and run GREEN**

Add:

```json
"test:ct:approved": "playwright test --config=playwright-ct.config.ts features/platform-admin/route/admin-shell-layout.ct.tsx features/platform-admin/ui/admin-editorial-ledger.ct.tsx features/host/ui/shell/host-shell.ct.tsx features/host/ui/operating-room/host-operating-room-responsive.ct.tsx features/host/ui/approved-host-ledgers.ct.tsx --project=chromium"
```

Run: `corepack pnpm --dir front exec vitest run tests/unit/approved-mockup-contract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add front/package.json front/tests/e2e/support/approved-mockup-manifest.ts front/tests/e2e/support/approved-mockup-contract.ts front/tests/unit/approved-mockup-contract.test.ts
git commit -m "test(front): add approved mockup fidelity contract"
```

### Task 2: Shared Typography and Role-Scoped Shell Geometry

**Files:**
- Modify: `front/features/platform-admin/route/admin-shell-layout.ct.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-shell.css`
- Modify: `front/shared/ui/app-club-shell.story.tsx`
- Modify: `front/shared/ui/app-club-shell.ct.tsx`
- Modify: `front/features/host/ui/shell/host-shell.css`
- Modify: `front/features/host/ui/shell/host-shell.ct.tsx`

**Interfaces:**
- Consumes: Task 1 `captureApprovedComparison` and `expectLocatorGeometry`.
- Produces: `AppClubShellHostStory`, Admin 1672/390 shell fixtures, Host 1536/390 shell fixtures.
- Preserves: member `AppClubShellStory` 767/768 behavior and all existing account/space-switcher actions.

- [ ] **Step 1: Add RED geometry assertions for both shells**

Admin desktop assertions:

```ts
await page.setViewportSize({ width: 1672, height: 941 });
await expectLocatorGeometry(component.locator(".admin-shell__header"), { x: 0, y: 0, width: 1672, height: 86 }, 4);
await expectLocatorGeometry(component.locator(".admin-shell__nav"), { x: 0, y: 86, width: 260, height: 855 }, 4);
```

Admin mobile assertions:

```ts
await page.setViewportSize({ width: 390, height: 844 });
await expectLocatorGeometry(component.locator(".admin-shell__header"), { x: 0, y: 0, width: 390, height: 70 }, 4);
await expect(component.getByRole("navigation", { name: "Admin 모바일 메뉴" })).toBeVisible();
```

Host assertions use the actual `AppClubShell`, not isolated navigation primitives:

```ts
await page.setViewportSize({ width: 1536, height: 1024 });
await expectLocatorGeometry(shell.locator(".topnav"), { x: 0, y: 0, width: 1536, height: 90 }, 4);
await page.setViewportSize({ width: 390, height: 832 });
await expect(shell.locator('[data-club-shell-region="mobile-primary"]')).toBeVisible();
await expect(shell.locator('[data-club-shell-region="mobile-primary"]')).toHaveCSS("position", "fixed");
```

- [ ] **Step 2: Run focused CT and confirm RED**

Run: `corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/route/admin-shell-layout.ct.tsx shared/ui/app-club-shell.ct.tsx features/host/ui/shell/host-shell.ct.tsx --project=chromium`

Expected: FAIL on Admin 220px rail/62px-era shell geometry and Host fixture/shell geometry.

- [ ] **Step 3: Implement role-scoped shell styles**

Admin CSS begins with these exact load-bearing values:

```css
.admin-shell__header { min-height: 86px; padding: 0 34px; }
.admin-shell__body { grid-template-columns: 260px minmax(0, 1fr); width: 100%; gap: 0; padding: 0; }
.admin-shell__nav { top: 86px; min-height: calc(100vh - 86px); padding: 32px 16px; }
.admin-shell__main { width: 100%; max-width: none; }
```

Host styles remain scoped so member chrome does not change:

```css
.rm-app-club-shell[data-workspace="host"] .topnav-inner { width: min(100% - 64px, 1472px); height: 90px; }
.rm-app-club-shell[data-workspace="host"] .app-content { background: var(--paper-50); }
@media (max-width: 767px) {
  .rm-app-club-shell[data-workspace="host"] [data-club-shell-region="mobile-primary"] {
    position: fixed; inset: auto 0 0; z-index: 40;
  }
}
```

Use `var(--f-sans)`/Pretendard and existing paper/ink tokens only. Do not change shared member selectors without the `[data-workspace="host"]` qualifier.

Add a real Host shell story beside the member story; reuse `StoryLink`, but give the story Host-owned navigation, identity, and workspace values:

```tsx
const hostPrimaryItems: PrimaryNavigationItem[] = [
  { id: "operating-room", label: "운영실", href: "/clubs/reading-sai/host", icon: "host", current: true },
  { id: "meetings", label: "일정과 모임", mobileLabel: "모임", href: "/clubs/reading-sai/host/meetings", icon: "session", current: false },
  { id: "people", label: "사람", href: "/clubs/reading-sai/host/people", icon: "me", current: false },
  { id: "records", label: "기록", href: "/clubs/reading-sai/host/records", icon: "archive", current: false },
];

function StoryHostSpaceSwitcher() {
  return (
    <GlobalSpaceSwitcher
      currentIdentity={{
        productSpace: "clubs",
        clubId: "club-reading-sai",
        clubSlug: "reading-sai",
        perspective: "host",
      }}
      options={[
        { identity: { productSpace: "platform" } },
        {
          identity: {
            productSpace: "clubs",
            clubId: "club-reading-sai",
            clubSlug: "reading-sai",
            perspective: "host",
          },
          clubName: "읽는사이",
        },
      ]}
      onSelect={async () => ({ status: "selected" })}
    />
  );
}

export function AppClubShellHostStory({ children }: { children: ReactNode }) {
  return (
    <AppClubShell
      workspace="host"
      primaryItems={hostPrimaryItems}
      account={{ control: <button type="button" aria-label="계정 메뉴">계정</button> }}
      brandHref="/clubs/reading-sai/host"
      mobileTitle="읽는사이 운영"
      LinkComponent={StoryLink}
      spaceSwitcher={{ desktop: <StoryHostSpaceSwitcher />, mobile: <StoryHostSpaceSwitcher /> }}
    >
      {children}
    </AppClubShell>
  );
}
```

- [ ] **Step 4: Run focused shell unit and CT tests**

Run:

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-shell-layout.test.tsx shared/ui/app-club-shell.test.tsx features/host/ui/shell/host-primary-navigation.test.tsx features/host/ui/shell/host-utility-actions.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/route/admin-shell-layout.ct.tsx shared/ui/app-club-shell.ct.tsx features/host/ui/shell/host-shell.ct.tsx --project=chromium
```

Expected: PASS at 390, 767, 768, 1536, and 1672 with no horizontal overflow and member shell unchanged.

- [ ] **Step 5: Commit Task 2**

```bash
git add front/features/platform-admin/route/admin-shell-layout.ct.tsx front/features/platform-admin/route/admin-shell-layout.test.tsx front/features/platform-admin/ui/admin-shell.css front/shared/ui/app-club-shell.story.tsx front/shared/ui/app-club-shell.ct.tsx front/features/host/ui/shell/host-shell.css front/features/host/ui/shell/host-shell.ct.tsx
git commit -m "style(front): align admin and host approved shells"
```

### Task 3: Admin Today Queue-First Structure and Secondary Disclosure

**Files:**
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-controls.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-controls.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`

**Interfaces:**
- Changes `AdminOperationsQueue` prop from `controls?: ReactNode` to `secondaryControls?: ReactNode`.
- `AdminTodayControlsProps` adds `defaultOpen?: boolean`; `AdminTodayControls` remains controlled by the existing callbacks.
- Produces: `AdminTodayFilterFields({ filters, onFilterChange, refreshing }): ReactElement` as a file-local extraction.
- Existing query/filter/source retry/pending-new callbacks remain byte-for-byte authoritative.

- [ ] **Step 1: Write RED tests for exact copy, DOM order, and collapsed controls**

```tsx
expect(screen.getByRole("heading", { level: 1, name: "오늘 할 일" })).toBeVisible();
const queue = screen.getByRole("region", { name: "운영 케이스 큐" });
const firstTask = within(queue).getAllByRole("button")[0];
const secondary = within(queue).getByText("필터와 신호 상태").closest("details")!;
expect(firstTask.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(secondary).not.toHaveAttribute("open");
expect(within(secondary).getByRole("combobox", { name: "상태 필터", hidden: true })).not.toBeVisible();
```

Add a second test that opens `필터와 신호 상태`, changes `상태 필터`, retries a failed source, and proves the existing callbacks still receive the original values.

- [ ] **Step 2: Run focused Vitest and confirm RED**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/ui/admin-today-controls.test.tsx features/platform-admin/route/admin-today-route.test.tsx`

Expected: FAIL on `오늘의 운영 케이스`, top-of-queue controls, and missing disclosure.

- [ ] **Step 3: Implement minimal queue-first structure**

Use native disclosure semantics:

```tsx
export function AdminTodayControls({ defaultOpen = false, ...props }: AdminTodayControlsProps) {
  return (
    <details className="admin-today-controls" defaultOpen={defaultOpen}>
      <summary>필터와 신호 상태</summary>
      <div className="admin-today-controls__body">
        <AdminWorkViewBar
          views={props.workViews}
          activeView={props.activeView}
          onViewChange={props.onViewChange}
          search={{
            label: ADMIN_COPY.search.loadedCases,
            value: props.query,
            placeholder: "제목 또는 신호",
            onChange: props.onQueryChange,
          }}
          filters={<AdminTodayFilterFields filters={props.filters} onFilterChange={props.onFilterChange} refreshing={props.refreshing} />}
          pending={(props.pendingCount ?? 0) > 0 && props.onApplyPending ? {
            count: props.pendingCount ?? 0,
            urgentCount: props.urgentCount ?? 0,
            onApply: props.onApplyPending,
          } : undefined}
        />
        {props.urgentAnnouncement ? <p aria-live="polite">{props.urgentAnnouncement}</p> : null}
      </div>
    </details>
  );
}
```

Extract only the current filter JSX into `AdminTodayFilterFields`; its labels, option values, callbacks, pending behavior, and live-status copy remain unchanged.

`AdminOperationsQueue` must render header → list/empty → `secondaryControls`. `AdminTodayLedger` sets `ADMIN_TODAY_HEADING = "오늘 할 일"` and passes `defaultOpen={view.items.length === 0 && filtered}` so an empty filtered result remains recoverable.

- [ ] **Step 4: Run focused tests and frontend boundary test**

Run:

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/ui/admin-today-controls.test.tsx features/platform-admin/route/admin-today-route.test.tsx
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: PASS; UI modules remain prop/callback-only.

- [ ] **Step 5: Commit Task 3**

```bash
git add front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-today-ledger.test.tsx front/features/platform-admin/ui/admin-today-controls.tsx front/features/platform-admin/ui/admin-today-controls.test.tsx front/features/platform-admin/ui/admin-operations-queue.tsx front/features/platform-admin/ui/admin-operation-mobile-detail.tsx front/features/platform-admin/route/admin-today-route.test.tsx
git commit -m "feat(admin): restore queue-first today workflow"
```

### Task 4: Admin Today Desktop and Mobile Pixel Convergence

**Files:**
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/features/platform-admin/ui/admin-page-patterns.css`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx`

**Interfaces:**
- Consumes manifest entries `admin-today-desktop`, `admin-today-mobile`, `admin-work-detail-mobile`.
- Produces deterministic Today list/detail candidates with exact safe fictional copy from the approved assets.
- Preserves current `mode=list|detail`, Back/Forward, selection, scroll/focus restore, safe action callbacks.

- [ ] **Step 1: Add RED CT assertions and approved comparison calls**

Desktop structure:

```ts
await page.setViewportSize({ width: 1672, height: 941 });
const queue = component.getByRole("region", { name: "운영 케이스 큐" });
const docket = component.getByRole("region", { name: "운영 케이스 상세" });
await expectLocatorGeometry(queue, { x: 260, y: 86, width: 559, height: 855 }, 4);
await expectLocatorGeometry(docket, { x: 819, y: 86, width: 853, height: 855 }, 4);
await expect(component.getByText("알림 전달 지연").first()).toBeInViewport();
expect(await isSemanticDocumentOrder([
  docket.getByRole("heading", { name: "무슨 일인가" }),
  docket.getByRole("heading", { name: "왜 중요한가" }),
  docket.getByRole("heading", { name: "확인한 근거" }),
  docket.getByRole("heading", { name: "다음 행동" }),
  docket.getByRole("heading", { name: "최근 처리 기록" }),
])).toBe(true);
await captureApprovedComparison({ entry: approvedMockup("admin-today-desktop"), candidate: component, page, testInfo, regions });
```

Mobile structure:

```ts
await page.setViewportSize({ width: 390, height: 844 });
await expect(component.getByText("알림 전달 지연").first()).toBeInViewport();
await expect(component.getByRole("navigation", { name: "Admin 모바일 메뉴" })).toBeVisible();
await expect(component.getByText("필터와 신호 상태").closest("details")).not.toHaveAttribute("open");
```

- [ ] **Step 2: Run Today CT and confirm RED artifacts are generated**

Run: `corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/ui/admin-editorial-ledger.ct.tsx --project=chromium --grep "Today|case detail"`

Expected: FAIL with geometry/diff reports while still writing candidate, overlay, diff, and JSON under the Playwright output directory.

- [ ] **Step 3: Implement Today CSS against the approved composition**

Use these load-bearing rules:

```css
.admin-today-ledger__columns { grid-template-columns: minmax(340px, 38fr) minmax(560px, 62fr); gap: 0; }
.admin-operations-queue { border-right: 1px solid var(--line); }
.admin-operations-queue__row { min-height: 122px; padding: 24px 32px; border-bottom: 1px solid var(--line); }
.admin-operations-queue__controls { order: 3; }
.admin-today-controls > summary { min-height: 44px; }
@media (max-width: 959px) {
  .admin-operations-queue__row { min-height: 94px; padding: 22px 0; }
  .admin-today-controls:not([open]) .admin-today-controls__body { display: none; }
}
```

Match line-height, border, icon size, selected row ochre rule, docket section rhythm, mobile bottom navigation spacing, and exact approved wrapping. Keep technical IDs behind the existing technical disclosure.

- [ ] **Step 4: Iterate the focused comparison until GREEN without updating approved assets**

Run: `corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/ui/admin-editorial-ledger.ct.tsx --project=chromium --grep "Today|case detail"`

Expected: PASS for all three approved entries, major region delta ≤4 CSS px, repeated alignment delta ≤2 CSS px, mismatch ratio ≤0.02.

- [ ] **Step 5: Commit Task 4**

```bash
git add front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx front/features/platform-admin/ui/admin-editorial-ledger.css front/features/platform-admin/ui/admin-page-patterns.css front/features/platform-admin/ui/admin-operation-mobile-detail.tsx
git commit -m "style(admin): match approved today compositions"
```

### Task 5: Admin Clubs, Service, Records, and Space-Switcher Convergence

**Files:**
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.ct.tsx`
- Modify: `front/features/platform-admin/ui/admin-club-management.css`
- Modify: `front/features/platform-admin/ui/admin-service-status.css`
- Modify: `front/features/platform-admin/ui/admin-processing-records.css`
- Modify: `front/features/platform-admin/ui/admin-page-patterns.css`
- Test: `front/features/platform-admin/ui/admin-clubs-ledger.test.tsx`
- Test: `front/features/platform-admin/ui/admin-health-grid.test.tsx`
- Test: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`

**Interfaces:**
- Consumes Admin manifest entries `02–05`.
- Produces exact deterministic state for club management, service status, processing records, and open space switcher.
- Preserves URL filters, pagination, retry, sensitive audit search authority, and exact capability gates.

- [ ] **Step 1: Replace non-authoritative CT widths with the four approved desktop frames**

Each CT must set `{ width: 1672, height: 941 }`, mount the production shell, assert the route heading and first actionable row, then call `captureApprovedComparison` with its exact manifest entry. For the switcher entry, click `공간 전환, 현재 플랫폼 운영` before capture and assert platform/member choices remain keyboard operable.

- [ ] **Step 2: Run CT and confirm RED**

Run:

```bash
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/ui/admin-editorial-ledger.ct.tsx features/platform-admin/route/admin-shell-layout.ct.tsx --project=chromium --grep "Clubs|Service|Review|space menu"
```

Expected: FAIL on reference diff while all existing role/capability assertions still pass.

- [ ] **Step 3: Tune each route-owned stylesheet without cross-route overrides**

Use continuous ledgers and hairlines rather than cards:

```css
.admin-club-management__row,
.admin-processing-records__row { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; }
.admin-service-status__normal { color: var(--text-3); background: transparent; }
.admin-service-status__attention { border-inline-start: 3px solid var(--attention); }
```

Do not reintroduce KPI card walls, raw enum/ID, or platform-specific club content. CSS added for one route must be rooted under its route class.

- [ ] **Step 4: Run focused unit and approved CT gates**

Run:

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-clubs-ledger.test.tsx features/platform-admin/ui/admin-health-grid.test.tsx features/platform-admin/ui/admin-audit-ledger.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/route/admin-shell-layout.ct.tsx features/platform-admin/ui/admin-editorial-ledger.ct.tsx --project=chromium --grep "Admin|Clubs|Service|Review|space"
```

Expected: PASS for Admin `01–07`; no baseline update command is used.

- [ ] **Step 5: Commit Task 5**

```bash
git add front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx front/features/platform-admin/route/admin-shell-layout.ct.tsx front/features/platform-admin/ui/admin-club-management.css front/features/platform-admin/ui/admin-service-status.css front/features/platform-admin/ui/admin-processing-records.css front/features/platform-admin/ui/admin-page-patterns.css
git commit -m "style(admin): match approved operations ledgers"
```

### Task 6: Host Workbox Progressive Disclosure

**Files:**
- Modify: `front/features/host/ui/workbox/host-work-item.tsx`
- Modify: `front/features/host/ui/workbox/host-workbox.test.tsx`
- Modify: `front/features/host/ui/workbox/host-workbox.ct.tsx`
- Modify: `front/features/host/ui/workbox/host-workbox.css`

**Interfaces:**
- Preserves `onDefer(key, option)`, `onUndoDeferral(key)`, server destination, pending/error, and receipt contracts.
- Produces native `details.rm-host-work-item__secondary` with summary accessible name `${item.title} 세부 조작`.
- Default visible row contains operational label, title destination, count/deadline summary, and chevron only.

- [ ] **Step 1: Write RED disclosure and callback tests**

```tsx
renderWorkbox();
expect(screen.getByRole("link", { name: "일정 확인이 필요한 멤버" })).toBeVisible();
expect(screen.getByText("수량").closest("div")).toHaveTextContent("수량0");
expect(screen.getByRole("combobox", { name: /보류 기간/, hidden: true })).not.toBeVisible();
expect(screen.getByRole("button", { name: /보류$/, hidden: true })).not.toBeVisible();

await userEvent.click(screen.getByText("세부 조작"));
await userEvent.selectOptions(screen.getByRole("combobox", { name: /보류 기간/ }), "THREE_DAYS");
await userEvent.click(screen.getByRole("button", { name: /보류$/ }));
expect(props.onDefer).toHaveBeenCalledWith("SCHEDULE_UNSEEN:opaque/server:key:r7", "THREE_DAYS");
```

- [ ] **Step 2: Run focused Vitest and confirm RED**

Run: `corepack pnpm --dir front exec vitest run features/host/ui/workbox/host-workbox.test.tsx`

Expected: FAIL because select/button are currently always visible and disclosure is missing.

- [ ] **Step 3: Implement the compact semantic row**

```tsx
<LinkComponent to={item.destinationHref} className="rm-host-work-item__destination">
  <span>{item.operationalLabel}</span>
  <strong>{item.title}</strong>
  <span>{item.countLabel}{dueLabel(item)}</span>
</LinkComponent>
<details className="rm-host-work-item__secondary">
  <summary aria-label={`${item.title} 세부 조작`}>세부 조작</summary>
  <div className="rm-host-work-item__secondary-body">
    <p>{item.description}</p>
    {facts}
    {deferralControls}
    {receipt}
  </div>
</details>
```

The title destination remains the primary navigation action; summary only expands controls. Pending/error stays inside the same row and never removes the authoritative key.

- [ ] **Step 4: Run unit and CT tests**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/workbox/host-workbox.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/workbox/host-workbox.ct.tsx --project=chromium
```

Expected: PASS at 390, 1199, 1440; default visible choices match the compact workbox and expanded controls remain 44px.

- [ ] **Step 5: Commit Task 6**

```bash
git add front/features/host/ui/workbox/host-work-item.tsx front/features/host/ui/workbox/host-workbox.test.tsx front/features/host/ui/workbox/host-workbox.ct.tsx front/features/host/ui/workbox/host-workbox.css
git commit -m "feat(host): collapse secondary workbox actions"
```

### Task 7: Host Operating Room Prep, Live, Closing, and Mobile Convergence

**Files:**
- Modify: `front/features/host/ui/operating-room/host-operating-room-page.tsx`
- Modify: `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`
- Modify: `front/features/host/ui/operating-room/operating-room.ct.tsx`
- Modify: `front/features/host/ui/operating-room/operating-room.css`
- Modify: `front/features/host/ui/workbox/host-workbox.ct.tsx`
- Modify: `front/features/host/ui/shell/host-shell.css`

**Interfaces:**
- Consumes Host manifest entries `07–09`, `15–16`.
- Preserves `HostOperatingRoomPageProps`, phase normalization, recovery, partial failure, next-action deferral, and route-owned links.
- Produces reference states `prep`, `live`, `closing` and mobile `prep`, `live` from deterministic props.

- [ ] **Step 1: Add RED semantic/geometry/reference assertions**

```ts
const order = [context, phases, nextAction, preparation, workbox];
expect(await isSemanticDocumentOrder(order)).toBe(true);
await page.setViewportSize({ width: 1536, height: 1024 });
await expectLocatorGeometry(component.locator(".rm-host-operating-room__body"), { x: 36, y: 319, width: 1465, height: 665 }, 4);
await expectLocatorGeometry(component.locator(".rm-host-operating-room__workbox-rail"), { x: 988, y: 319, width: 513, height: 665 }, 4);
await captureApprovedComparison({ entry: approvedMockup("host-prep-desktop"), candidate: component, page, testInfo, regions });
```

Mobile prep must show next action, all four preparation rows, three compact workbox rows, and bottom navigation inside the 390×832 reference frame. Mobile live must show actual attendance separately from RSVP and preserve immediate save/undo semantics.

- [ ] **Step 2: Run focused CT and confirm RED**

Run: `corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/operating-room/host-operating-room-responsive.ct.tsx features/host/ui/operating-room/operating-room.ct.tsx --project=chromium`

Expected: FAIL on reference diff and workbox density, while semantic order and 68:32 checks still execute.

- [ ] **Step 3: Implement the approved operating-room visual hierarchy**

```css
.rm-host-operating-room { width: min(100% - 72px, 1465px); margin-inline: auto; }
.rm-host-operating-room__body { grid-template-columns: minmax(0, 68fr) minmax(360px, 32fr); gap: 0; }
.rm-host-operating-room__workbox-rail { border-inline-start: 1px solid var(--line); padding-inline-start: 36px; }
.rm-preparation-ledger__row { min-height: 62px; border-bottom: 1px solid var(--line); }
@media (max-width: 1199px) { .rm-host-operating-room__body { grid-template-columns: 1fr; } }
@media (max-width: 767px) {
  .rm-host-operating-room { width: min(100% - 36px, 390px); }
  .rm-host-operating-room__workbox-rail { border-inline-start: 0; padding-inline-start: 0; }
}
```

Keep the exact phase DOM order. CSS grid may place the workbox to the right only at 1200px+.

- [ ] **Step 4: Iterate all five reference comparisons to GREEN**

Run: `corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/operating-room/host-operating-room-responsive.ct.tsx --project=chromium`

Expected: PASS for Host `07–09`, `15–16`, including overlay/diff and geometry reports.

- [ ] **Step 5: Run focused unit safety tests**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/operating-room/current-meeting-header.test.tsx features/host/ui/operating-room/host-next-action.test.tsx features/host/ui/operating-room/meeting-phase-tabs.test.tsx features/host/ui/operating-room/preparation-ledger.test.tsx
```

Expected: PASS; source-derived facts and primary-action callbacks are unchanged.

- [ ] **Step 6: Commit Task 7**

```bash
git add front/features/host/ui/operating-room/host-operating-room-page.tsx front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx front/features/host/ui/operating-room/operating-room.ct.tsx front/features/host/ui/operating-room/operating-room.css front/features/host/ui/workbox/host-workbox.ct.tsx front/features/host/ui/shell/host-shell.css
git commit -m "style(host): match approved operating room views"
```

### Task 8: Host Meetings, People, Records, Settings, Review, and Person Detail

**Files:**
- Create: `front/features/host/ui/approved-host-ledgers.fixtures.tsx`
- Create: `front/features/host/ui/approved-host-ledgers.ct.tsx`
- Modify: `front/features/host/ui/host-editorial-ledger.css`
- Modify: `front/features/host/ui/meeting-list/meeting-toc.css`
- Modify: `front/features/host/ui/members/member-ledger.css`
- Modify: `front/features/host/ui/person/host-person-detail.css`
- Modify: `front/features/host/ui/settings/host-club-settings.tsx`
- Modify: `front/features/host/ui/settings/host-invitation-links.tsx`
- Modify: `front/features/host/ui/schedule-review/host-schedule-review-header.tsx`
- Test: existing co-located tests for each touched component

**Interfaces:**
- Consumes Host manifest entries `10–14`, `17`.
- Fixture module exports `hostMeetingsApprovedView`, `hostPeopleApprovedView`, `hostRecordsApprovedView`, `hostSettingsApprovedView`, `hostScheduleReviewApprovedView`, `hostPersonApprovedView` as presentation props only.
- Route/query/API code is not imported by the fixture module.

- [ ] **Step 1: Create deterministic presentation fixtures and RED CT cases**

Each fixture uses safe names from the approved assets and existing view types. Each CT mounts the real UI component under `AppClubShellHostStory`, asserts its load-bearing heading/first row/action, and calls `captureApprovedComparison` with the matching entry.

```tsx
test("people ledger matches approved desktop", async ({ mount, page }, testInfo) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const component = await mount(hostPeopleApprovedView());
  await expect(component.getByRole("heading", { name: "사람" })).toBeVisible();
  await expect(component.getByText("현재 일정 확인")).toBeVisible();
  await captureApprovedComparison({ entry: approvedMockup("host-people-desktop"), candidate: component, page, testInfo, regions: [] });
});
```

Add these five additional named cases; do not hide them in a generalized loop:

| test name | manifest id | viewport | required visible assertions |
| --- | --- | --- | --- |
| `meetings library matches approved desktop` | `host-meetings-desktop` | 1536×1024 | heading `일정과 모임`, first meeting title, primary meeting action |
| `records ledger matches approved desktop` | `host-records-desktop` | 1536×1024 | heading `기록`, first completed-session row, record destination |
| `invites and settings match approved desktop` | `host-settings-desktop` | 1536×1024 | heading `초대와 설정`, invitation-link section, club-setting section |
| `unread schedule review matches approved desktop` | `host-schedule-review-desktop` | 1536×1024 | review heading, unread-member count, confirm action |
| `person detail matches approved mobile` | `host-person-mobile` | 390×832 | member heading, login fact, RSVP fact, actual-attendance fact |

- [ ] **Step 2: Run the six CT cases and confirm RED**

Run: `corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/approved-host-ledgers.ct.tsx --project=chromium`

Expected: FAIL on reference comparison before route-owned CSS is tuned.

- [ ] **Step 3: Implement route-owned continuous-ledger styles**

```css
.rm-host-editorial-ledger__row { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
.rm-meeting-toc__row,
.rm-host-member-ledger__row { min-height: 62px; }
.rm-host-person__facts > div { border-bottom: 1px solid var(--line); }
```

Settings keeps invitation-link and club-setting functions in separate semantic sections but uses the approved quiet utility composition. Schedule review keeps preview/confirm authority and manual-send copy. Person detail keeps login, schedule seen, RSVP, actual attendance, and attendance history as separate facts.

- [ ] **Step 4: Run component unit tests and approved CT**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/meeting-list/host-meeting-list.test.tsx features/host/ui/members/member-list.test.tsx features/host/ui/host-session-ledger.test.tsx features/host/ui/settings/host-settings-components.test.tsx features/host/route/host-schedule-review-route.test.tsx features/host/route/host-person-detail-route.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/approved-host-ledgers.ct.tsx --project=chromium
```

Expected: PASS for Host `10–14`, `17` without API/query changes.

- [ ] **Step 5: Commit Task 8**

```bash
git add front/features/host/ui/approved-host-ledgers.fixtures.tsx front/features/host/ui/approved-host-ledgers.ct.tsx front/features/host/ui/host-editorial-ledger.css front/features/host/ui/meeting-list/meeting-toc.css front/features/host/ui/members/member-ledger.css front/features/host/ui/person/host-person-detail.css front/features/host/ui/settings/host-club-settings.tsx front/features/host/ui/settings/host-invitation-links.tsx front/features/host/ui/schedule-review/host-schedule-review-header.tsx
git commit -m "style(host): match approved ledger and utility views"
```

### Task 9: Intermediate Width, State, and Real-Route Regression Matrix

**Files:**
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`
- Modify: `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`
- Modify: `front/features/host/ui/shell/host-shell.ct.tsx`
- Modify: `front/tests/e2e/admin-operations-command-center.spec.ts`
- Modify: `front/tests/e2e/admin-clubs-triage.spec.ts`
- Modify: `front/tests/e2e/host-lifecycle-route-continuity.spec.ts`
- Modify: `front/tests/e2e/host-workbox-stage4.spec.ts`
- Modify: `front/tests/e2e/host-authority-loss.spec.ts`

**Interfaces:**
- Consumes all completed presentation contracts.
- Produces intermediate-width evidence at 320, 768, 900/1024, 1200, 1440 and real-route evidence for URL state/recovery.
- Preserves server request counts, opaque keys/cursors, and transition ownership.

- [ ] **Step 1: Add RED cross-width assertions**

For every intermediate width assert no horizontal overflow, 44px targets, semantic order, focus, and one mobile primary action. Add this explicit first-viewport assertion:

```ts
const firstTask = component.getByRole("button", { name: /알림 전달 지연/ });
const box = await firstTask.boundingBox();
expect(box).not.toBeNull();
expect(box!.y + Math.min(box!.height, 44)).toBeLessThanOrEqual(viewport.height);
```

Add named CT/E2E cases for the accepted runtime-state matrix; each case asserts the heading, recovery action, semantic order, wrapping, and no horizontal overflow instead of taking a new pixel oracle:

| surface | state cases that must be explicit |
| --- | --- |
| Admin Today | loading with stable shell; empty with filter disclosure recoverable; denied capability with no safe action; stale/409 with refresh path; partial source failure with retry; long Korean/English title wrapping |
| Host operating room/workbox | loading with stable current-meeting context; empty workbox; authority denied with cached data purged; stale cursor recovery; partial source warning with unaffected rows usable; long Korean/English member/meeting wrapping |

The denied, stale, and partial cases reuse existing safe server fixtures and assertions; they do not invent new response contracts.

- [ ] **Step 2: Extend real-route tests without changing backend fixtures**

Admin E2E must prove list → detail → safe action → result, Back/Forward, filter disclosure, and first task visibility. Host E2E must prove workbox detail expansion, defer with the same opaque key, authority-loss purge, prep/live/closing continuity, and mobile single primary action.

- [ ] **Step 3: Run focused CT/E2E and fix only presentation regressions**

Run:

```bash
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/ui/admin-editorial-ledger.ct.tsx features/host/ui/operating-room/host-operating-room-responsive.ct.tsx features/host/ui/shell/host-shell.ct.tsx --project=chromium
corepack pnpm --dir front exec playwright test tests/e2e/admin-operations-command-center.spec.ts tests/e2e/admin-clubs-triage.spec.ts tests/e2e/host-lifecycle-route-continuity.spec.ts tests/e2e/host-workbox-stage4.spec.ts tests/e2e/host-authority-loss.spec.ts --project=chromium
```

Expected: PASS. If an API/BFF/server change appears necessary, stop instead of expanding scope.

- [ ] **Step 4: Run frontend boundary and accessibility helpers**

Run: `corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts`

In CT, call `expectNoSeriousAccessibilityFindings`, `expectVisibleFocus`, `expectReducedMotion`, and `expectMinimumTargetSize` for the changed candidates.

- [ ] **Step 5: Commit Task 9**

```bash
git add front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx front/features/host/ui/shell/host-shell.ct.tsx front/tests/e2e/admin-operations-command-center.spec.ts front/tests/e2e/admin-clubs-triage.spec.ts front/tests/e2e/host-lifecycle-route-continuity.spec.ts front/tests/e2e/host-workbox-stage4.spec.ts front/tests/e2e/host-authority-loss.spec.ts
git commit -m "test(front): lock admin host responsive workflows"
```

### Task 10: Full Pixel Review and 30-Second Comprehension Gate

**Files:**
- Create: `docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md`
- Modify only if review finds a real gap: files already owned by Tasks 2–9

**Interfaces:**
- Consumes all 18 comparison reports and the exact source hashes.
- Produces an acceptance report with automated evidence, independent visual verdict, five-reviewer comprehension aggregate, intentional differences, skipped manual assistive-tech evidence, and residual risk.

- [ ] **Step 1: Run the immutable full approved comparison gate**

Run: `corepack pnpm --dir front test:ct:approved`

Expected: 18/18 reference cases PASS. Preserve Playwright output for review; do not commit transient output directories.

- [ ] **Step 2: Run stable Docker CT verification**

Run: `corepack pnpm --dir front test:ct`

Expected: PASS without `--update`. If existing tracked snapshot changes are intentional, first review reference/candidate/overlay/diff, then run `corepack pnpm --dir front test:ct:update` once and rerun `corepack pnpm --dir front test:ct`.

- [ ] **Step 3: Perform independent visual review**

The reviewer did not implement the slice. For every entry, they inspect reference, candidate, 50% overlay, diff, and JSON region deltas, then record `PASS` or a concrete mismatch. A changed source hash, missing artifact, region delta above tolerance, or unreviewed exception is `FAIL`.

- [ ] **Step 4: Run the 30-second comprehension test with five first-time reviewers**

Use synthetic data only. Ask each reviewer:

1. Admin: “지금 가장 먼저 처리할 일은 무엇인가?”
2. Host: “현재 단계와 다음 행동은 무엇인가?”
3. Both: “필터 또는 보류 같은 보조 기능은 어디서 펼치는가?”

Each reviewer must answer all three within 30 seconds per surface. Record only anonymous labels `R1`–`R5`, seconds, and pass/fail; do not record names, accounts, or screen recordings.

- [ ] **Step 5: Write the evidence report with actual results**

Use these exact sections:

```markdown
# Admin·Host Pixel Fidelity Acceptance

## Source binding
## Automated visual results (18 entries)
## Geometry and accessibility results
## Independent visual review
## 30-second comprehension results
| reviewer | admin seconds/result | host seconds/result | disclosure seconds/result |
| --- | --- | --- | --- |
## Intentional differences
## Manual assistive technology evidence
## Residual risk and release boundary
```

Do not mark complete if any automated case, independent review, or comprehension row fails.

- [ ] **Step 6: Commit Task 10**

```bash
git add docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md
git commit -m "test(front): record admin host pixel fidelity acceptance"
```

### Task 11: Active Documentation, ADR Acceptance, and Whole-Surface Closeout

**Files:**
- Modify: `front/DESIGN.md`
- Modify: `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`
- Modify: `docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md`
- Modify: `docs/development/host-redesign-mockups/README.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/adr/0053-approved-mockup-pixel-fidelity-gate.md`
- Modify: `docs/development/adr/README.md`
- Modify: `docs/development/technical-decisions.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 10 acceptance report and actual command results.
- Produces: ADR-0053 `Accepted` only when code, tests, active docs, and all required evidence agree.
- Preserves: ADR-0048/0050 product composition and historical context.

- [ ] **Step 1: Update active design language to the implemented contract**

Replace the old “PNG는 참고이며 구현 snapshot이 회귀 기준” interpretation with: approved PNG remains visual authority; code-native UI remains editable/runtime source; tracked snapshot is a secondary regression cache; token/shared CSS/fixture changes invalidate affected reference evidence.

- [ ] **Step 2: Update ADR-0053 and both indexes only after evidence is complete**

Change `상태: Proposed` to `상태: Accepted`, add exact tests and acceptance-report link under `검증`, and update the two index rows to `Accepted`. Do not rewrite ADR-0048/0050 decisions or mark ADR-0053 accepted if Task 10 is incomplete.

- [ ] **Step 3: Add the user-visible change to Unreleased**

```markdown
- Admin·Host 화면을 승인된 desktop/mobile 시안에 다시 맞추고, 보조 필터·작업함 조작을 점진적으로 펼치도록 재구성했습니다. 기능·권한·안전 흐름은 유지하면서 승인 자산 직접 비교와 변경 무효화 gate를 추가했습니다.
```

- [ ] **Step 4: Run docs and registry checks**

Run:

```bash
git diff --check -- CHANGELOG.md front/DESIGN.md docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md docs/development/host-redesign-mockups/README.md docs/development/architecture.md docs/development/adr/0053-approved-mockup-pixel-fidelity-gate.md docs/development/adr/README.md docs/development/technical-decisions.md docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md
python3 -B scripts/check-agent-guidance.py
```

Expected: PASS.

- [ ] **Step 5: Run canonical frontend and public-safety gates**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
corepack pnpm --dir front test:ct
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: every command exits 0. Report any unavailable command as skipped with its exact reason; do not convert a skip to PASS.

- [ ] **Step 6: Request independent code and UX review**

Review the whole implementation range from the plan base commit through HEAD. Require separate findings for functional regression, accessibility, Admin fidelity, Host fidelity, baseline invalidation, public-repo safety, and ADR truthfulness. Fix concrete findings in bounded commits and rerun only the affected focused gate plus the final canonical gates.

- [ ] **Step 7: Commit Task 11**

```bash
git add CHANGELOG.md front/DESIGN.md docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md docs/development/host-redesign-mockups/README.md docs/development/architecture.md docs/development/adr/0053-approved-mockup-pixel-fidelity-gate.md docs/development/adr/README.md docs/development/technical-decisions.md
git commit -m "docs(front): accept admin host visual fidelity gate"
```

---

## Requirement Traceability

| Approved requirement | Implementing tasks | Acceptance evidence |
| --- | --- | --- |
| Immutable Admin `01–07`, Host `07–17` authority | 1 | manifest hash test, 18-entry full gate |
| Common visual foundation before page tuning | 2 | Admin/Host shell CT plus member non-regression |
| Admin exact `오늘 할 일`, queue first, controls secondary | 3–4 | Vitest DOM order, Today desktop/mobile comparisons |
| Admin clubs/service/records/switcher parity | 5 | four approved desktop comparisons |
| Host compact workbox with preserved defer/undo/receipt | 6 | workbox Vitest and CT |
| Host prep/live/closing desktop/mobile parity | 7 | five approved comparisons |
| Host meetings/people/records/settings/review/person parity | 8 | six approved comparisons |
| 320–1440 responsive, keyboard, focus, 44px, recovery | 9 | CT matrix and real-route E2E |
| Loading, empty, denied, stale, partial, error, and long-copy states | 9 | named state CT/E2E matrix |
| Overlay/diff/geometry review and invalidation | 1, 10 | comparison artifacts and independent review |
| 30-second first-task comprehension | 10 | five-reviewer aggregate |
| Active docs and ADR truthfulness | 11 | registry checker and ADR-0053 acceptance evidence |
| Full repository/front regression and public safety | 11 | lint/test/build/E2E/CT/public-release checks |

## Execution Boundary

- No push, PR, tag, deploy, or production smoke is part of this plan.
- Worktree isolation is selected when execution starts via `superpowers:using-git-worktrees` if the current workspace is not reserved for this implementation.
- Shared shell/token tasks run sequentially. Admin and Host page tuning may be reviewed independently only after Task 2, but they must not concurrently edit shared CSS, fixtures, snapshot directories, or Playwright output.
- Completion requires Task 10 human evidence. If five first-time reviewers are unavailable, status is blocked rather than complete.
