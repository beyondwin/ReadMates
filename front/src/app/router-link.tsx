import { Link as RouterLink, useInRouterContext, type LinkProps as RouterLinkProps } from "react-router-dom";

type ReadmatesLinkProps = RouterLinkProps & {
  to: string;
};

export function Link({ to, children, ...props }: ReadmatesLinkProps) {
  const inRouter = useInRouterContext();

  if (!inRouter) {
    return (
      <a {...props} href={to}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink {...props} to={to}>
      {children}
    </RouterLink>
  );
}
