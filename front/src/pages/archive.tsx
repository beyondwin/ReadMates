import { ArchiveListRoute } from "@/features/archive/route/archive-list-route";
import { useAuth } from "@/src/app/auth-state";

export default function ArchiveRoutePage() {
  const authState = useAuth();
  const reviewAuthorName = authState.status === "ready" ? authState.auth.displayName : null;

  return <ArchiveListRoute reviewAuthorName={reviewAuthorName} />;
}
