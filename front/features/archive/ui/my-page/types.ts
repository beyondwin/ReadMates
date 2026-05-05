import type { CSSProperties, ReactNode } from "react";
import type { MyPageProfile } from "@/features/archive/model/archive-model";

export type ProfileUpdateResult = Pick<MyPageProfile, "displayName" | "accountName">;

export type LogoutControlComponent = (props: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) => ReactNode;
