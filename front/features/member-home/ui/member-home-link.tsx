import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";

export type MemberHomeLinkComponentProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children?: ReactNode;
};

export type MemberHomeLinkComponent = ComponentType<MemberHomeLinkComponentProps>;

type MemberHomeLinkProps = MemberHomeLinkComponentProps & {
  LinkComponent?: MemberHomeLinkComponent;
};

export function PlainMemberHomeLink({ to, children, ...props }: MemberHomeLinkComponentProps) {
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

export function Link({ LinkComponent = PlainMemberHomeLink, to, children, ...props }: MemberHomeLinkProps) {
  return (
    <LinkComponent {...props} to={to}>
      {children}
    </LinkComponent>
  );
}
