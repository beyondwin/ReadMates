import { useParams } from "react-router-dom";
import InviteAcceptanceCard from "@/features/auth/components/invite-acceptance-card";

export default function InvitePage() {
  const token = useParams().token ?? "";

  return <InviteAcceptanceCard token={token} />;
}
