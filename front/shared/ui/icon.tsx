import type { SVGProps } from "react";

export type ReadmatesIconName =
  | "check-circle" | "check-circle-filled" | "alert-circle" | "alert-circle-filled" | "x-circle" | "question-circle" | "minus-circle" | "info"
  | "calendar" | "clock" | "pin" | "people" | "person" | "person-plus" | "person-circle" | "eye" | "bell" | "mail" | "link" | "document" | "notes" | "shield-check" | "search" | "list" | "export" | "history" | "edit" | "logout" | "home" | "more"
  | "chevron-right" | "chevron-left" | "chevron-down" | "arrow-left" | "arrow-right";

export type ReadmatesIconTone = "neutral" | "warn" | "ok" | "info" | "danger" | "accent";

type IconProps = {
  name: ReadmatesIconName;
  size?: 16 | 20 | 24;
  strokeWidth?: number;
  className?: string;
  title?: string;
};

// Stroke paths on a 24×24 grid. Keep every path here; no other file defines icon geometry.
const STROKE_PATHS: Record<Exclude<ReadmatesIconName, "check-circle-filled" | "alert-circle-filled">, string[]> = {
  "check-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8 12.5 11 15.5 16.5 9"],
  "alert-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7.5v5.5", "M12 16.5h.01"],
  "x-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M9 9l6 6M15 9l-6 6"],
  "question-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7", "M12 17h.01"],
  "minus-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8 12h8"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v6", "M12 7.5h.01"],
  calendar: ["M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M8 3v4M16 3v4M3 10h18"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7.5V12l3 2"],
  pin: ["M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z", "M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z"],
  people: ["M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M3.5 20c.8-3.6 3-5.5 5.5-5.5s4.7 1.9 5.5 5.5", "M17 11.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z", "M16 14.6c2.2.4 3.8 2.1 4.5 5.4"],
  person: ["M12 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M5 20c1-4.2 3.5-6.5 7-6.5s6 2.3 7 6.5"],
  "person-plus": ["M10 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M3 20c1-4.2 3.5-6.5 7-6.5 1.4 0 2.6.4 3.6 1", "M18 14v6M15 17h6"],
  "person-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M6.5 18.5c1.2-2.6 3.1-3.9 5.5-3.9s4.3 1.3 5.5 3.9"],
  eye: ["M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z", "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  bell: ["M6 10a6 6 0 0 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6z", "M9.5 19a2.7 2.7 0 0 0 5 0"],
  mail: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "m3.5 7.5 8.5 6 8.5-6"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"],
  document: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z", "M14 2v4a2 2 0 0 0 2 2h4", "M8 13h8M8 17h6"],
  notes: ["M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M8 8h8M8 12h8M8 16h5"],
  "shield-check": ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "m9 12 2 2 4-4"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "m20 20-3.5-3.5"],
  list: ["M8 6h13M8 12h13M8 18h13", "M4 6h.01M4 12h.01M4 18h.01"],
  export: ["M12 15V4", "m7.5 8.5 4.5-4.5 4.5 4.5", "M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"],
  history: ["M12 21a8 8 0 1 0-7.5-10.9", "M4 4v5h5", "M12 8v4.5l3 1.8"],
  edit: ["M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z", "m13.5 7.5 3 3"],
  logout: ["M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10", "M10 12h9", "m16 8.5 3.5 3.5-3.5 3.5"],
  home: ["M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-7H9v7H5a1 1 0 0 1-1-1z"],
  more: ["M6 12h.01M12 12h.01M18 12h.01"],
  "chevron-right": ["m9 6 6 6-6 6"],
  "chevron-left": ["m15 6-6 6 6 6"],
  "chevron-down": ["m6 9 6 6 6-6"],
  "arrow-left": ["M19 12H5", "m11 6-6 6 6 6"],
  "arrow-right": ["M5 12h14", "m13 6 6 6-6 6"],
};

export function ReadmatesIcon({ name, size = 20, strokeWidth = 1.75, className, title }: IconProps) {
  const common: SVGProps<SVGSVGElement> = {
    className: className ? `rm-icon ${className}` : "rm-icon",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "data-icon": name,
    focusable: "false",
    ...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true }),
  };

  if (name === "check-circle-filled" || name === "alert-circle-filled") {
    return (
      <svg {...common} fill="none">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        {name === "check-circle-filled" ? (
          <path d="M7 12.2 10.4 15.5 17 8.5" fill="none" stroke="var(--rm-icon-contrast, #fff)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M12 7v6M12 16.5h.01" fill="none" stroke="var(--rm-icon-contrast, #fff)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    );
  }

  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {STROKE_PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export function ReadmatesIconBadge({
  name, tone, size = 32, className,
}: { name: ReadmatesIconName; tone: ReadmatesIconTone; size?: 32 | 40; className?: string }) {
  return (
    <span className={className ? `rm-icon-badge ${className}` : "rm-icon-badge"} data-tone={tone} data-size={size} aria-hidden="true">
      <ReadmatesIcon name={name} size={size === 40 ? 20 : 16} />
    </span>
  );
}
