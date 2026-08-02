import SharedNotesFeedPage, { type NotesFeedPageProps } from "@/shared/ui/notes-feed-page";
import { Link } from "@/features/archive/ui/archive-link";

export default function NotesFeedPage(props: Omit<NotesFeedPageProps, "LinkComponent">) {
  return <SharedNotesFeedPage {...props} LinkComponent={Link} />;
}
