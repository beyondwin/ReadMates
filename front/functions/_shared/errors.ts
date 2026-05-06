export type ApiErrorResponse = {
  code: string;
  message: string;
  status: number;
};

const defaultMessages: Record<number, string> = {
  400: "요청을 처리할 수 없습니다.",
  401: "로그인이 필요합니다.",
  403: "이 작업을 수행할 권한이 없습니다.",
  404: "요청한 리소스를 찾을 수 없습니다.",
  409: "요청한 작업이 현재 상태와 충돌합니다.",
  410: "더 이상 사용할 수 없는 경로입니다.",
  503: "서비스를 일시적으로 사용할 수 없습니다.",
};

export function bffErrorResponse(
  status: number,
  code: string,
  message = defaultMessages[status] || "서비스 오류가 발생했습니다.",
) {
  const body: ApiErrorResponse = { code, message, status };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
