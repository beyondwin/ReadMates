"use client";

import { type ButtonHTMLAttributes, useState } from "react";

type LogoutButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  redirectHref?: string;
  onLogout: () => Promise<Response>;
};

export function LogoutButton({
  children = "로그아웃",
  disabled = false,
  redirectHref = "/login",
  onLogout,
  ...buttonProps
}: LogoutButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitLogout = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await onLogout();
      if (response.ok || response.status === 401) {
        globalThis.location.href = redirectHref;
        return;
      }

      setError("로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      setError("로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button {...buttonProps} type="button" disabled={disabled || isSubmitting} onClick={() => void submitLogout()}>
        {isSubmitting ? "로그아웃 중" : children}
      </button>
      {error ? (
        <p className="small" role="alert" style={{ margin: "10px 0 0", color: "var(--danger)", textAlign: "center" }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
