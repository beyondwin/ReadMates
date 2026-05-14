import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type PropsWithChildren } from "react";
import { createReadmatesQueryClient } from "./query-client";

export function ReadmatesQueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(createReadmatesQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
