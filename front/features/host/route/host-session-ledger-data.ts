import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import type { HostSessionListPage } from "@/features/host/api/host-contracts";
import type { HostSessionLedgerFilters } from "@/features/host/model/host-session-ledger-model";
import { normalizeHostSessionLedgerFilters } from "@/features/host/model/host-session-ledger-model";
import {
  hostSessionRecordLedgerQuery,
} from "@/features/host/queries/host-session-record-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";

export const HOST_SESSION_LEDGER_PAGE_LIMIT = 50;

export type HostSessionLedgerRouteData = {
  filters: HostSessionLedgerFilters;
  page: HostSessionListPage | null;
};

export function hostSessionLedgerFiltersFromRequest(request?: Request) {
  return normalizeHostSessionLedgerFilters(
    request ? new URL(request.url).searchParams : new URLSearchParams(),
  );
}

export function hostSessionLedgerLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostSessionLedgerRouteData> => {
    await requireHostLoaderAuth(args);
    const filters = hostSessionLedgerFiltersFromRequest(args?.request);
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };
    const request = {
      ...filters,
      page: { limit: HOST_SESSION_LEDGER_PAGE_LIMIT },
    };

    const page = await client.fetchQuery(hostSessionRecordLedgerQuery(request, context))
      .catch(() => null);

    return { filters, page };
  };
}
