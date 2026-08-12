import { useEffect } from "react";

const PREVIEW_METADATA = {
  title: "Living Archive Preview | ReadMates",
  description: "읽는사이의 공개 기록을 Living Archive 시안으로 미리 봅니다.",
};

const previewRobotsSelector = 'meta[data-readmates-living-archive-preview="true"]';
const managedDescriptionSelector = 'meta[name="description"][data-readmates-page-head]';

export function LivingArchivePreviewHead() {
  useEffect(() => {
    const previousTitle = document.title;
    const existingDescription = document.head.querySelector<HTMLMetaElement>(managedDescriptionSelector);
    const description = existingDescription ?? document.createElement("meta");
    const createdDescription = !existingDescription;
    const previousDescriptionContent = existingDescription?.content ?? "";
    const previousPageHeadOwner = existingDescription?.getAttribute("data-readmates-page-head") ?? null;
    const existing = document.head.querySelector<HTMLMetaElement>(previewRobotsSelector);
    const robots = existing ?? document.createElement("meta");
    const created = !existing;

    document.title = PREVIEW_METADATA.title;
    description.name = "description";
    description.content = PREVIEW_METADATA.description;
    description.dataset.readmatesPageHead = "description";
    description.dataset.readmatesLivingArchivePreviewDescription = "true";

    if (createdDescription) {
      document.head.append(description);
    }

    robots.name = "robots";
    robots.content = "noindex,nofollow";
    robots.dataset.readmatesLivingArchivePreview = "true";

    if (created) {
      document.head.append(robots);
    }

    return () => {
      if (document.title === PREVIEW_METADATA.title) {
        document.title = previousTitle;
      }

      const stillOwnsDescription =
        description.dataset.readmatesLivingArchivePreviewDescription === "true" &&
        description.content === PREVIEW_METADATA.description;
      delete description.dataset.readmatesLivingArchivePreviewDescription;

      if (stillOwnsDescription) {
        if (createdDescription) {
          description.remove();
        } else {
          description.content = previousDescriptionContent;
          if (previousPageHeadOwner === null) {
            description.removeAttribute("data-readmates-page-head");
          } else {
            description.setAttribute("data-readmates-page-head", previousPageHeadOwner);
          }
        }
      }

      if (created) {
        robots.remove();
      }
    };
  }, []);

  return null;
}
