import { EventEmitter, once } from "node:events";
import { PassThrough, Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { configureOAuthNavigationProxy } from "../../shared/auth/oauth-vite-proxy";

type ResponseFixture = PassThrough & {
  capturedHeaders: Record<string, string | string[] | number | undefined>;
  capturedStatus?: number;
};

function requestFixture(url: string, headers: IncomingMessage["headers"]): IncomingMessage {
  return Object.assign(new PassThrough(), { headers, url }) as unknown as IncomingMessage;
}

function responseFixture(): ResponseFixture {
  const response = new PassThrough() as unknown as ResponseFixture;
  let headersSent = false;
  response.capturedHeaders = {};
  Object.defineProperty(response, "headersSent", { get: () => headersSent });
  Object.defineProperty(response, "writeHead", {
    value: (status: number, headers?: Record<string, string | string[] | number | undefined>) => {
      response.capturedStatus = status;
      response.capturedHeaders = headers ?? {};
      headersSent = true;
      return response;
    },
  });
  return response;
}

function upstreamFixture(
  status: number,
  body: string,
  headers: IncomingMessage["headers"] = {},
): IncomingMessage {
  return Object.assign(Readable.from([body]), { headers, statusCode: status }) as unknown as IncomingMessage;
}

function configuredProxy(phase: "authorization" | "callback") {
  const proxy = new EventEmitter();
  const options: { selfHandleResponse?: boolean } = {};
  configureOAuthNavigationProxy(phase)(proxy as never, options as never);
  return { proxy, options };
}

describe("Vite OAuth navigation proxy", () => {
  it("redirects an HTML authorization 404 to the safe local route", async () => {
    const { proxy, options } = configuredProxy("authorization");
    const request = requestFixture(
      "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&joinIntent=issued-placeholder&state=opaque-placeholder",
      { accept: "text/html", "sec-fetch-dest": "document" },
    );
    const response = responseFixture();
    const finished = once(response, "finish");

    proxy.emit(
      "proxyRes",
      upstreamFixture(404, "provider detail must stay upstream", {
        "set-cookie": ["oauth_state=expired; Path=/; Max-Age=0; HttpOnly"],
      }),
      request,
      response,
    );
    await finished;

    expect(options.selfHandleResponse).toBe(true);
    expect(response.capturedStatus).toBe(302);
    expect(response.capturedHeaders.location).toBe(
      "/auth/error?kind=oauth_unavailable&returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );
    expect(response.capturedHeaders["set-cookie"]).toEqual([
      "oauth_state=expired; Path=/; Max-Age=0; HttpOnly",
    ]);
    expect(response.read()).toBeNull();
  });

  it("passes a JSON 404 status, headers, and body through", async () => {
    const { proxy } = configuredProxy("authorization");
    const request = requestFixture("/oauth2/authorization/google?returnTo=/app", {
      accept: "application/json",
    });
    const response = responseFixture();
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    const finished = once(response, "finish");

    proxy.emit(
      "proxyRes",
      upstreamFixture(404, '{"code":"UPSTREAM_NOT_FOUND"}', { "content-type": "application/json" }),
      request,
      response,
    );
    await finished;

    expect(response.capturedStatus).toBe(404);
    expect(response.capturedHeaders["content-type"]).toBe("application/json");
    expect(Buffer.concat(chunks).toString()).toBe('{"code":"UPSTREAM_NOT_FOUND"}');
  });

  it("translates a document connection error before Vite writes its plain 502", async () => {
    const { proxy } = configuredProxy("callback");
    const request = requestFixture("/login/oauth2/code/google?state=opaque-placeholder", {
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
    const response = responseFixture();
    const finished = once(response, "finish");

    proxy.emit("error", new Error("connect ECONNREFUSED private-upstream-placeholder"), request, response);
    await finished;

    expect(response.capturedStatus).toBe(302);
    expect(response.capturedHeaders.location).toBe("/auth/error?kind=service_unavailable");
  });

  it("leaves programmatic connection errors for Vite's existing handler", () => {
    const { proxy } = configuredProxy("authorization");
    const request = requestFixture("/oauth2/authorization/google", { accept: "application/json" });
    const response = responseFixture();

    proxy.emit("error", new Error("connect ECONNREFUSED"), request, response);

    expect(response.capturedStatus).toBeUndefined();
    expect(response.writableEnded).toBe(false);
  });
});
