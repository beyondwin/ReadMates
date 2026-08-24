export type SupportedHostClientContract = "v2" | "v3";
export type HostClientContractCapability = "V2_ONLY" | "V2_V3";

export const HOST_CLIENT_CONTRACT_HEADER = "X-Readmates-Client-Contract";
export const PRODUCTION_HOST_CLIENT_CONTRACT_CAPABILITY: HostClientContractCapability = "V2_V3";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HOST_API_MUTATION_PATH = /^\/(?:api\/bff\/)?api\/host(?:\/|[?])/;

export function normalizeHostClientContract(value: string | null): SupportedHostClientContract | null {
  return value === "v2" || value === "v3" ? value : null;
}

export function hostClientContractCapabilityFromEnv(
  env: { READMATES_HOST_CLIENT_CONTRACT_CAPABILITY?: string } | undefined,
): HostClientContractCapability {
  return env?.READMATES_HOST_CLIENT_CONTRACT_CAPABILITY === "V2_ONLY" ? "V2_ONLY" : "V2_V3";
}

export function supportedHostClientContracts(
  capability: HostClientContractCapability,
): readonly SupportedHostClientContract[] {
  return capability === "V2_ONLY" ? ["v2"] : ["v2", "v3"];
}

export function acceptedHostClientContract(
  value: string | null,
  capability: HostClientContractCapability,
): SupportedHostClientContract | null {
  const normalized = normalizeHostClientContract(value);
  if (normalized === null) {
    return null;
  }
  return supportedHostClientContracts(capability).includes(normalized) ? normalized : null;
}

export function hostClientContractStatusBody(capability: HostClientContractCapability) {
  return {
    schemaVersion: 1 as const,
    supportedHostClientContracts: [...supportedHostClientContracts(capability)],
  };
}

export function isHostApiMutation(method: string | undefined, path: string | undefined) {
  return MUTATING_METHODS.has(method ?? "") && HOST_API_MUTATION_PATH.test(path ?? "");
}

export type HostClientContractProxyDecision = "forward" | "omit" | "reject";

export type HostClientContractProxyRequest = {
  method?: string;
  path?: string;
  getHeader(name: string): unknown;
  removeHeader(name: string): void;
  setHeader(name: string, value: number | string | readonly string[]): void;
};

export const HOST_CLIENT_UPGRADE_REQUIRED = {
  status: 409,
  code: "HOST_CLIENT_UPGRADE_REQUIRED",
  message: "호스트 운영 화면을 최신 버전으로 새로고침해 주세요.",
} as const;

export type HostClientUpgradeRequiredResponse = {
  headersSent?: boolean;
  writableEnded?: boolean;
  writeHead(status: number, headers?: Record<string, string>): unknown;
  end(body?: string): unknown;
};

function hostClientContractHeaderValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function requestClientContractHeader(headers: { [header: string]: unknown } | undefined) {
  if (!headers) {
    return null;
  }
  return hostClientContractHeaderValue(
    headers["x-readmates-client-contract"] ?? headers[HOST_CLIENT_CONTRACT_HEADER],
  );
}

export function writeHostClientUpgradeRequired(res: HostClientUpgradeRequiredResponse) {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.writeHead(HOST_CLIENT_UPGRADE_REQUIRED.status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(
    JSON.stringify({
      code: HOST_CLIENT_UPGRADE_REQUIRED.code,
      message: HOST_CLIENT_UPGRADE_REQUIRED.message,
      status: HOST_CLIENT_UPGRADE_REQUIRED.status,
    }),
  );
}

export function applyHostClientContractProxyHeader(
  proxyReq: HostClientContractProxyRequest,
  capability: HostClientContractCapability = PRODUCTION_HOST_CLIENT_CONTRACT_CAPABILITY,
): HostClientContractProxyDecision {
  const raw = hostClientContractHeaderValue(proxyReq.getHeader(HOST_CLIENT_CONTRACT_HEADER));
  proxyReq.removeHeader(HOST_CLIENT_CONTRACT_HEADER);
  if (!isHostApiMutation(proxyReq.method, proxyReq.path)) {
    return "omit";
  }
  const accepted = acceptedHostClientContract(raw, capability);
  if (!accepted) {
    return "reject";
  }
  proxyReq.setHeader(HOST_CLIENT_CONTRACT_HEADER, accepted);
  return "forward";
}

export function hostClientContractViteBypass(
  req: {
    method?: string;
    url?: string;
    headers?: { [header: string]: unknown };
  },
  res: HostClientUpgradeRequiredResponse | undefined,
  capability: HostClientContractCapability = PRODUCTION_HOST_CLIENT_CONTRACT_CAPABILITY,
): string | undefined {
  if (!res) {
    return undefined;
  }
  if (!isHostApiMutation(req.method, req.url)) {
    return undefined;
  }
  if (acceptedHostClientContract(requestClientContractHeader(req.headers), capability)) {
    return undefined;
  }
  writeHostClientUpgradeRequired(res);
  return req.url ?? "/";
}
