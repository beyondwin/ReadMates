import type { MouseEvent } from "react";
import {
  Link as RouterLink,
  useInRouterContext,
  useLocation,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import { rememberReadmatesListScroll } from "@/src/app/route-continuity";

type ReadmatesLinkProps = RouterLinkProps & {
  to: string;
};

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

function RouterAwareLink({ to, children, onClick, ...props }: ReadmatesLinkProps) {
  const location = useLocation();

  return (
    <RouterLink
      {...props}
      to={to}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented && !isModifiedEvent(event)) {
          rememberReadmatesListScroll(location.pathname, location.search, to);
        }
      }}
    >
      {children}
    </RouterLink>
  );
}

export function Link({ to, children, state, ...props }: ReadmatesLinkProps) {
  const inRouter = useInRouterContext();

  if (!inRouter) {
    return (
      <a {...props} href={to}>
        {children}
      </a>
    );
  }

  return <RouterAwareLink {...props} to={to} state={state}>{children}</RouterAwareLink>;
}
