import type { ComponentProps } from "react";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { leaveMembership } from "@/features/archive/api/archive-api";
import MyPageUi, { type LogoutControlComponent } from "@/features/archive/ui/my-page";

type MyPageUiProps = ComponentProps<typeof MyPageUi>;
type MyPageCompatProps = Omit<MyPageUiProps, "LogoutButtonComponent" | "onLeaveMembership"> & {
  LogoutButtonComponent?: LogoutControlComponent;
  onLeaveMembership?: () => Promise<void>;
};

async function defaultLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

export default function MyPage({
  LogoutButtonComponent = LogoutButton,
  onLeaveMembership = defaultLeaveMembership,
  ...props
}: MyPageCompatProps) {
  return (
    <MyPageUi
      {...props}
      LogoutButtonComponent={LogoutButtonComponent}
      onLeaveMembership={onLeaveMembership}
    />
  );
}
