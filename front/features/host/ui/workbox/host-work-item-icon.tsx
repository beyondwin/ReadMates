import type { HostWorkItemType } from "@/features/host/model/host-workbox-model";
import type { ReadmatesIconName, ReadmatesIconTone } from "@/shared/ui/icon";

const WORK_ITEM_ICONS = {
  SCHEDULE_UNSEEN: { name: "alert-circle", tone: "warn" },
  MEMBER_APPROVAL: { name: "person", tone: "ok" },
  RECORD_CLOSING: { name: "document", tone: "info" },
  INVITATION_EXPIRY: { name: "link", tone: "danger" },
  NOTIFICATION_FAILURE: { name: "bell", tone: "warn" },
} as const satisfies Record<HostWorkItemType, { name: ReadmatesIconName; tone: ReadmatesIconTone }>;

export function workItemIcon(type: HostWorkItemType): { name: ReadmatesIconName; tone: ReadmatesIconTone } {
  return WORK_ITEM_ICONS[type];
}
