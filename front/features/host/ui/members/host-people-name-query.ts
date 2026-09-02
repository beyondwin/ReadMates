import { createContext, useContext } from "react";

export const HostPeopleNameQueryContext = createContext("");

export function useHostPeopleNameQuery(): string {
  return useContext(HostPeopleNameQueryContext);
}

export function matchesHostPeopleNameQuery(displayName: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  if (needle.length === 0) return true;
  return displayName.toLocaleLowerCase("ko-KR").includes(needle);
}
