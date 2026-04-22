import { useParams } from "react-router-dom";
import { PasswordResetCard } from "@/features/auth/ui/password-reset-card";

export function ResetPasswordRoute() {
  const token = useParams().token ?? "";

  return <PasswordResetCard token={token} />;
}
