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
  allowFontRasterException?: boolean;
  fontRasterExceptionMaxRatio?: number;
  skipMismatchRatioAssertion?: boolean;
};

export const FONT_RASTER_EXCEPTION_MAX_RATIO = 0.10;
export const HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO = 0.15;

export type ApprovedComparisonReport = {
  id: string;
  referenceSha256: string;
  candidateSha256: string;
  normalizedSize: { width: number; height: number };
  mismatchPixelRatio: number;
  regions: Array<ApprovedRegion & { deltas: { x: number; y: number; width: number; height: number } }>;
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
  allowFontRasterException?: boolean;
  fontRasterExceptionMaxRatio?: number;
  skipMismatchRatioAssertion?: boolean;
}): void {
  if (input.skipMismatchRatioAssertion === true) return;
  if (input.mismatchPixelRatio <= input.maxDiffPixelRatio) return;
  const exceptionCeiling = input.fontRasterExceptionMaxRatio ?? FONT_RASTER_EXCEPTION_MAX_RATIO;
  if (
    input.allowFontRasterException === true
    && input.mismatchPixelRatio <= exceptionCeiling
  ) {
    return;
  }
  const ceiling = input.allowFontRasterException === true
    ? exceptionCeiling
    : input.maxDiffPixelRatio;
  throw new Error(`${input.id} mismatch ratio ${input.mismatchPixelRatio} exceeds ${ceiling}`);
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
  assertApprovedMismatchRatio({
    id: entry.id,
    mismatchPixelRatio: report.mismatchPixelRatio,
    maxDiffPixelRatio: entry.maxDiffPixelRatio,
    allowFontRasterException: input.allowFontRasterException,
    fontRasterExceptionMaxRatio: input.fontRasterExceptionMaxRatio,
    skipMismatchRatioAssertion: input.skipMismatchRatioAssertion,
  });
  return report;
}
