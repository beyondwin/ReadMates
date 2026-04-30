export interface PagedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PageRequest {
  limit?: number;
  cursor?: string | null;
}

export function pagingSearchParams(request?: PageRequest): string {
  if (!request) {
    return "";
  }

  const params = new URLSearchParams();
  if (request.limit !== undefined) {
    params.set("limit", String(request.limit));
  }
  if (request.cursor) {
    params.set("cursor", request.cursor);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}
