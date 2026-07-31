import { expect, test } from "@playwright/experimental-ct-react";
import { MemoryRouter } from "react-router-dom";
import { TopNav } from "./top-nav";

test("TopNav keeps the host retry control typographically aligned with destination links", async ({
  mount,
}) => {
  const navigation = await mount(
    <MemoryRouter initialEntries={["/app/host"]}>
      <TopNav
        variant="host"
        currentSessionStatus="error"
        onRetryCurrentSession={() => undefined}
      />
    </MemoryRouter>,
  );

  const destinationLink = navigation.getByRole("link", { name: "멤버", exact: true });
  const retryButton = navigation.getByRole("button", { name: "세션 다시 확인" });
  const [linkTypography, retryTypography] = await Promise.all(
    [destinationLink, retryButton].map((locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
        };
      }),
    ),
  );

  expect(retryTypography).toEqual(linkTypography);
});
