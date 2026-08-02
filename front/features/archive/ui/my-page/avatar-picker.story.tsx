import { useState } from "react";
import type { BookClubAvatarKey } from "@/shared/ui/book-club-avatar";
import { AvatarPicker } from "./avatar-picker";

export function AvatarPickerStory() {
  const [value, setValue] = useState<BookClubAvatarKey>("banana-green-book");
  return <AvatarPicker value={value} onChange={setValue} disabled={false} />;
}
