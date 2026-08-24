import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import type { HostSessionRecordLedgerPage, HostSessionTrashPage } from "@/features/host/api/host-contracts";
import type { HostSessionLedgerFilters } from "@/features/host/model/host-session-ledger-model";
import { normalizeHostSessionLedgerFilters } from "@/features/host/model/host-session-ledger-model";
import {
  hostSessionTrashListQuery,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionRecordLedgerQuery,
} from "@/features/host/queries/host-session-record-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { recoverableHostListLoaderFailure } from "./host-list-loader-recovery";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";

export const HOST_SESSION_LEDGER_PAGE_LIMIT = 50;

export type HostSessionLedgerRouteData = {
  filters: HostSessionLedgerFilters;
  page: HostSessionRecordLedgerPage | null;
  trashPage: HostSessionTrashPage | null;
};

export function hostSessionLedgerFiltersFromRequest(request?: Request) {
  const url = request ? new URL(request.url) : null;
  const params = url?.searchParams ?? new URLSearchParams();
  if (url && /\/host\/records\/?$/.test(url.pathname)) {
    params.delete("view");
  }
  return normalizeHostSessionLedgerFilters(
    params,
  );
}

export function hostSessionLedgerLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostSessionLedgerRouteData> => {
    await requireHostLoaderAuth(args);
    const filters = hostSessionLedgerFiltersFromRequest(args?.request);
    const context = requireHostClubContext(clubSlugFromLoaderArgs(args));
    const request = {
      ...filters,
      page: { limit: HOST_SESSION_LEDGER_PAGE_LIMIT },
    };

    if (filters.view === "trash") {
      const trashPage = await client.fetchQuery(
        hostSessionTrashListQuery({ limit: HOST_SESSION_LEDGER_PAGE_LIMIT }, context),
      ).catch(recoverableHostListLoaderFailure);
      return { filters, page: null, trashPage };
    }

    const page = await client.fetchQuery(hostSessionRecordLedgerQuery(request, context))
      .catch(recoverableHostListLoaderFailure);

    return { filters, page, trashPage: null };
  };
}
