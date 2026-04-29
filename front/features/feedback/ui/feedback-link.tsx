import {
  Link as RouterLink,
  useInRouterContext,
  useLocation,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";

type FeedbackLinkProps = RouterLinkProps & {
  to: string;
};

export function Link({ to, children, state, ...props }: FeedbackLinkProps) {
  const inRouter = useInRouterContext();

  if (!inRouter) {
    return (
      <a {...props} href={to}>
        {children}
      </a>
    );
  }

  return <RouterAwareFeedbackLink {...props} to={to} state={state}>{children}</RouterAwareFeedbackLink>;
}

function RouterAwareFeedbackLink({ to, children, state, ...props }: FeedbackLinkProps) {
  const location = useLocation();

  return (
    <RouterLink {...props} to={scopedAppLinkTarget(location.pathname, to)} state={state}>
      {children}
    </RouterLink>
  );
}
