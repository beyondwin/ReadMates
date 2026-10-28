import {
  getConfiguredBffSecrets,
  getRotationStage,
  secretFingerprint,
} from "../../../_shared/proxy";

interface Env {
  READMATES_BFF_SECRETS?: string;
  READMATES_BFF_SECRET?: string;
  BFF_SECRET_ROTATION_STAGE?: string;
}

type Context = { request: Request; env: Env };

export async function onRequestGet(context: Context): Promise<Response> {
  const secrets = getConfiguredBffSecrets(context.env);
  const primary = secrets[0];
  const body = {
    configuredSecretCount: secrets.length,
    rotationStage: getRotationStage(context.env),
    primarySecretFingerprint: primary ? await secretFingerprint(primary) : null,
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
