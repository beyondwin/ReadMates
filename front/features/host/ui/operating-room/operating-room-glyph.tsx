export type OperatingRoomGlyphName =
  | "calendar"
  | "person"
  | "people"
  | "chat"
  | "pin"
  | "info"
  | "edit"
  | "history"
  | "eye"
  | "list"
  | "notes";

export function OperatingRoomGlyph({ name }: { name: OperatingRoomGlyphName }) {
  const common = {
    className: "rm-operating-room-glyph",
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    "data-icon": name,
  };

  switch (name) {
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
      );
    case "person":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c1-4.2 3.5-6.5 7-6.5s6 2.3 7 6.5" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20c.8-3.6 3-5.5 5.5-5.5s4.7 1.9 5.5 5.5" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M16 14.6c2.2.4 3.8 2.1 4.5 5.4" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4 4v-4H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5h.01" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
          <path d="M13.5 7.5l3 3" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5M9 4.5 12 3l2.2 1.8" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      );
    case "notes":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
  }
}
