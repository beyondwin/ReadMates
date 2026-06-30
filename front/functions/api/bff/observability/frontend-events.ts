import { bffErrorResponse } from "../../../_shared/errors";
import {
  apiBaseUrlFromEnv,
  bffSecretFromEnv,
  copyUpstreamHeaders,
  requestIdForUpstream,
  READMATES_REQUEST_ID_HEADER,
} from "../../../_shared/proxy";
import { sanitizeFrontendObservabilityBatchWithDropped } from "../../../../shared/observability/frontend-observability-contracts";

type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;
  READMATES_BFF_SECRETS?: string;
};

type PagesFunction<Env> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
  waitUntil: (promise: Promise<unknown>) => void;
}) => Response | Promise<Response>;

const MAX_BODY_BYTES = 16 * 1024;

function jsonResponse(body: unknown, status = 202, headers = new Headers()) {
  const outbound = new Response(JSON.stringify(body), {
    status,
    headers: copyUpstreamHeaders(headers),
  });
  outbound.headers.set("Content-Type", "application/json; charset=utf-8");
  outbound.headers.set("Cache-Control", "no-store");
  return outbound;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== "POST") {
    return bffErrorResponse(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.");
  }

  const contentType = context.request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return bffErrorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "JSON 요청만 지원합니다.");
  }

  const body = await context.request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return bffErrorResponse(413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return bffErrorResponse(400, "INVALID_REQUEST", "요청을 처리할 수 없습니다.");
  }

  const rawEvents =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { events?: unknown }).events)
      ? (parsed as { events: unknown[] }).events
      : [];
  const sanitized = sanitizeFrontendObservabilityBatchWithDropped(rawEvents);

  const upstreamUrl = new URL("/api/observability/frontend-events", apiBaseUrlFromEnv(context.env));
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set(READMATES_REQUEST_ID_HEADER, requestIdForUpstream(context.request));
  for (const name of ["Origin", "Referer"]) {
    const value = context.request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const bffSecret = bffSecretFromEnv(context.env);
  if (bffSecret) {
    headers.set("X-Readmates-Bff-Secret", bffSecret);
  }

  const upstream = await fetch(upstreamUrl.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(sanitized),
    redirect: "manual",
  });

  const responseText = await upstream.text();
  let responseBody: unknown = { accepted: upstream.ok ? sanitized.events.length : 0, dropped: 0 };
  if (responseText.trim()) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { accepted: 0, dropped: 0 };
    }
  }

  return jsonResponse(responseBody, upstream.status, upstream.headers);
};
