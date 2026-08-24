import {
  hostClientContractCapabilityFromEnv,
  hostClientContractStatusBody,
} from "../../../../shared/security/host-client-contract";

interface Env {
  READMATES_HOST_CLIENT_CONTRACT_CAPABILITY?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const body = hostClientContractStatusBody(hostClientContractCapabilityFromEnv(context.env));
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
