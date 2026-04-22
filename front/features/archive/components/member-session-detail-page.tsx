import MemberSessionDetailPageUi, {
  MemberSessionDetailUnavailablePage as MemberSessionDetailUnavailablePageUi,
} from "@/features/archive/ui/member-session-detail-page";

export default function MemberSessionDetailPage(
  props: Parameters<typeof MemberSessionDetailPageUi>[0],
) {
  return <MemberSessionDetailPageUi {...props} />;
}

export function MemberSessionDetailUnavailablePage(
  props: Parameters<typeof MemberSessionDetailUnavailablePageUi>[0],
) {
  return <MemberSessionDetailUnavailablePageUi {...props} />;
}
