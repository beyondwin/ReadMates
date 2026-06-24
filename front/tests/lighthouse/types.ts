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
