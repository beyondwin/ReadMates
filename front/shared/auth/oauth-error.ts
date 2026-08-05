import { loginPathForReturnTo, safeRelativeReturnTo } from "./login-return";

export const oauthErrorKinds = [
  "oauth_unavailable",
  "request_invalid",
  "session_required",
  "access_denied",
  "request_expired",
  "rate_limited",
  "internal_error",
  "service_unavailable",
  "unexpected",
] as const;

export type OAuthErrorKind = (typeof oauthErrorKinds)[number];
export type OAuthProxyPhase = "authorization" | "callback";

export type OAuthErrorAction = {
  href: string;
  label: string;
};

export type OAuthErrorViewModel = {
  kind: OAuthErrorKind;
  eyebrow: string;
  heading: string;
  body: string;
  reassurance: string;
  primaryAction: OAuthErrorAction;
  secondaryAction: OAuthErrorAction;
  helpText?: string;
};

type HeaderRecord = Record<string, string | string[] | undefined>;
type HeaderSource = Pick<Headers, "get"> | HeaderRecord;

const errorCopy: Record<OAuthErrorKind, Omit<OAuthErrorViewModel, "kind" | "primaryAction" | "secondaryAction"> & {
  primaryLabel: string;
}> = {
  oauth_unavailable: {
    eyebrow: "로그인 안내",
    heading: "로그인을 시작할 수 없습니다.",
    body: "현재 Google 로그인을 열 수 없습니다. 클럽으로 돌아가 잠시 후 새로 시작해 주세요.",
    reassurance: "입력하거나 변경한 내용은 없습니다.",
    primaryLabel: "클럽으로 돌아가기",
    helpText: "문제가 계속되면 클럽 운영자에게 로그인 설정을 확인해 달라고 알려 주세요.",
  },
  request_invalid: {
    eyebrow: "요청 확인",
    heading: "로그인 요청을 확인할 수 없습니다.",
    body: "이전 주소를 다시 열지 말고 안전한 화면에서 로그인을 새로 시작해 주세요.",
    reassurance: "계정이나 가입 상태는 바뀌지 않았습니다.",
    primaryLabel: "클럽으로 돌아가기",
  },
  session_required: {
    eyebrow: "로그인 필요",
    heading: "로그인을 다시 시작해 주세요.",
    body: "인증 흐름이 끝났거나 현재 세션을 확인할 수 없습니다.",
    reassurance: "새 로그인 요청을 시작해도 기존 기록은 그대로 유지됩니다.",
    primaryLabel: "로그인으로 이동",
  },
  access_denied: {
    eyebrow: "권한 필요",
    heading: "이 요청을 계속할 수 없습니다.",
    body: "현재 계정 또는 클럽 상태로는 이 로그인 요청을 마칠 수 없습니다.",
    reassurance: "입력하거나 변경한 내용은 없습니다.",
    primaryLabel: "클럽으로 돌아가기",
  },
  request_expired: {
    eyebrow: "요청 만료",
    heading: "로그인 요청이 만료되었습니다.",
    body: "이전 요청을 재사용하지 말고 클럽 화면에서 새 로그인 요청을 시작해 주세요.",
    reassurance: "만료된 요청으로 가입 상태가 바뀌지는 않았습니다.",
    primaryLabel: "클럽으로 돌아가기",
  },
  rate_limited: {
    eyebrow: "잠시 후 다시",
    heading: "요청이 잠시 많습니다.",
    body: "잠시 기다린 뒤 클럽 화면에서 새 로그인 요청을 시작해 주세요.",
    reassurance: "입력하거나 변경한 내용은 없습니다.",
    primaryLabel: "클럽으로 돌아가기",
  },
  internal_error: {
    eyebrow: "서비스 오류",
    heading: "요청을 마치지 못했습니다.",
    body: "서비스 내부에서 문제가 발생했습니다. 안전한 화면으로 돌아가 로그인을 새로 시작해 주세요.",
    reassurance: "입력이나 가입 상태는 바뀌지 않았습니다.",
    primaryLabel: "다시 시작하기",
  },
  service_unavailable: {
    eyebrow: "연결 지연",
    heading: "로그인 서비스 연결이 원활하지 않습니다.",
    body: "일시적인 연결 문제일 수 있습니다. 잠시 후 클럽 화면에서 다시 시도해 주세요.",
    reassurance: "입력하거나 변경한 내용은 없습니다.",
    primaryLabel: "잠시 후 다시 시도",
  },
  unexpected: {
    eyebrow: "요청 중단",
    heading: "요청을 계속할 수 없습니다.",
    body: "로그인 요청을 마치지 못했습니다. 안전한 화면으로 돌아가 새로 시작해 주세요.",
    reassurance: "입력이나 가입 상태는 바뀌지 않았습니다.",
    primaryLabel: "클럽으로 돌아가기",
  },
};

export function classifyOAuthError(status: number | null, phase: OAuthProxyPhase): OAuthErrorKind {
  if (status === null || (status >= 502 && status <= 599)) return "service_unavailable";
  if (status === 404 && phase === "authorization") return "oauth_unavailable";
  if (status === 400) return "request_invalid";
  if (status === 401) return "session_required";
  if (status === 403) return "access_denied";
  if (status === 409 || status === 410) return "request_expired";
  if (status === 429) return "rate_limited";
  if (status === 500 || status === 501) return "internal_error";
  return "unexpected";
}

export function isHtmlDocumentNavigation(headers: HeaderSource): boolean {
  const accept = headerValue(headers, "accept")?.toLowerCase() ?? "";
  const destination = headerValue(headers, "sec-fetch-dest")?.toLowerCase();
  return accept.includes("text/html") && (!destination || destination === "document");
}

export function oauthErrorLocation({
  requestUrl,
  status,
  phase,
}: {
  requestUrl: string;
  status: number | null;
  phase: OAuthProxyPhase;
}): string {
  const query = new URLSearchParams({ kind: classifyOAuthError(status, phase) });

  try {
    const sourceUrl = new URL(requestUrl, "http://readmates.local");
    const returnTo = safeOAuthErrorReturnTo(sourceUrl.searchParams.get("returnTo"));
    if (returnTo) query.set("returnTo", returnTo);
  } catch {
    // The fixed kind is sufficient when an upstream URL cannot be parsed.
  }

  return `/auth/error?${query.toString()}`;
}

export function oauthErrorViewModel(
  kindValue: string | null,
  returnToValue: string | null,
): OAuthErrorViewModel {
  const kind = isOAuthErrorKind(kindValue) ? kindValue : "unexpected";
  const returnTo = safeOAuthErrorReturnTo(returnToValue);
  const copy = errorCopy[kind];
  const primaryHref = kind === "session_required" ? loginPathForReturnTo(returnTo) : (returnTo ?? "/");

  return {
    kind,
    eyebrow: copy.eyebrow,
    heading: copy.heading,
    body: copy.body,
    reassurance: copy.reassurance,
    primaryAction: {
      href: primaryHref,
      label: copy.primaryLabel,
    },
    secondaryAction: {
      href: "/",
      label: "공개 홈",
    },
    ...(copy.helpText ? { helpText: copy.helpText } : {}),
  };
}

export function isOAuthErrorKind(value: string | null | undefined): value is OAuthErrorKind {
  return oauthErrorKinds.includes(value as OAuthErrorKind);
}

function safeOAuthErrorReturnTo(value: string | null | undefined) {
  const returnTo = safeRelativeReturnTo(value);
  return returnTo && !/^\/auth\/error(?:[/?#]|$)/i.test(returnTo) ? returnTo : null;
}

function headerValue(headers: HeaderSource, name: string) {
  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name) ?? undefined;
  }

  const record = headers as HeaderRecord;
  const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  return Array.isArray(value) ? value.join(",") : value;
}
