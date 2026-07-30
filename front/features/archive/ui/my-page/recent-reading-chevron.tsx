export function RecentReadingChevron(
  { className }: { className?: string },
): JSX.Element {
  return (
    <svg
      className={[
        "rm-recent-reading-chevron",
        className,
      ].filter(Boolean).join(" ")}
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
