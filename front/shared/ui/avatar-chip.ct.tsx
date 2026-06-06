import { expect, test } from "@playwright/experimental-ct-react";
import { AvatarChip } from "@/shared/ui/avatar-chip";

test("AvatarChip renders the initial with a deterministic tone", async ({ mount }) => {
  const component = await mount(
    <AvatarChip name="김우승" label="김우승" size={48} />,
  );
  await expect(component).toHaveScreenshot("avatar-chip.png");
});
