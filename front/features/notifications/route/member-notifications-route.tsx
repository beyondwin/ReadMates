import { useLoaderData, useRevalidator } from "react-router-dom";
import { MemberNotificationsPage } from "../ui/member-notifications-page";
import { memberNotificationsActions, type MemberNotificationsRouteData } from "./member-notifications-data";

export function MemberNotificationsRoute() {
  const data = useLoaderData() as MemberNotificationsRouteData;
  const revalidator = useRevalidator();

  const refreshAfter = async (action: () => Promise<unknown>) => {
    await action();
    await revalidator.revalidate();
  };

  return (
    <MemberNotificationsPage
      unreadCount={data.unreadCount}
      items={data.items}
      onMarkRead={(id) => refreshAfter(() => memberNotificationsActions.markRead(id))}
      onMarkAllRead={() => refreshAfter(memberNotificationsActions.markAllRead)}
    />
  );
}
