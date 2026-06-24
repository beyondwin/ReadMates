import { useParams } from "react-router-dom";
import { PasswordResetCard } from "@/features/auth/ui/password-reset-card";
import { PageMetadataHead } from "@/shared/ui/page-metadata-head";

export function ResetPasswordRoute() {
  const token = useParams().token ?? "";

  return (
    <>
      <PageMetadataHead
        metadata={{
          title: "비밀번호 경로 종료 | ReadMates",
          description: "ReadMates 비밀번호 로그인과 재설정 경로는 종료되었습니다. 기존 멤버는 Google 계정으로 계속 입장합니다.",
        }}
      />
      <PasswordResetCard token={token} />
    </>
  );
}
