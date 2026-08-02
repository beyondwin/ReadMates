import { publicClubAppEntry } from "@/features/public/model/public-paths";
import { Link } from "@/features/public/ui/public-link";
import { MemberStartLink } from "@/shared/ui/member-start-link";

export function PublicEntryActions({ publicBasePath = "" }: { publicBasePath?: string }) {
  const { appHref, clubSlug } = publicClubAppEntry(publicBasePath);

  return (
    <>
      <Link to={appHref} className="btn btn-primary">
        둘러보기
      </Link>
      <MemberStartLink className="btn btn-ghost" returnTo={appHref} clubSlug={clubSlug}>
        멤버로 시작
      </MemberStartLink>
    </>
  );
}
