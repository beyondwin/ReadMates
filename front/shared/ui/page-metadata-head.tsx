import { useEffect } from "react";

export type PageMetadata = {
  title: string;
  description: string;
};

function upsertDescription(content: string) {
  const existing = document.head.querySelector<HTMLMetaElement>(
    'meta[name="description"][data-readmates-page-head]',
  );
  const meta = existing ?? document.createElement("meta");
  meta.name = "description";
  meta.content = content;
  meta.dataset.readmatesPageHead = "description";

  if (!existing) {
    document.head.append(meta);
  }
}

export function PageMetadataHead({ metadata }: { metadata: PageMetadata }) {
  useEffect(() => {
    document.title = metadata.title;
    upsertDescription(metadata.description);
  }, [metadata]);

  return null;
}
