import { z } from "zod";

export const HostClientCapabilitySchema = z.object({
  schemaVersion: z.literal(1),
  supportedHostClientContracts: z.array(z.enum(["v2", "v3"])).superRefine((contracts, context) => {
    if (new Set(contracts).size !== contracts.length) {
      context.addIssue({ code: "custom", message: "duplicate host client contract" });
    }
  }),
}).strict();

export type HostClientCapability = z.infer<typeof HostClientCapabilitySchema>;

export class HostClientUpdateRequiredError extends Error {
  readonly code = "CLIENT_UPDATE_REQUIRED";

  constructor() {
    super("호스트 운영 화면을 최신 버전으로 새로고침해 주세요.");
    this.name = "HostClientUpdateRequiredError";
  }
}

let validatedCapability: Promise<HostClientCapability> | null = null;

function failClosed(): never {
  throw new HostClientUpdateRequiredError();
}

async function fetchCapability(): Promise<HostClientCapability> {
  let response: Response;
  try {
    response = await fetch("/api/bff/__internal/client-contract-status", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return failClosed();
  }

  if (!response.ok || !response.headers.get("Cache-Control")?.toLowerCase().includes("no-store")) {
    return failClosed();
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return failClosed();
  }

  const capability = HostClientCapabilitySchema.safeParse(parsed);
  if (!capability.success || !capability.data.supportedHostClientContracts.includes("v3")) {
    return failClosed();
  }
  return capability.data;
}

export function requireHostClientContractV3(): Promise<HostClientCapability> {
  validatedCapability ??= fetchCapability().catch((error) => {
    validatedCapability = null;
    throw error;
  });
  return validatedCapability;
}

export function __resetHostClientContractCapabilityForTest() {
  validatedCapability = null;
}
