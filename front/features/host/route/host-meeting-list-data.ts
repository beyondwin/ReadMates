import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import type { HostSessionListPage, HostSessionTrashPage } from "@/features/host/api/host-contracts";
import { normalizeHostSessionLedgerFilters, type HostSessionLedgerFilters } from "@/features/host/model/host-session-ledger-model";
import { hostMeetingSessionListQuery, hostSessionTrashListQuery } from "@/features/host/queries/host-session-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { recoverableHostListLoaderFailure } from "./host-list-loader-recovery";

export const HOST_MEETING_LIST_PAGE_LIMIT = 50;

export function hostMeetingListPageQuery(page: PageRequest, context?: ReadmatesApiContext) {
  return hostMeetingSessionListQuery(page, context);
}

export type HostMeetingListRouteData =
  | { view: "meeting"; page: HostSessionListPage | null }
  | {
      view: "trash";
      filters: HostSessionLedgerFilters;
      page: null;
      trashPage: HostSessionTrashPage | null;
    };

export function hostMeetingListLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostMeetingListRouteData> => {
    await requireHostLoaderAuth(args);
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };
    const requestUrl = args?.request?.url ?? "https://readmates.local/app/host/sessions";
    const view = new URL(requestUrl).searchParams.get("view");
    if (view === "trash") {
      return {
        view: "trash",
        filters: normalizeHostSessionLedgerFilters(new URLSearchParams("view=trash")),
        page: null,
        trashPage: await client.fetchQuery(
          hostSessionTrashListQuery({ limit: HOST_MEETING_LIST_PAGE_LIMIT }, context),
        ).catch(recoverableHostListLoaderFailure),
      };
    }
    return {
      view: "meeting",
      page: await client.fetchQuery(
        hostMeetingListPageQuery({ limit: HOST_MEETING_LIST_PAGE_LIMIT }, context),
      ).catch(recoverableHostListLoaderFailure),
    };
  };
}
