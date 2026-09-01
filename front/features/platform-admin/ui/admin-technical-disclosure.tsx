export type AdminTechnicalDisclosureItem = Readonly<{
  label: string;
  value: string | null | undefined;
}>;

export function AdminTechnicalDisclosure({
  items,
}: {
  items: readonly AdminTechnicalDisclosureItem[];
}) {
  const visibleItems = items.filter((item) => item.value != null && item.value !== "");
  if (visibleItems.length === 0) return null;

  return (
    <details data-admin-technical-disclosure aria-label="기술 정보">
      <summary>기술 정보</summary>
      <dl>
        {visibleItems.map((item) => (
          <div key={`${item.label}-${item.value}`}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
