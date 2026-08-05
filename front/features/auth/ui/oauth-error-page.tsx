import type { OAuthErrorViewModel } from "@/shared/auth/oauth-error";
import { ErrorExperience } from "@/shared/ui/error-experience";

export function OAuthErrorPage({ view }: { view: OAuthErrorViewModel }) {
  return (
    <ErrorExperience
      variant="auth"
      eyebrow={view.eyebrow}
      heading={view.heading}
      body={view.body}
      reassurance={view.reassurance}
      primaryAction={view.primaryAction}
      secondaryAction={view.secondaryAction}
      helpText={view.helpText}
    />
  );
}
