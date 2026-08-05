import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { ProxyOptions } from "vite";
import {
  isHtmlDocumentNavigation,
  oauthErrorLocation,
  type OAuthProxyPhase,
} from "./oauth-error";

export function configureOAuthNavigationProxy(phase: OAuthProxyPhase): NonNullable<ProxyOptions["configure"]> {
  return (proxy, options) => {
    options.selfHandleResponse = true;

    proxy.on("proxyRes", (proxyResponse, request, response) => {
      const status = proxyResponse.statusCode ?? 502;
      if (status >= 400 && isHtmlDocumentNavigation(request.headers)) {
        const location = oauthErrorLocation({
          requestUrl: request.url ?? "/",
          status,
          phase,
        });
        response.writeHead(302, errorRedirectHeaders(proxyResponse.headers, location)).end();
        proxyResponse.resume();
        return;
      }

      response.writeHead(status, proxyResponse.headers);
      proxyResponse.pipe(response);
    });

    proxy.on("error", (_error, request, response) => {
      if (!isServerResponse(response) || response.headersSent || response.writableEnded) return;
      if (!isHtmlDocumentNavigation(request.headers)) return;

      const location = oauthErrorLocation({
        requestUrl: request.url ?? "/",
        status: null,
        phase,
      });
      response.writeHead(302, errorRedirectHeaders({}, location)).end();
    });
  };
}

function errorRedirectHeaders(headers: IncomingMessage["headers"], location: string): OutgoingHttpHeaders {
  const responseHeaders: OutgoingHttpHeaders = {
    "cache-control": "no-store",
    location,
  };

  for (const name of ["set-cookie", "x-readmates-request-id"] as const) {
    const value = headers[name];
    if (value !== undefined) responseHeaders[name] = value;
  }

  return responseHeaders;
}

function isServerResponse(response: ServerResponse | Socket): response is ServerResponse {
  return "writeHead" in response;
}
