import {
  isReadmatesApiError,
  isReadmatesTransportError,
} from "@/shared/api/errors";

export function recoverableHostListLoaderFailure(error: unknown): null {
  if (isReadmatesTransportError(error)) {
    return null;
  }
  if (isReadmatesApiError(error) && error.status !== 401 && error.status !== 403) {
    return null;
  }
  throw error;
}
