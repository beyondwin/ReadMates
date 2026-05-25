import type { AdminRouteDescriptor } from "@/features/platform-admin/model/admin-route-catalog";

export function AdminComingSoon({ descriptor }: { descriptor: AdminRouteDescriptor }) {
  const block = descriptor.comingSoon;
  if (!block) {
    return null;
  }
  return (
    <section className="admin-coming-soon" aria-labelledby="admin-coming-soon-title">
      <p className="eyebrow">준비 중 · {descriptor.slice}</p>
      <h1 id="admin-coming-soon-title" className="h1 editorial">
        {block.title}
      </h1>
      <p className="body admin-coming-soon__summary">{block.summary}</p>
      <h2 className="h3 admin-coming-soon__heading">들어올 기능</h2>
      <ul className="admin-coming-soon__bullets">
        {block.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <a className="admin-coming-soon__doc-link" href={block.docHref}>
        로드맵에서 {descriptor.slice} 자세히 보기 →
      </a>
    </section>
  );
}
