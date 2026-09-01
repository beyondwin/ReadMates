# Whole-branch review fix 1 brief

- Base: `1c2de374be844d58dcd7dab91ba2125176f0ea80`.
- Finding: `InvitationExpiryWorkSourceAdapter` emits the unregistered deep link `/app/host/settings/invitations/{linkId}`, and `NotificationFailureWorkSourceAdapter` emits the unregistered deep link `/app/host/notifications/{deliveryId}`.
- Required contract: all five host work source adapters must expose their exact ordered destinations. Invitation expiry routes to `/app/host/settings#invitations`; notification failure routes to `/app/host/notifications`.
- TDD: strengthen `HostWorkSourceAdaptersTest` first and capture RED from the two legacy hrefs, then minimally change only the two adapters and capture focused GREEN.
- Required proof: touched Kotlin source/test lint, the existing frontend host route destination inventory with the pinned package manager, diff-check, focused public-safety scan, and a SHA-256 manifest.
- Allowed tracked changes: the two adapters, `HostWorkSourceAdaptersTest`, this brief, report, and manifest.
- Forbidden: frontend routes, other behavior or documentation, Stage reports, and the unrelated untracked mockup tree.
- ADR impact: `none`; this closes an implementation defect against accepted ADR-0048 rather than creating or changing a durable decision.
- Commit exactly: `fix(host): route workbox remediation actions`.
