import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AdminShellStatus = { tone: "ok" | "warn" | "danger" | "neutral"; text: string; aside?: string | null };

type Ctx = { value: AdminShellStatus | null; set: (next: AdminShellStatus | null) => void };
const AdminShellStatusContext = createContext<Ctx | null>(null);

export function AdminShellStatusProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState<AdminShellStatus | null>(null);
  const ctx = useMemo(() => ({ value, set }), [value]);
  return <AdminShellStatusContext.Provider value={ctx}>{children}</AdminShellStatusContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- route status hook shares the provider module
export function useAdminShellStatus(status: AdminShellStatus | null) {
  const ctx = useContext(AdminShellStatusContext);
  const set = ctx?.set;
  const tone = status?.tone;
  const text = status?.text;
  const aside = status?.aside ?? null;
  useEffect(() => {
    if (!set) return;
    set(text && tone ? { tone, text, aside } : null);
    return () => set(null);
  }, [set, tone, text, aside]);
}

// eslint-disable-next-line react-refresh/only-export-components -- shell reader shares the provider module
export function useAdminShellStatusValue(): AdminShellStatus | null {
  return useContext(AdminShellStatusContext)?.value ?? null;
}
