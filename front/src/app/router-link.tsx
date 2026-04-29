import type { MouseEvent } from "react";
import {
  Link as RouterLink,
  useInRouterContext,
  useLocation,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import { rememberReadmatesListScroll, resetReadmatesNavigationScroll } from "@/src/app/route-continuity";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";

type ReadmatesLinkProps = RouterLinkProps & {
  resetScroll?: boolean;
  to: string;
};

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

function RouterAwareLink({ to, children, onClick, resetScroll = false, ...props }: ReadmatesLinkProps) {
  const location = useLocation();
  const resolvedTo = scopedAppLinkTarget(location.pathname, to);

  return (
    <RouterLink
      {...props}
      to={resolvedTo}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented && !isModifiedEvent(event)) {
          if (resetScroll) {
            resetReadmatesNavigationScroll();
          }

          rememberReadmatesListScroll(location.pathname, location.search, resolvedTo);
        }
      }}
    >
      {children}
    </RouterLink>
  );
}

export function Link({ to, children, resetScroll = false, state, ...props }: ReadmatesLinkProps) {
  const inRouter = useInRouterContext();

  if (!inRouter) {
    return (
      <a {...props} href={to}>
        {children}
      </a>
    );
  }

  return (
    <RouterAwareLink {...props} to={to} resetScroll={resetScroll} state={state}>
      {children}
    </RouterAwareLink>
  );
}
