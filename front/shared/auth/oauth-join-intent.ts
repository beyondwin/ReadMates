import { oauthHrefForReturnTo } from "./login-return";

type Fetcher = typeof fetch;

export async function oauthJoinHref(
  returnTo: string,
  clubSlug: string,
  fetcher: Fetcher = fetch,
  chooseAccount = false,
) {
  const response = await fetcher("/api/bff/api/auth/oauth/join-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ clubSlug, returnTo }),
  });
  if (!response.ok) throw new Error(`OAuth join intent failed: ${response.status}`);
  const body = await response.json() as { intent?: unknown };
  const intent = typeof body.intent === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(body.intent) ? body.intent : null;
  if (!intent) throw new Error("OAuth join intent response is invalid");
  return oauthHrefForReturnTo(returnTo, { joinClub: clubSlug, joinIntent: intent, chooseAccount });
}
