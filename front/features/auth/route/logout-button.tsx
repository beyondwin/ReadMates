import type { ButtonHTMLAttributes } from "react";
import { logout } from "@/features/auth/api/auth-api";
import { LogoutButton as LogoutButtonUi } from "@/features/auth/ui/logout-button";

type LogoutButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  redirectHref?: string;
};

export function LogoutButton(props: LogoutButtonProps) {
  return <LogoutButtonUi {...props} onLogout={logout} />;
}
