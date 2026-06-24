import {
  DEFAULT_PUBLIC_PAGE_METADATA,
  type PublicPageMetadata,
} from "@/features/public/model/public-page-metadata";
import { PageMetadataHead } from "@/shared/ui/page-metadata-head";

type PublicPageMetadataHeadProps = {
  metadata?: PublicPageMetadata | null;
};

export function PublicPageMetadataHead({ metadata }: PublicPageMetadataHeadProps) {
  return <PageMetadataHead metadata={metadata ?? DEFAULT_PUBLIC_PAGE_METADATA} />;
}
