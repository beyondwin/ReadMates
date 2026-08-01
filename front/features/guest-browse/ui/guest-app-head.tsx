import { useEffect } from "react";
import type { ClubAppAudience } from "@/features/guest-browse/model/club-app-audience";

const guestRobotsSelector = 'meta[name="robots"][data-readmates-guest-app="true"]';

export function GuestAppHead({ audience }: { audience: ClubAppAudience }) {

  useEffect(() => {
    if (audience !== "GUEST") {
      return;
    }

    const existing = document.head.querySelector<HTMLMetaElement>(guestRobotsSelector);
    const meta = existing ?? document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    meta.dataset.readmatesGuestApp = "true";
    if (!existing) {
      document.head.append(meta);
    }

    return () => {
      meta.remove();
    };
  }, [audience]);

  return null;
}
