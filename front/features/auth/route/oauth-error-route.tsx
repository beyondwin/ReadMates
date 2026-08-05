import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { oauthErrorViewModel } from "@/shared/auth/oauth-error";
import { recordFrontendRuntimeError } from "@/shared/observability/frontend-observability";
import { PageMetadataHead } from "@/shared/ui/page-metadata-head";
import { OAuthErrorPage } from "../ui/oauth-error-page";

export default function OAuthErrorRoute() {
  const [searchParams] = useSearchParams();
  const kindValue = searchParams.get("kind");
  const returnToValue = searchParams.get("returnTo");
  const view = useMemo(
    () => oauthErrorViewModel(kindValue, returnToValue),
    [kindValue, returnToValue],
  );

  useEffect(() => {
    recordFrontendRuntimeError({
      pathname: "/auth/error",
      errorKind: "render",
      errorCode: `OAUTH_NAVIGATION_${view.kind.toUpperCase()}`,
      severity: view.kind === "internal_error" || view.kind === "service_unavailable" ? "error" : "warn",
    });
  }, [view.kind]);

  return (
    <>
      <PageMetadataHead
        metadata={{
          title: `${view.heading.replace(/\.$/, "")} | ReadMates`,
          description: "ReadMates 로그인 요청을 마치지 못했습니다. 안전한 화면으로 돌아가 다시 시작할 수 있습니다.",
        }}
      />
      <OAuthErrorPage view={view} />
    </>
  );
}
