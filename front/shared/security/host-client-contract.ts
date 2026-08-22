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

export type HostClientContractProxyRequest = {
  method?: string;
  path?: string;
  getHeader(name: string): unknown;
  removeHeader(name: string): void;
  setHeader(name: string, value: number | string | readonly string[]): void;
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

export function applyHostClientContractProxyHeader(
  proxyReq: HostClientContractProxyRequest,
  capability: HostClientContractCapability = PRODUCTION_HOST_CLIENT_CONTRACT_CAPABILITY,
) {
  const raw = hostClientContractHeaderValue(proxyReq.getHeader(HOST_CLIENT_CONTRACT_HEADER));
  proxyReq.removeHeader(HOST_CLIENT_CONTRACT_HEADER);
  const accepted = acceptedHostClientContract(raw, capability);
  if (accepted && isHostApiMutation(proxyReq.method, proxyReq.path)) {
    proxyReq.setHeader(HOST_CLIENT_CONTRACT_HEADER, accepted);
  }
}
