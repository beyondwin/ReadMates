import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { hostAuthorityLossMessage } from "@/features/host/model/host-authority-loss";
import { consumeHostAuthorityNavigation } from "@/features/host/model/host-authority-navigation";

export function HostAuthorityLossGuestHandoff() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const code = consumeHostAuthorityNavigation(location.pathname, location.state);
      setAnnouncement(code ? hostAuthorityLossMessage(code) : "");
      if (!code) return;

      const heading = document.querySelector<HTMLElement>("main h1, h1");
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) {
        heading.setAttribute("tabindex", "-1");
      }
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.state]);

  return announcement ? (
    <span className="rm-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  ) : null;
}
