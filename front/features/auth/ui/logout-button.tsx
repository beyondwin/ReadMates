
import { type ButtonHTMLAttributes } from "react";

type LogoutButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  pending: boolean;
  error: string | null;
  onLogout: () => void;
};

export function LogoutButton({
  children = "로그아웃",
  disabled = false,
  pending,
  error,
  onLogout,
  ...buttonProps
}: LogoutButtonProps) {
  return (
    <>
      <button {...buttonProps} type="button" disabled={disabled || pending} onClick={onLogout}>
        {pending ? "로그아웃 중" : children}
      </button>
      {error ? (
        <p className="small" role="alert" style={{ margin: "10px 0 0", color: "var(--danger)", textAlign: "center" }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
