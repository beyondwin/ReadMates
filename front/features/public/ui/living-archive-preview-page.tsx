import type { LivingArchivePreviewModel } from "@/features/public/model/living-archive-preview-model";

type LivingArchivePreviewPageProps = {
  model: LivingArchivePreviewModel;
  publicBasePath: string;
};

export function LivingArchivePreviewPage({ model, publicBasePath }: LivingArchivePreviewPageProps) {
  return <main aria-label="Living Archive preview" data-public-base-path={publicBasePath} data-club-name={model.clubName} />;
}
