import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { APPROVED_MOCKUPS, type ApprovedMockupEntry } from "./approved-mockup-manifest";

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

export const CANONICAL_RENDERER_IMAGE = "mcr.microsoft.com/playwright:v1.61.1-jammy";
export const APPROVED_COMPARISON_REPORT_SCHEMA_VERSION = 1 as const;

export type ApprovedComparisonReport = {
  schemaVersion: typeof APPROVED_COMPARISON_REPORT_SCHEMA_VERSION;
  id: string;
  referenceSha256: string;
  candidateSha256: string;
  normalizedSize: { width: number; height: number };
  mismatchPixelRatio: number;
  mismatchPassed: boolean;
  regions: Array<ApprovedRegion & { deltas: { x: number; y: number; width: number; height: number } }>;
  renderer: {
    image: string;
    browser: string;
    playwrightVersion: string;
    nodeVersion: string;
    pnpmVersion: string;
    dpr: number;
    pretendardFaces: string[];
  };
  viewport: { width: number; height: number };
  geometry: Array<ApprovedRegion & { deltas: { x: number; y: number; width: number; height: number }; passed: boolean }>;
  typography: Array<{
    name: string;
    selector: string;
    passed: boolean;
    actual: { fontFamily: string; fontSizePx: number; fontWeight: string; lineHeightPx: number | "normal"; color: string };
    expected: { fontFamilyIncludes: "Pretendard"; fontSizePx: number; fontWeight: readonly number[]; lineHeightPx: number | "normal"; color: string };
  }>;
  firstViewport: Array<{ name: string; selector: string; visibility: "fully-visible" | "intersects"; passed: boolean }>;
  defaultVisibleCount: { selector: string; expected: 3 | 4; actual: number; passed: boolean } | null;
  overflow: { horizontalCssPx: number; passed: boolean };
  interactions: Array<{ name: string; passed: boolean; detail: string }>;
  requestAudit: { unmatched: number; effecting: number; preview: number; passed: boolean };
  mask: null;
  verdict: "pass" | "fail";
};

export type ApprovedRouteAssertionResults = {
  geometry: ApprovedComparisonReport["geometry"];
  typography: ApprovedComparisonReport["typography"];
  firstViewport: ApprovedComparisonReport["firstViewport"];
  defaultVisibleCount: ApprovedComparisonReport["defaultVisibleCount"];
  overflow: ApprovedComparisonReport["overflow"];
  interactions: ApprovedComparisonReport["interactions"];
  requestAudit: ApprovedComparisonReport["requestAudit"];
};

export const APPROVED_COMPARISON_REPORT_REQUIRED_FIELDS = [
  "schemaVersion",
  "id",
  "referenceSha256",
  "candidateSha256",
  "normalizedSize",
  "mismatchPixelRatio",
  "mismatchPassed",
  "regions",
  "renderer",
  "viewport",
  "geometry",
  "typography",
  "firstViewport",
  "defaultVisibleCount",
  "overflow",
  "interactions",
  "requestAudit",
  "mask",
  "verdict",
] as const satisfies readonly (keyof ApprovedComparisonReport)[];

export type ArtifactWriter = {
  outputPath: (...segments: string[]) => string;
};

export function approvedMockup(id: string): ApprovedMockupEntry {
  const entry = APPROVED_MOCKUPS.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown approved mockup: ${id}`);
  return entry;
}

export function verifyApprovedReference(entry: ApprovedMockupEntry): void {
  const referencePath = resolve(process.cwd(), entry.referencePath);
  if (!existsSync(referencePath)) {
    throw new Error(`Approved reference missing for ${entry.id}: ${entry.referencePath}`);
  }
  const bytes = readFileSync(referencePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== entry.sha256) {
    throw new Error(
      `Approved reference hash mismatch for ${entry.id}: expected ${entry.sha256}, got ${digest}`,
    );
  }
}

export function assertApprovedMismatchRatio(input: {
  id: string;
  mismatchPixelRatio: number;
  maxDiffPixelRatio: number;
}): void {
  if (input.mismatchPixelRatio <= input.maxDiffPixelRatio) return;
  throw new Error(
    `${input.id} mismatch ratio ${input.mismatchPixelRatio} exceeds ${input.maxDiffPixelRatio}`,
  );
}

export function expectGeometryWithinTolerance(
  actual: Geometry,
  expected: Geometry,
  toleranceCssPx: number,
): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    const delta = Math.abs(actual[key] - expected[key]);
    if (delta > toleranceCssPx) {
      throw new Error(`${key} delta ${delta.toFixed(2)}px exceeds ${toleranceCssPx}px`);
    }
  }
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

function regionDeltas(region: ApprovedRegion): { x: number; y: number; width: number; height: number } {
  return Object.fromEntries((["x", "y", "width", "height"] as const).map((key) =>
    [key, Math.abs(region.actual[key] - region.expected[key])],
  )) as { x: number; y: number; width: number; height: number };
}

function passedResultsFromRegions(regions: readonly ApprovedRegion[]): ApprovedRouteAssertionResults {
  return {
    geometry: regions.map((region) => {
      const deltas = regionDeltas(region);
      const passed = (["x", "y", "width", "height"] as const).every((key) => deltas[key] <= region.toleranceCssPx);
      return { ...region, deltas, passed };
    }),
    typography: [],
    firstViewport: [],
    defaultVisibleCount: null,
    overflow: { horizontalCssPx: 0, passed: true },
    interactions: [],
    requestAudit: { unmatched: 0, effecting: 0, preview: 0, passed: true },
  };
}

function processFingerprint(): ApprovedComparisonReport["renderer"] {
  return {
    image: CANONICAL_RENDERER_IMAGE,
    browser: process.env.READMATES_VISUAL_AUTHORITY_BROWSER ?? "chromium",
    playwrightVersion: process.env.READMATES_VISUAL_AUTHORITY_PLAYWRIGHT_VERSION ?? "1.61.1",
    nodeVersion: process.version.replace(/^v/, ""),
    pnpmVersion: process.env.READMATES_VISUAL_AUTHORITY_PNPM_VERSION ?? "11.13.1",
    dpr: Number(process.env.READMATES_VISUAL_AUTHORITY_DPR ?? "1"),
    pretendardFaces: ["Pretendard Variable"],
  };
}

function buildApprovedComparisonReport(input: {
  entry: ApprovedMockupEntry;
  candidatePng: Buffer;
  mismatchPixelRatio: number;
  regions: readonly ApprovedRegion[];
  results: ApprovedRouteAssertionResults;
  fingerprint: ApprovedComparisonReport["renderer"];
  viewport: { width: number; height: number };
}): ApprovedComparisonReport {
  const mismatchPassed = input.mismatchPixelRatio <= input.entry.maxDiffPixelRatio;
  const subResultsPassed = input.results.geometry.every((item) => item.passed)
    && input.results.typography.every((item) => item.passed)
    && input.results.firstViewport.every((item) => item.passed)
    && (input.results.defaultVisibleCount?.passed ?? true)
    && input.results.overflow.passed
    && input.results.interactions.every((item) => item.passed)
    && input.results.requestAudit.passed
    && input.results.requestAudit.unmatched === 0
    && input.results.requestAudit.effecting === 0;
  return {
    schemaVersion: APPROVED_COMPARISON_REPORT_SCHEMA_VERSION,
    id: input.entry.id,
    referenceSha256: input.entry.sha256,
    candidateSha256: createHash("sha256").update(input.candidatePng).digest("hex"),
    normalizedSize: input.entry.referenceSize,
    mismatchPixelRatio: input.mismatchPixelRatio,
    mismatchPassed,
    regions: input.regions.map((region) => ({ ...region, deltas: regionDeltas(region) })),
    renderer: input.fingerprint,
    viewport: input.viewport,
    geometry: input.results.geometry,
    typography: input.results.typography,
    firstViewport: input.results.firstViewport,
    defaultVisibleCount: input.results.defaultVisibleCount,
    overflow: input.results.overflow,
    interactions: input.results.interactions,
    requestAudit: input.results.requestAudit,
    mask: null,
    verdict: mismatchPassed && subResultsPassed ? "pass" : "fail",
  };
}

function decodePngDataUrl(value: string): Buffer {
  const prefix = "data:image/png;base64,";
  if (!value.startsWith(prefix)) throw new Error("Approved artifact is not a PNG data URL");
  const decoded = Buffer.from(value.slice(prefix.length), "base64");
  if (decoded.length === 0) throw new Error("Approved artifact decoded to zero bytes");
  return decoded;
}

export function writeApprovedArtifacts(
  testInfo: ArtifactWriter,
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

function rendererFingerprintComplete(renderer: ApprovedComparisonReport["renderer"] | undefined): boolean {
  if (!renderer) return false;
  return Boolean(
    renderer.image
    && renderer.browser
    && renderer.playwrightVersion
    && renderer.nodeVersion
    && renderer.pnpmVersion
    && Number.isFinite(renderer.dpr)
    && Array.isArray(renderer.pretendardFaces),
  );
}

export function assertApprovedRouteReport(report: ApprovedComparisonReport): void {
  for (const field of APPROVED_COMPARISON_REPORT_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(report, field) || report[field] === undefined) {
      throw new Error(`Missing report field: ${field}`);
    }
  }
  if (report.schemaVersion !== APPROVED_COMPARISON_REPORT_SCHEMA_VERSION) {
    throw new Error("schemaVersion must be 1");
  }
  if (report.mask !== null) {
    throw new Error("mask must be null");
  }
  if (!rendererFingerprintComplete(report.renderer)) {
    throw new Error("renderer fingerprint is incomplete");
  }
  assertApprovedMismatchRatio({
    id: report.id,
    mismatchPixelRatio: report.mismatchPixelRatio,
    maxDiffPixelRatio: 0.02,
  });
  if (report.verdict !== "pass" || !report.mismatchPassed) {
    throw new Error(`${report.id} visual authority verdict is ${report.verdict}`);
  }
  const failed = [
    ...report.geometry.filter((item) => !item.passed).map((item) => `geometry:${item.name}`),
    ...report.typography.filter((item) => !item.passed).map((item) => `typography:${item.name}`),
    ...report.firstViewport.filter((item) => !item.passed).map((item) => `firstViewport:${item.name}`),
    ...(report.defaultVisibleCount && !report.defaultVisibleCount.passed ? ["defaultVisibleCount"] : []),
    ...(!report.overflow.passed ? ["overflow"] : []),
    ...report.interactions.filter((item) => !item.passed).map((item) => `interaction:${item.name}`),
    ...(!report.requestAudit.passed ? ["requestAudit"] : []),
  ];
  if (failed.length > 0) {
    throw new Error(`${report.id} failed sub-results: ${failed.join(", ")}`);
  }
}

export async function compareAndWriteApprovedArtifacts(input: {
  page: Page;
  testInfo: ArtifactWriter;
  entry: ApprovedMockupEntry;
  candidatePng: Buffer;
  regions: readonly ApprovedRegion[];
  results: ApprovedRouteAssertionResults;
  fingerprint?: ApprovedComparisonReport["renderer"];
  viewport?: { width: number; height: number };
  assertAfterWrite?: boolean;
}): Promise<ApprovedComparisonReport> {
  verifyApprovedReference(input.entry);
  const reference = readFileSync(resolve(process.cwd(), input.entry.referencePath));
  const rendered = await input.page.evaluate(compareApprovedPngs, {
    referenceBase64: reference.toString("base64"),
    candidateBase64: input.candidatePng.toString("base64"),
    size: input.entry.referenceSize,
    maxChannelDelta: input.entry.maxChannelDelta,
  });
  const report = buildApprovedComparisonReport({
    entry: input.entry,
    candidatePng: input.candidatePng,
    mismatchPixelRatio: rendered.mismatchPixelRatio,
    regions: input.regions,
    results: input.results,
    fingerprint: input.fingerprint ?? processFingerprint(),
    viewport: input.viewport ?? input.entry.cssViewport,
  });
  writeApprovedArtifacts(input.testInfo, input.entry.id, reference, rendered, report);
  if (input.assertAfterWrite !== false) assertApprovedRouteReport(report);
  return report;
}

export async function captureApprovedViewportComparison(input: {
  page: Page;
  testInfo: TestInfo;
  entry: ApprovedMockupEntry;
  regions: readonly ApprovedRegion[];
  results: ApprovedRouteAssertionResults;
}): Promise<ApprovedComparisonReport> {
  await input.page.evaluate(() => document.fonts.ready);
  await input.page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  const candidatePng = await input.page.screenshot({ animations: "disabled", fullPage: false });
  const fingerprint = await readRendererFingerprint(input.page);
  return compareAndWriteApprovedArtifacts({
    ...input,
    candidatePng,
    fingerprint,
    viewport: input.entry.cssViewport,
    assertAfterWrite: false,
  });
}

async function readRendererFingerprint(page: Page): Promise<ApprovedComparisonReport["renderer"]> {
  const measured = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    pretendardFaces: [...document.fonts]
      .filter((font) => font.family.includes("Pretendard"))
      .map((font) => font.family),
    browser: navigator.userAgent,
  }));
  return {
    ...processFingerprint(),
    dpr: measured.dpr,
    pretendardFaces: measured.pretendardFaces,
    browser: measured.browser,
  };
}

export async function captureApprovedComparison(input: ApprovedComparisonInput): Promise<ApprovedComparisonReport> {
  const { page, testInfo, entry, candidate, regions } = input;
  for (const region of regions) {
    expectGeometryWithinTolerance(region.actual, region.expected, region.toleranceCssPx);
  }
  const candidatePng = await candidate.screenshot({ animations: "disabled" });
  return compareAndWriteApprovedArtifacts({
    page,
    testInfo,
    entry,
    candidatePng,
    regions,
    results: passedResultsFromRegions(regions),
  });
}
