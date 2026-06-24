export type LighthouseRouteGroup = "public" | "member" | "host" | "admin";
export type LighthouseRouteMode = "navigation" | "snapshot" | "timespan";
export type LighthouseRouteAuth = "none" | "member" | "host" | "admin";

export type LighthouseCauseBucket =
  | "bundle_js_cost"
  | "image_media"
  | "layout_stability"
  | "accessibility"
  | "seo_public_metadata"
  | "security_best_practices"
  | "route_data_failure"
  | "external_asset_noise"
  | "audit_failure";

export type LighthouseRouteDefinition = {
  id: string;
  group: LighthouseRouteGroup;
  path: string;
  mode: LighthouseRouteMode;
  auth: LighthouseRouteAuth;
  description: string;
  expectedText?: string;
  notes?: string;
};

export type LighthouseRouteFilters = {
  group?: LighthouseRouteGroup;
  routeId?: string;
  limit?: number;
};

export type LighthouseCategoryScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

export type LighthouseFinding = {
  auditId: string;
  title: string;
  score: number | null;
  numericValue: number | null;
  bucket: LighthouseCauseBucket;
};

export type NormalizedLighthouseResult = {
  routeId: string;
  group: LighthouseRouteGroup;
  path: string;
  mode: LighthouseRouteMode;
  status: "passed" | "route_failure" | "audit_failure";
  scores: LighthouseCategoryScores;
  findings: LighthouseFinding[];
  reportJsonPath?: string;
  reportHtmlPath?: string;
  failureReason?: string;
};
