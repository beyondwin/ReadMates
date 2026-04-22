import type { MouseEvent } from "react";
import {
  Link as RouterLink,
  useInRouterContext,
  useLocation,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import { rememberReadmatesPublicRecordsScroll } from "@/features/public/ui/public-route-continuity";

type PublicLinkProps = RouterLinkProps & {
  to: string;
};

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

function RouterAwarePublicLink({ to, children, onClick, ...props }: PublicLinkProps) {
  const location = useLocation();

  return (
    <RouterLink
      {...props}
      to={to}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented && !isModifiedEvent(event)) {
          rememberReadmatesPublicRecordsScroll(location.pathname, location.search, to);
        }
      }}
    >
      {children}
    </RouterLink>
  );
}

export function Link({ to, children, state, ...props }: PublicLinkProps) {
  const inRouter = useInRouterContext();

  if (!inRouter) {
    return (
      <a {...props} href={to}>
        {children}
      </a>
    );
  }

  return (
    <RouterAwarePublicLink {...props} to={to} state={state}>
      {children}
    </RouterAwarePublicLink>
  );
}
