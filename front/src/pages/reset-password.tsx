import { useParams } from "react-router-dom";
import { PasswordResetCard } from "@/features/auth/components/password-reset-card";

export default function ResetPasswordPage() {
  const token = useParams().token ?? "";

  return <PasswordResetCard token={token} />;
}
