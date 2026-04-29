import {
  Link as RouterLink,
  useInRouterContext,
  useLocation,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";

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
    <RouterAwareAuthLink {...props} to={to} state={state}>
      {children}
    </RouterAwareAuthLink>
  );
}

function RouterAwareAuthLink({ to, children, state, ...props }: AuthLinkProps) {
  const location = useLocation();

  return (
    <RouterLink {...props} to={scopedAppLinkTarget(location.pathname, to)} state={state}>
      {children}
    </RouterLink>
  );
}
