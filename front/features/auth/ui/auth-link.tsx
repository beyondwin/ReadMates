import { Link as RouterLink, useInRouterContext, type LinkProps as RouterLinkProps } from "react-router-dom";

type AuthLinkProps = RouterLinkProps & {
  to: string;
};

export function Link({ to, children, state, ...props }: AuthLinkProps) {
  const inRouter = useInRouterContext();

  if (!inRouter) {
    return (
      <a {...props} href={to}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink {...props} to={to} state={state}>
      {children}
    </RouterLink>
  );
}
