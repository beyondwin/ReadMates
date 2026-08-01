import { useEffect } from "react";
import type { ClubAppAudience } from "@/features/guest-browse/model/club-app-audience";

const guestRobotsSelector = 'meta[name="robots"][data-readmates-guest-app="true"]';
let guestMetaConsumers = 0;
let guestMeta: HTMLMetaElement | null = null;

export function GuestAppHead({ audience }: { audience: ClubAppAudience }) {
  useEffect(() => {
    if (audience !== "GUEST") {
      return;
    }

    guestMetaConsumers += 1;
    if (!guestMeta) {
      const existing = document.head.querySelector<HTMLMetaElement>(guestRobotsSelector);
      guestMeta = existing ?? document.createElement("meta");
      guestMeta.name = "robots";
      guestMeta.content = "noindex";
      guestMeta.dataset.readmatesGuestApp = "true";
      if (!existing) {
        document.head.append(guestMeta);
      }
    }

    return () => {
      guestMetaConsumers -= 1;
      if (guestMetaConsumers === 0) {
        guestMeta?.remove();
        guestMeta = null;
      }
    };
  }, [audience]);

  return null;
}
