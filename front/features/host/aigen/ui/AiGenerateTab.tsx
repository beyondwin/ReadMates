import type { ReactNode } from "react";

export type AiGenerateTabProps = {
  children: ReactNode;
};

/** Presentation slot; route owners inject the registered AI workflow. */
export function AiGenerateTab({ children }: AiGenerateTabProps) {
  return <>{children}</>;
}
