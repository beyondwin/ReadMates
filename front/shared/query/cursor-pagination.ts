import type { PageRequest } from "@/shared/model/paging";

export type NormalizedPageRequest = {
  limit: number | null;
  cursor: string | null;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export function normalizePageRequest(page?: PageRequest): NormalizedPageRequest {
  return {
    limit: page?.limit ?? null,
    cursor: page?.cursor ?? null,
  };
}

export function pageFromNormalizedPageRequest(page: NormalizedPageRequest): PageRequest | undefined {
  if (page.limit === null && page.cursor === null) {
    return undefined;
  }

  return {
    ...(page.limit !== null ? { limit: page.limit } : {}),
    ...(page.cursor !== null ? { cursor: page.cursor } : {}),
  };
}

export function pageRequests(limit: number, cursors: string[]): PageRequest[] {
  return [{ limit }, ...cursors.map((cursor) => ({ limit, cursor }))];
}

export function appendCursor(cursors: string[], cursor: string | null | undefined): string[] {
  if (!cursor || cursors.includes(cursor)) {
    return cursors;
  }
  return [...cursors, cursor];
}

export function combineCursorPages<T>(pages: Array<CursorPage<T> | undefined>): CursorPage<T> {
  const lastPage = [...pages].reverse().find(Boolean);
  return {
    items: pages.flatMap((page) => page?.items ?? []),
    nextCursor: lastPage?.nextCursor ?? null,
  };
}
