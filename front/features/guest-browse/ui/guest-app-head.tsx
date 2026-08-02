import { useEffect } from "react";
import type { ClubAppAudience } from "@/features/guest-browse/model/club-app-audience";

const clubAppRobotsSelector = 'meta[name="robots"][data-readmates-club-app="true"]';
let clubAppMetaConsumers = 0;
let clubAppMeta: HTMLMetaElement | null = null;

export function GuestAppHead({ audience }: { audience: ClubAppAudience }) {
  useEffect(() => {
    clubAppMetaConsumers += 1;
    if (!clubAppMeta) {
      const existing = document.head.querySelector<HTMLMetaElement>(clubAppRobotsSelector);
      clubAppMeta = existing ?? document.createElement("meta");
      clubAppMeta.name = "robots";
      clubAppMeta.content = "noindex";
      clubAppMeta.dataset.readmatesClubApp = "true";
      if (!existing) {
        document.head.append(clubAppMeta);
      }
    }

    return () => {
      clubAppMetaConsumers -= 1;
      if (clubAppMetaConsumers === 0) {
        clubAppMeta?.remove();
        clubAppMeta = null;
      }
    };
  }, [audience]);

  return null;
}
