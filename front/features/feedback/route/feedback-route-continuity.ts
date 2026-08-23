import {
  archiveReportReturnTarget,
  type ReadmatesReturnTarget,
} from "@/features/feedback/model/feedback-document-model";
import { readAppReturnTarget } from "@/shared/routing/readmates-route-state";

export function readFeedbackReturnTarget(
  state: unknown,
  currentPathname: string,
  fallback = archiveReportReturnTarget,
): ReadmatesReturnTarget {
  return readAppReturnTarget(state, currentPathname, fallback);
}
