import { useEffect } from "react";
import {
  DEFAULT_PUBLIC_PAGE_METADATA,
  type PublicPageMetadata,
} from "@/features/public/model/public-page-metadata";

type PublicPageMetadataHeadProps = {
  metadata?: PublicPageMetadata | null;
};

function upsertDescription(content: string) {
  const existing = document.head.querySelector<HTMLMetaElement>(
    'meta[name="description"][data-readmates-public-page-head]',
  );
  const meta = existing ?? document.createElement("meta");
  meta.name = "description";
  meta.content = content;
  meta.dataset.readmatesPublicPageHead = "description";

  if (!existing) {
    document.head.append(meta);
  }
}

export function PublicPageMetadataHead({ metadata }: PublicPageMetadataHeadProps) {
  useEffect(() => {
    const next = metadata ?? DEFAULT_PUBLIC_PAGE_METADATA;

    document.title = next.title;
    upsertDescription(next.description);
  }, [metadata]);

  return null;
}
