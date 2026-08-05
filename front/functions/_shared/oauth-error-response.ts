import {
  isHtmlDocumentNavigation,
  oauthErrorLocation,
  type OAuthProxyPhase,
} from "../../shared/auth/oauth-error";
import { bffErrorResponse } from "./errors";
import { copyUpstreamHeaders, READMATES_REQUEST_ID_HEADER } from "./proxy";

export function oauthProxyResponse(
  request: Request,
  upstream: Response,
  phase: OAuthProxyPhase,
  requestId: string,
) {
  if (upstream.status >= 400 && isHtmlDocumentNavigation(request.headers)) {
    const headers = errorRedirectHeaders(upstream.headers, requestId);
    headers.set(
      "Location",
      oauthErrorLocation({ requestUrl: request.url, status: upstream.status, phase }),
    );
    return new Response(null, { status: 302, headers });
  }

  const responseBody = [204, 304].includes(upstream.status) ? null : upstream.body;
  const response = new Response(responseBody, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers),
  });
  response.headers.set(READMATES_REQUEST_ID_HEADER, requestId);
  return response;
}

export function invalidOAuthRouteResponse(
  request: Request,
  phase: OAuthProxyPhase,
  requestId: string,
) {
  if (isHtmlDocumentNavigation(request.headers)) {
    const headers = errorRedirectHeaders(new Headers(), requestId);
    headers.set("Location", oauthErrorLocation({ requestUrl: request.url, status: 400, phase }));
    return new Response(null, { status: 302, headers });
  }

  const response = bffErrorResponse(404, "RESOURCE_NOT_FOUND");
  response.headers.set(READMATES_REQUEST_ID_HEADER, requestId);
  return response;
}

export function oauthProxyNetworkErrorResponse(
  request: Request,
  phase: OAuthProxyPhase,
  requestId: string,
) {
  if (isHtmlDocumentNavigation(request.headers)) {
    const headers = errorRedirectHeaders(new Headers(), requestId);
    headers.set("Location", oauthErrorLocation({ requestUrl: request.url, status: null, phase }));
    return new Response(null, { status: 302, headers });
  }

  const response = bffErrorResponse(503, "OAUTH_UPSTREAM_UNAVAILABLE");
  response.headers.set(READMATES_REQUEST_ID_HEADER, requestId);
  return response;
}

function errorRedirectHeaders(upstreamHeaders: Headers, requestId: string) {
  const headers = copyUpstreamHeaders(upstreamHeaders);
  for (const name of ["content-encoding", "content-length", "content-type", "transfer-encoding"]) {
    headers.delete(name);
  }
  headers.set("Cache-Control", "no-store");
  headers.set(READMATES_REQUEST_ID_HEADER, requestId);
  return headers;
}
