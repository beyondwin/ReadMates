import type { ButtonHTMLAttributes } from "react";
import { logout } from "@/features/auth/api/auth-api";
import { LogoutButton as LogoutButtonUi } from "@/features/auth/ui/logout-button";

type LogoutButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  redirectHref?: string;
  onLoggedOut?: () => void;
};

export function LogoutButton({ onLoggedOut, ...props }: LogoutButtonProps) {
  const logoutAndClearAuth = async () => {
    const response = await logout();
    if (response.ok || response.status === 401) {
      onLoggedOut?.();
    }
    return response;
  };

  return <LogoutButtonUi {...props} onLogout={logoutAndClearAuth} />;
}
