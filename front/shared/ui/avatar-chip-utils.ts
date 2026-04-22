import { displayText } from "@/shared/ui/readmates-display";

export function avatarInitial(name: string | null | undefined, fallback?: string | null) {
  const source = displayText(name, displayText(fallback, "·")).trim();
  const compact = source.replace(/\s+/g, "");

  return compact.charAt(0) || "·";
}
