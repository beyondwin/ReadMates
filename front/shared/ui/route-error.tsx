import { useEffect } from "react";
import { isRouteErrorResponse, useLocation, useRevalidator, useRouteError } from "react-router";
import { isReadmatesApiError } from "@/shared/api/errors";
import { recordFrontendRuntimeError } from "@/shared/observability/frontend-observability";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { ErrorExperience, type ErrorExperienceAction } from "@/shared/ui/error-experience";
import { PageMetadataHead, type PageMetadata } from "@/shared/ui/page-metadata-head";

export type RouteErrorVariant = "public" | "member" | "host" | "auth";

type RouteErrorView = {
  eyebrow: string;
  heading: string;
  body: string;
  reassurance?: string;
  actionHref: string;
  actionLabel: string;
  helpText?: string;
};

type RouteErrorPageProps = {
  variant: RouteErrorVariant;
  status: number;
  retryState?: "idle" | "loading";
  onRetry?: () => void;
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

function isRetryablePublicStatus(status: number) {
  return status === 429 || status >= 500;
}

function classifyStatus(
  status: number,
  variant: RouteErrorVariant,
  canRetryPublicLoad: boolean,
): RouteErrorView {
  const actionHref = fallbackPathForVariant(variant);
  const actionLabel = actionLabelForVariant(variant);

  if (status === 401) {
    return {
      eyebrow: "로그인 필요",
      heading: "로그인을 다시 시작해 주세요.",
      body: "인증 흐름이 끝났거나 현재 세션을 확인할 수 없습니다.",
      reassurance: "기존 기록과 입력한 내용은 그대로 유지됩니다.",
      actionHref,
      actionLabel,
    };
  }

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

  if (status === 429) {
    const isPublic = variant === "public";

    return {
      eyebrow: "잠시 후 다시",
      heading: "요청이 잠시 제한되었습니다.",
      body:
        isPublic && !canRetryPublicLoad
          ? "요청이 잠시 많습니다. 공개 기록에서 다른 기록을 확인해 주세요."
          : "요청이 잠시 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.",
      reassurance: isPublic ? "입력하거나 변경한 내용은 없습니다." : undefined,
      actionHref,
      actionLabel,
    };
  }

  if (status === 500 || status === 501) {
    return {
      eyebrow: "서비스 오류",
      heading: "요청을 마치지 못했습니다.",
      body: "서비스 내부에서 문제가 발생했습니다. 안전한 화면으로 돌아가 다시 시작해 주세요.",
      reassurance: "입력하거나 변경한 내용은 없습니다.",
      actionHref,
      actionLabel,
    };
  }

  if (status >= 502 && status <= 599) {
    return {
      eyebrow: "연결 지연",
      heading: "서비스 연결이 원활하지 않습니다.",
      body: "일시적인 연결 문제일 수 있습니다. 잠시 후 안전한 화면에서 다시 시도해 주세요.",
      reassurance: "입력하거나 변경한 내용은 없습니다.",
      actionHref,
      actionLabel,
    };
  }

  return {
    eyebrow: "불러오기 실패",
    heading: "페이지를 불러오지 못했습니다.",
    body:
      variant === "public"
        ? canRetryPublicLoad
          ? "네트워크 연결을 확인한 뒤 다시 시도하거나 공개 기록으로 이동해 주세요."
          : "페이지를 불러오지 못했습니다. 공개 기록에서 다른 기록을 확인해 주세요."
        : "네트워크 연결 또는 서비스 상태를 확인한 뒤 새로고침해 주세요.",
    reassurance: variant === "public" ? "입력하거나 변경한 내용은 없습니다." : undefined,
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

function publicRecordsTarget(pathname: string) {
  const clubMatch = /^\/clubs\/([^/]+)(?:\/|$)/.exec(pathname);
  return clubMatch ? `/clubs/${clubMatch[1]}/records` : "/records";
}

export function RouteErrorPage({
  variant,
  status,
  retryState = "idle",
  onRetry,
}: RouteErrorPageProps) {
  const location = useLocation();
  const canRetryPublicLoad =
    variant === "public" && isRetryablePublicStatus(status) && typeof onRetry === "function";
  const view = classifyStatus(status, variant, canRetryPublicLoad);
  const metadata = metadataForRouteError(variant, status);
  const actionHref = scopedAppLinkTarget(location.pathname, view.actionHref);
  const primaryAction: ErrorExperienceAction = canRetryPublicLoad
    ? {
        label: retryState === "loading" ? "다시 불러오는 중" : "다시 시도",
        disabled: retryState === "loading",
        onClick: onRetry,
      }
    : { href: actionHref, label: view.actionLabel };
  const secondaryAction: ErrorExperienceAction | undefined =
    variant === "public"
      ? { href: publicRecordsTarget(location.pathname), label: "공개 기록으로 이동" }
      : undefined;

  return (
    <>
      {metadata ? <PageMetadataHead metadata={metadata} /> : null}
      <ErrorExperience
        variant={variant}
        eyebrow={view.eyebrow}
        heading={view.heading}
        body={view.body}
        reassurance={view.reassurance}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        helpText={view.helpText}
      />
    </>
  );
}

export function RouteErrorBoundary({ variant }: { variant: RouteErrorVariant }) {
  const error = useRouteError();
  const status = statusFromRouteError(error);
  const revalidator = useRevalidator();

  useEffect(() => {
    recordFrontendRuntimeError({
      errorKind: "render",
      errorCode: status >= 500 ? "REACT_ROUTE_ERROR" : "ROUTE_ERROR_RESPONSE",
      severity: status >= 500 ? "error" : "warn",
      message: error instanceof Error ? error.message : undefined,
    });
  }, [error, status]);

  return (
    <RouteErrorPage
      variant={variant}
      status={status}
      retryState={revalidator.state === "idle" ? "idle" : "loading"}
      onRetry={revalidator.revalidate}
    />
  );
}

export function NotFoundRoute({ variant }: { variant: RouteErrorVariant }) {
  return <RouteErrorPage variant={variant} status={404} />;
}
