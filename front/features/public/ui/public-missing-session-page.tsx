import { Link } from "@/features/public/ui/public-link";
import { publicRecordsReturnTarget, type ReadmatesReturnTarget } from "@/features/public/ui/public-route-continuity";

export function PublicMissingSessionPage({
  returnTarget = publicRecordsReturnTarget,
}: {
  returnTarget?: ReadmatesReturnTarget;
}) {
  return (
    <main className="container">
      <section className="surface" style={{ margin: "48px 0", padding: 28 }}>
        <p className="eyebrow">공개 기록</p>
        <h1 className="h2 editorial">공개 기록을 찾을 수 없습니다.</h1>
        <Link className="btn btn-ghost btn-sm" to={returnTarget.href}>
          {returnTarget.label}
        </Link>
      </section>
    </main>
  );
}
