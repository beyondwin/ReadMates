"use client";

export function ReadmatesBrandMark() {
  return (
    <span
      aria-hidden
      className="rm-brand-mark"
      style={{
        width: "30px",
        height: "30px",
        borderRadius: "6px",
        background: "var(--accent)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 4 L3 5.5 L3 16.5 L10 15 Z" fill="var(--paper-50)" />
        <path d="M10 4 L17 5.5 L17 16.5 L10 15 Z" fill="var(--paper-50)" fillOpacity="0.42" />
      </svg>
    </span>
  );
}
