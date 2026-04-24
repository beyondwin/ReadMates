import { MobileHeader } from "./mobile-header";

export function PublicMobileHeader({ authenticated }: { authenticated?: boolean }) {
  return <MobileHeader variant="guest" authenticated={authenticated} />;
}
