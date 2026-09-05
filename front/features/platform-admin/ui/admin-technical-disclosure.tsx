import type { ReactNode } from "react";

export type AdminTechnicalDisclosureItem = Readonly<{
  label: string;
  value: string | null | undefined;
}>;

export function AdminTechnicalDisclosure({
  items,
  summary = "기술 정보",
  children,
}: {
  items: readonly AdminTechnicalDisclosureItem[];
  summary?: string;
  children?: ReactNode;
}) {
  const visibleItems = items.filter((item) => item.value != null && item.value !== "");
  if (visibleItems.length === 0 && children == null) return null;

  return (
    <details data-admin-technical-disclosure aria-label="기술 정보">
      <summary>{summary}</summary>
      {visibleItems.length > 0 ? (
        <dl>
          {visibleItems.map((item) => (
            <div key={`${item.label}-${item.value}`}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </details>
  );
}
