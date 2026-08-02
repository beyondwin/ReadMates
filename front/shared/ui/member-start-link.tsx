import { useState, type MouseEvent, type ReactNode } from "react";
import { loginPathForReturnTo } from "@/shared/auth/login-return";
import { oauthJoinHref } from "@/shared/auth/oauth-join-intent";

export function MemberStartLink({
  returnTo,
  clubSlug,
  children,
  className,
  fetcher = fetch,
  navigate = (href) => globalThis.location.assign(href),
  chooseAccount = false,
}: {
  returnTo: string;
  clubSlug: string;
  children: ReactNode;
  className?: string;
  fetcher?: typeof fetch;
  navigate?: (href: string) => void;
  chooseAccount?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const start = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      navigate(await oauthJoinHref(returnTo, clubSlug, fetcher, chooseAccount));
    } catch {
      setError(true);
      setPending(false);
    }
  };

  return (
    <>
      <a
        className={className}
        href={loginPathForReturnTo(returnTo)}
        onClick={(event) => void start(event)}
        aria-disabled={pending ? "true" : "false"}
      >
        {pending ? "연결 중" : children}
      </a>
      {error ? <span className="small auth-card__error" role="alert">멤버 시작 요청을 만들지 못했습니다. 다시 시도해 주세요.</span> : null}
    </>
  );
}
