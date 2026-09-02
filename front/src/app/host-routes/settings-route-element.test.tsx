import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { HostSettingsRouteElement } from "./settings-route-element";

describe("HostSettingsRouteElement", () => {
  it.each([
    ["/app/host/settings", "/app/host/invitations"],
    ["/clubs/reading-sai/app/host/settings", "/clubs/reading-sai/app/host/invitations"],
  ])("keeps the current email invitation flow truthfully separated at %s", (entry, invitationHref) => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <HostSettingsRouteElement />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "초대와 설정" })).toBeInTheDocument();
    expect(screen.getByText(/새 멤버가 들어오는 경로와 클럽 운영 기준/)).toBeVisible();
    expect(screen.getByRole("link", { name: "기존 이메일 초대 관리" })).toHaveAttribute(
      "href",
      invitationHref,
    );
  });
});
