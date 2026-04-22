export type ReadmatesApiErrorMetadata = {
  status: number;
  statusText: string;
  url: string;
  redirected: boolean;
  type: ResponseType;
};

export class ReadmatesApiError extends Error {
  readonly status: number;
  readonly metadata: ReadmatesApiErrorMetadata;
  readonly response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "ReadmatesApiError";
    this.status = response.status;
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

export function apiErrorFromResponse(response: Response) {
  return new ReadmatesApiError(`ReadMates API failed: ${response.status}`, response);
}
