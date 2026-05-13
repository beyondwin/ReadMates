import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useInRouterContext, useLocation } from "react-router-dom";
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";

type HostSessionEditorLinkProps = {
  to: string;
  state?: ReadmatesReturnState;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
};

export type HostSessionEditorLinkComponent = ComponentType<HostSessionEditorLinkProps>;

function RouterScopedDefaultLink({ to, state: _state, children, ...props }: HostSessionEditorLinkProps) {
  void _state;
  const location = useLocation();

  return (
    <a {...props} href={scopedAppLinkTarget(location.pathname, to)}>
      {children}
    </a>
  );
}

export function DefaultLinkComponent(props: HostSessionEditorLinkProps) {
  const inRouter = useInRouterContext();

  if (inRouter) {
    return <RouterScopedDefaultLink {...props} />;
  }

  const { to, state: _state, children, ...anchorProps } = props;
  void _state;

  return (
    <a {...anchorProps} href={scopedAppLinkTarget(globalThis.location.pathname, to)}>
      {children}
    </a>
  );
}
