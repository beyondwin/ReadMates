import { MobileHeader } from "./mobile-header";

export function PublicMobileHeader({ authenticated, publicBasePath }: { authenticated?: boolean; publicBasePath?: string }) {
  return <MobileHeader variant="guest" authenticated={authenticated} publicBasePath={publicBasePath} />;
}
