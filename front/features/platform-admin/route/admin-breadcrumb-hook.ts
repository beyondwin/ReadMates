import { createContext, useContext } from "react";

export type AdminBreadcrumbContextValue = {
  extra: string | null;
  setExtra: (value: string | null) => void;
};

export const AdminBreadcrumbContext = createContext<AdminBreadcrumbContextValue | null>(null);

export function useAdminBreadcrumbExtra() {
  const ctx = useContext(AdminBreadcrumbContext);
  if (!ctx) throw new Error("useAdminBreadcrumbExtra used outside AdminBreadcrumbProvider");
  return ctx;
}
