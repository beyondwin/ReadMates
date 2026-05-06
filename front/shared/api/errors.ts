export type ReadmatesApiErrorBody = {
  code: string;
  message: string;
  status: number;
};

export type ReadmatesApiErrorMetadata = {
  status: number;
  statusText: string;
  url: string;
  redirected: boolean;
  type: ResponseType;
};

type FallbackApiError = ReadmatesApiErrorBody & {
  fallback: true;
};

const fallbackByStatus: Record<number, ReadmatesApiErrorBody> = {
  400: { code: "INVALID_REQUEST", message: "요청을 처리할 수 없습니다.", status: 400 },
  401: { code: "AUTHENTICATION_REQUIRED", message: "로그인이 필요합니다.", status: 401 },
  403: { code: "PERMISSION_DENIED", message: "이 작업을 수행할 권한이 없습니다.", status: 403 },
  404: { code: "RESOURCE_NOT_FOUND", message: "요청한 리소스를 찾을 수 없습니다.", status: 404 },
  409: { code: "CONFLICT", message: "요청한 작업이 현재 상태와 충돌합니다.", status: 409 },
  410: { code: "GONE", message: "더 이상 사용할 수 없는 경로입니다.", status: 410 },
  503: { code: "SERVICE_UNAVAILABLE", message: "서비스를 일시적으로 사용할 수 없습니다.", status: 503 },
};

function fallbackApiErrorBody(status: number): FallbackApiError {
  const body = fallbackByStatus[status] || {
    code: status >= 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
    message: status >= 500 ? "서비스 오류가 발생했습니다." : "요청을 처리할 수 없습니다.",
    status,
  };

  return { ...body, status, fallback: true };
}

function isApiErrorBody(value: unknown): value is ReadmatesApiErrorBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Partial<ReadmatesApiErrorBody>;
  return typeof body.code === "string" && typeof body.message === "string" && typeof body.status === "number";
}

async function parseApiErrorBody(response: Response): Promise<ReadmatesApiErrorBody & { fallback: boolean }> {
  try {
    const text = await response.clone().text();
    if (!text.trim()) {
      return fallbackApiErrorBody(response.status);
    }

    const parsed: unknown = JSON.parse(text);
    if (!isApiErrorBody(parsed)) {
      return fallbackApiErrorBody(response.status);
    }

    return {
      code: parsed.code,
      message: parsed.message,
      status: response.status,
      fallback: parsed.status !== response.status,
    };
  } catch {
    return fallbackApiErrorBody(response.status);
  }
}

export class ReadmatesApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fallback: boolean;
  readonly metadata: ReadmatesApiErrorMetadata;
  readonly response: Response;

  constructor(body: ReadmatesApiErrorBody & { fallback: boolean }, response: Response) {
    super(body.message);
    this.name = "ReadmatesApiError";
    this.status = response.status;
    this.code = body.code;
    this.fallback = body.fallback;
    this.metadata = {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      redirected: response.redirected,
      type: response.type,
    };
    this.response = response;
  }
}

export function isReadmatesApiError(error: unknown): error is ReadmatesApiError {
  return error instanceof ReadmatesApiError;
}

export async function apiErrorFromResponse(response: Response) {
  return new ReadmatesApiError(await parseApiErrorBody(response), response);
}
