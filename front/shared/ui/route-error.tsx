import { useEffect } from "react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { isReadmatesApiError } from "@/shared/api/errors";
import { recordFrontendRuntimeError } from "@/shared/observability/frontend-observability";
import { PageMetadataHead, type PageMetadata } from "@/shared/ui/page-metadata-head";

export type RouteErrorVariant = "public" | "member" | "host" | "auth";

type RouteErrorView = {
  eyebrow: string;
  heading: string;
  body: string;
  actionHref: string;
  actionLabel: string;
};

function fallbackPathForVariant(variant: RouteErrorVariant) {
  switch (variant) {
    case "host":
      return "/app/host";
    case "member":
      return "/app";
    case "auth":
      return "/login";
    case "public":
      return "/";
  }
}

function actionLabelForVariant(variant: RouteErrorVariant) {
  switch (variant) {
    case "host":
      return "호스트 홈";
    case "member":
      return "내 클럽으로";
    case "auth":
      return "로그인";
    case "public":
      return "공개 홈";
  }
}

function classifyStatus(status: number, variant: RouteErrorVariant): RouteErrorView {
  const actionHref = fallbackPathForVariant(variant);
  const actionLabel = actionLabelForVariant(variant);

  if (status === 403) {
    return {
      eyebrow: "권한 필요",
      heading: "접근할 수 없습니다.",
      body: "현재 계정 또는 클럽 권한으로는 이 화면을 열 수 없습니다.",
      actionHref,
      actionLabel,
    };
  }

  if (status === 404) {
    return {
      eyebrow: "찾을 수 없음",
      heading: "페이지를 찾을 수 없습니다.",
      body: "주소가 바뀌었거나 현재 클럽에서 열 수 없는 기록입니다.",
      actionHref,
      actionLabel,
    };
  }

  if (status === 409) {
    return {
      eyebrow: "상태 변경",
      heading: "지금은 처리할 수 없습니다.",
      body: "화면의 상태가 바뀌었을 수 있습니다. 새로고침한 뒤 다시 시도해 주세요.",
      actionHref,
      actionLabel,
    };
  }

  if (status === 410) {
    return {
      eyebrow: "사용 종료",
      heading: "더 이상 사용할 수 없는 경로입니다.",
      body: "현재 지원되는 화면으로 이동해 다시 시작해 주세요.",
      actionHref,
      actionLabel,
    };
  }

  return {
    eyebrow: "불러오기 실패",
    heading: "페이지를 불러오지 못했습니다.",
    body: "네트워크 연결 또는 서비스 상태를 확인한 뒤 새로고침해 주세요.",
    actionHref,
    actionLabel,
  };
}

function statusFromRouteError(error: unknown) {
  if (isReadmatesApiError(error)) {
    return error.status;
  }

  if (isRouteErrorResponse(error)) {
    return error.status;
  }

  return 500;
}

function metadataForRouteError(variant: RouteErrorVariant, status: number): PageMetadata | null {
  if (variant === "public" && status === 404) {
    return {
      title: "페이지를 찾을 수 없습니다 | ReadMates",
      description: "요청한 ReadMates 공개 페이지를 찾을 수 없습니다. 공개 홈에서 클럽 소개와 기록을 다시 확인해 주세요.",
    };
  }

  return null;
}

export function RouteErrorPage({ variant, status }: { variant: RouteErrorVariant; status: number }) {
  const view = classifyStatus(status, variant);
  const metadata = metadataForRouteError(variant, status);

  return (
    <>
      {metadata ? <PageMetadataHead metadata={metadata} /> : null}
      <main className="container">
        <section className="surface" style={{ margin: "48px 0", padding: 28 }}>
          <p className="eyebrow">{view.eyebrow}</p>
          <h1 className="h2 editorial" style={{ margin: "8px 0 0" }}>
            {view.heading}
          </h1>
          <p className="body" style={{ color: "var(--text-2)" }}>
            {view.body}
          </p>
          <div className="auth-card__actions auth-card__actions--primary">
            <Link className="btn btn-primary" to={view.actionHref}>
              {view.actionLabel}
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

export function RouteErrorBoundary({ variant }: { variant: RouteErrorVariant }) {
  const error = useRouteError();
  const status = statusFromRouteError(error);

  useEffect(() => {
    recordFrontendRuntimeError({
      errorKind: "render",
      errorCode: status >= 500 ? "REACT_ROUTE_ERROR" : "ROUTE_ERROR_RESPONSE",
      severity: status >= 500 ? "error" : "warn",
      message: error instanceof Error ? error.message : undefined,
    });
  }, [error, status]);

  return <RouteErrorPage variant={variant} status={status} />;
}

export function NotFoundRoute({ variant }: { variant: RouteErrorVariant }) {
  return <RouteErrorPage variant={variant} status={404} />;
}
