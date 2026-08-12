import { useEffect } from "react";
import { PageMetadataHead } from "@/shared/ui/page-metadata-head";

const PREVIEW_METADATA = {
  title: "Living Archive Preview | ReadMates",
  description: "읽는사이의 공개 기록을 Living Archive 시안으로 미리 봅니다.",
};

const previewRobotsSelector = 'meta[data-readmates-living-archive-preview="true"]';

export function LivingArchivePreviewHead() {
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>(previewRobotsSelector);
    const robots = existing ?? document.createElement("meta");
    const created = !existing;

    robots.name = "robots";
    robots.content = "noindex,nofollow";
    robots.dataset.readmatesLivingArchivePreview = "true";

    if (created) {
      document.head.append(robots);
    }

    return () => {
      if (created) {
        robots.remove();
      }
    };
  }, []);

  return <PageMetadataHead metadata={PREVIEW_METADATA} />;
}
