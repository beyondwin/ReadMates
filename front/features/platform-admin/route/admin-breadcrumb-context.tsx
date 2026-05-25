import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type AdminBreadcrumbContextValue = {
  extra: string | null;
  setExtra: (value: string | null) => void;
};

const AdminBreadcrumbContext = createContext<AdminBreadcrumbContextValue | null>(null);

export function AdminBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [extra, setExtra] = useState<string | null>(null);
  const value = useMemo(() => ({ extra, setExtra }), [extra]);
  return <AdminBreadcrumbContext.Provider value={value}>{children}</AdminBreadcrumbContext.Provider>;
}

export function useAdminBreadcrumbExtra() {
  const ctx = useContext(AdminBreadcrumbContext);
  if (!ctx) throw new Error("useAdminBreadcrumbExtra used outside AdminBreadcrumbProvider");
  return ctx;
}
