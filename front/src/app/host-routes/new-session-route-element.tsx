import { NewHostMeetingRoute } from "@/features/host/route/new-host-meeting-route";
import { useSessionRecordsChangedInvalidation } from "@/src/app/host-route-invalidation";

export function NewHostSessionRouteElement() {
  const onSessionRecordsChanged = useSessionRecordsChangedInvalidation();

  return (
    <NewHostMeetingRoute
      onSessionRecordsChanged={({ sessionId, clubSlug }) => onSessionRecordsChanged({ sessionId, clubSlug })}
    />
  );
}
