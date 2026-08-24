import {
  isRouteErrorResponse,
  Link,
  useRevalidator,
  useRouteError,
} from "react-router";
import { isReadmatesApiError } from "@/shared/api/errors";
import { RouteErrorPage } from "@/shared/ui/route-error";

export function AdminClubsRouteError() {
  return <AdminClubRouteError detail={false} />;
}

export function AdminClubDetailRouteError() {
  return <AdminClubRouteError detail />;
}

function AdminClubRouteError({ detail }: { detail: boolean }) {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const status = routeErrorStatus(error);
  if (status === 401 || status === 403) {
    return <RouteErrorPage variant="auth" status={status} />;
  }
  return (
    <section className="admin-clubs__state" role="alert">
      <p>
        {detail && status === 404
          ? "클럽을 찾을 수 없습니다."
          : detail
            ? "클럽 상세를 불러오지 못했습니다."
            : "클럽 목록을 불러오지 못했습니다."}
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={revalidator.state !== "idle"}
        onClick={() => revalidator.revalidate()}
      >
        다시 시도
      </button>
      {detail ? (
        <Link to="/admin/clubs" className="btn btn-ghost btn-sm">
          ← 클럽 목록
        </Link>
      ) : null}
    </section>
  );
}

function routeErrorStatus(error: unknown): number {
  if (isRouteErrorResponse(error)) return error.status;
  if (isReadmatesApiError(error)) return error.status;
  return 500;
}
