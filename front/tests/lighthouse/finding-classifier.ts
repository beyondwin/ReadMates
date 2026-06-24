import type {
  LighthouseCauseBucket,
  LighthouseRouteDefinition,
  NormalizedLighthouseResult,
} from "./types";

type RawLhrAudit = {
  id?: string;
  title?: string;
  score?: number | null;
  numericValue?: number | null;
};

type RawLhr = {
  categories?: Record<string, { score?: number | null } | undefined>;
  audits?: Record<string, RawLhrAudit | undefined>;
};

const auditBuckets: Record<string, LighthouseCauseBucket> = {
  "unused-javascript": "bundle_js_cost",
  "legacy-javascript": "bundle_js_cost",
  "bootup-time": "bundle_js_cost",
  "mainthread-work-breakdown": "bundle_js_cost",
  "uses-optimized-images": "image_media",
  "uses-responsive-images": "image_media",
  "offscreen-images": "image_media",
  "cumulative-layout-shift": "layout_stability",
  "layout-shifts": "layout_stability",
  "color-contrast": "accessibility",
  "button-name": "accessibility",
  "link-name": "accessibility",
  "aria-allowed-attr": "accessibility",
  "aria-required-attr": "accessibility",
  "heading-order": "accessibility",
  "document-title": "seo_public_metadata",
  "meta-description": "seo_public_metadata",
  canonical: "seo_public_metadata",
  "crawlable-anchors": "seo_public_metadata",
  "errors-in-console": "security_best_practices",
  "csp-xss": "security_best_practices",
  deprecations: "security_best_practices",
};

export function classifyAuditId(auditId: string): LighthouseCauseBucket {
  return auditBuckets[auditId] ?? "security_best_practices";
}

function categoryScore(lhr: RawLhr, key: string) {
  return lhr.categories?.[key]?.score ?? null;
}

function isFailedAudit(audit: RawLhrAudit) {
  if (audit.score === null || audit.score === undefined) {
    return false;
  }
  return audit.score < 1;
}

export function summarizeLhr(
  route: LighthouseRouteDefinition,
  lhr: RawLhr,
): NormalizedLighthouseResult {
  const findings = Object.entries(lhr.audits ?? {})
    .filter((entry): entry is [string, RawLhrAudit] => Boolean(entry[1]))
    .filter(([, audit]) => isFailedAudit(audit))
    .map(([auditId, audit]) => ({
      auditId,
      title: audit.title ?? auditId,
      score: audit.score ?? null,
      numericValue: audit.numericValue ?? null,
      bucket: classifyAuditId(auditId),
    }));

  return {
    routeId: route.id,
    group: route.group,
    path: route.path,
    mode: route.mode,
    status: "passed",
    scores: {
      performance: categoryScore(lhr, "performance"),
      accessibility: categoryScore(lhr, "accessibility"),
      bestPractices: categoryScore(lhr, "best-practices"),
      seo: categoryScore(lhr, "seo"),
    },
    findings,
  };
}
