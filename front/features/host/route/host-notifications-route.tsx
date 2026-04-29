import { useLoaderData, useRevalidator } from "react-router-dom";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";
import { hostNotificationsActions, type HostNotificationsRouteData } from "./host-notifications-data";

export function HostNotificationsRoute() {
  const data = useLoaderData() as HostNotificationsRouteData;
  const revalidator = useRevalidator();

  const refreshAfter = async (action: () => Promise<unknown>) => {
    await action();
    await revalidator.revalidate();
  };

  return (
    <HostNotificationsPage
      summary={data.summary}
      events={data.events}
      deliveries={data.deliveries}
      audit={data.audit}
      isRefreshing={revalidator.state !== "idle"}
      onProcess={() => refreshAfter(hostNotificationsActions.process)}
      onRetry={(id) => refreshAfter(() => hostNotificationsActions.retry(id))}
      onRestore={(id) => refreshAfter(() => hostNotificationsActions.restore(id))}
      onSendTestMail={(request) => refreshAfter(() => hostNotificationsActions.sendTestMail(request))}
    />
  );
}
