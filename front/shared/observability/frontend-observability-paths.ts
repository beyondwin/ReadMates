export const FRONTEND_OBSERVABILITY_BROWSER_PATH =
  "/api/bff/observability/frontend-events";

export const FRONTEND_OBSERVABILITY_UPSTREAM_PATH =
  "/api/observability/frontend-events";

const LOCAL_PROXY_BASE_URL = "http://readmates.local";

export function rewriteFrontendObservabilityProxyPath(
  proxyPath: string,
): string | null {
  const url = new URL(proxyPath, LOCAL_PROXY_BASE_URL);
  if (url.pathname !== FRONTEND_OBSERVABILITY_BROWSER_PATH) {
    return null;
  }

  return `${FRONTEND_OBSERVABILITY_UPSTREAM_PATH}${url.search}`;
}
