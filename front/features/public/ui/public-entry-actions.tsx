import { publicClubAppEntry } from "@/features/public/model/public-paths";
import { Link } from "@/features/public/ui/public-link";
import { oauthHrefForReturnTo } from "@/shared/auth/login-return";
import { PublicGuestOnlyActions } from "@/shared/ui/public-auth-action";

export function PublicEntryActions({ publicBasePath = "" }: { publicBasePath?: string }) {
  const { appHref, clubSlug } = publicClubAppEntry(publicBasePath);

  return (
    <PublicGuestOnlyActions>
      <Link to={appHref} className="btn btn-primary">
        둘러보기
      </Link>
      <a className="btn btn-ghost" href={oauthHrefForReturnTo(appHref, { joinClub: clubSlug })}>
        멤버로 시작
      </a>
    </PublicGuestOnlyActions>
  );
}
