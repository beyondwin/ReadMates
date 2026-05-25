import { useMemo, useState, type ReactNode } from "react";
import { AdminBreadcrumbContext } from "./admin-breadcrumb-hook";

export function AdminBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [extra, setExtra] = useState<string | null>(null);
  const value = useMemo(() => ({ extra, setExtra }), [extra]);
  return <AdminBreadcrumbContext.Provider value={value}>{children}</AdminBreadcrumbContext.Provider>;
}
