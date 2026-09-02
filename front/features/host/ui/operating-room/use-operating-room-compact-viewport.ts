import { useEffect, useState } from "react";

export const OPERATING_ROOM_COMPACT_VIEWPORT_QUERY = "(max-width: 767px)";

function readCompactViewport() {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(OPERATING_ROOM_COMPACT_VIEWPORT_QUERY).matches;
}

export function useOperatingRoomCompactViewport() {
  const [compact, setCompact] = useState(readCompactViewport);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(OPERATING_ROOM_COMPACT_VIEWPORT_QUERY);
    const onChange = () => setCompact(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return compact;
}
