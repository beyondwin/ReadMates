export type ComponentStatus = "stable" | "experimental" | "legacy" | "deprecated";

export type ComponentDoc = {
  name: string;
  status: ComponentStatus;
  description: string;
  mobile: string;
  source: string;
};

export const componentDocs: ComponentDoc[] = [
  {
    name: "Button",
    status: "stable",
    description: "Primary, secondary, ghost, and quiet actions using the existing ReadMates button contract.",
    mobile: "Uses the same visual contract; product screens must place actions with a 44px touch target.",
    source: "@readmates/design-system",
  },
  {
    name: "Badge",
    status: "stable",
    description: "Compact state labels with dot indicators when state needs extra emphasis.",
    mobile: "Keeps labels short and non-wrapping; long state text belongs in nearby body copy.",
    source: "@readmates/design-system",
  },
  {
    name: "TextField / TextArea",
    status: "stable",
    description: "Form controls that preserve label, focus, disabled, readonly, and example-text contracts.",
    mobile: "Full-width by default inside narrow panels.",
    source: "@readmates/design-system",
  },
  {
    name: "Surface",
    status: "stable",
    description: "Paper-like panels, quiet surfaces, reading desks, and document panels.",
    mobile: "Avoid nested cards; use sections and rows before adding framed surfaces.",
    source: "@readmates/design-system",
  },
  {
    name: "BookCover",
    status: "stable",
    description: "Book representation for public showcases and member reading desks, with image fallback.",
    mobile: "Uses fixed aspect ratio and stable width variants so adjacent text can stack below it on narrow screens.",
    source: "@readmates/design-system",
  },
  {
    name: "AvatarChip",
    status: "stable",
    description: "Compact identity chip for host and member display with initials fallback.",
    mobile: "Text metadata truncates inside the chip group; long names need nearby full text when critical.",
    source: "@readmates/design-system",
  },
  {
    name: "EmptyState / LockedState",
    status: "stable",
    description: "Quiet empty states and explicit permission boundaries for public and member scenes.",
    mobile: "Actions stack to full-width touch targets.",
    source: "@readmates/design-system",
  },
  {
    name: "DocumentPanel",
    status: "stable",
    description: "Document-like panel for introductions, reading notes, and session summaries.",
    mobile: "Header metadata stacks before body content; avoid nested cards inside the panel.",
    source: "@readmates/design-system",
  },
  {
    name: "TopNav / MobileHeader / MobileTabBar",
    status: "legacy",
    description: "Existing app shell components remain in front/shared/ui until route-aware props are split from presentation.",
    mobile: "Must preserve public/member/host role clarity before promotion.",
    source: "front/shared/ui",
  },
];
