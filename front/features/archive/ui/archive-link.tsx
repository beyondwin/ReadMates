import type { MouseEvent, ReactNode } from "react";
import {
  Link as RouterLink,
  useInRouterContext,
  useLocation,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import { rememberReadmatesArchiveScroll } from "@/features/archive/ui/archive-route-continuity";

type ArchiveLinkProps = Omit<RouterLinkProps, "to"> & {
  to: string;
  children: ReactNode;
};

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

function RouterAwareArchiveLink({ to, children, onClick, ...props }: ArchiveLinkProps) {
  const location = useLocation();

  return (
    <RouterLink
      {...props}
      to={to}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented && !isModifiedEvent(event)) {
          rememberReadmatesArchiveScroll(location.pathname, location.search, to);
        }
      }}
    >
      {children}
    </RouterLink>
  );
}

export function Link({ to, children, state, ...props }: ArchiveLinkProps) {
  const inRouter = useInRouterContext();

  if (!inRouter) {
    return (
      <a {...props} href={to}>
        {children}
      </a>
    );
  }

  return (
    <RouterAwareArchiveLink {...props} to={to} state={state}>
      {children}
    </RouterAwareArchiveLink>
  );
}
