import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceSelector } from "./workspace-selector";

const LinkComponent = ({ to, children, ...props }: {
  to: string;
  children: React.ReactNode;
  "aria-current"?: "page";
}) => (
  <a href={to} {...props}>
    {children}
  </a>
);

describe("WorkspaceSelector", () => {
  it("shows only authorized named workspaces and marks the current one", () => {
    render(
      <WorkspaceSelector
        currentWorkspace="member"
        items={[{ id: "member", label: "멤버 공간", href: "/clubs/reading-sai/app" }]}
        LinkComponent={LinkComponent}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "공간 선택" });
    expect(within(navigation).getByRole("link", { name: "멤버 공간" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).queryByRole("link", { name: "호스트 공간" })).not.toBeInTheDocument();
  });

  it("keeps the current workspace name visible on the mobile disclosure", () => {
    const { container } = render(
      <WorkspaceSelector
        currentWorkspace="host"
        items={[
          { id: "member", label: "멤버 공간", href: "/clubs/reading-sai/app" },
          { id: "host", label: "호스트 공간", href: "/clubs/reading-sai/app/host" },
        ]}
        LinkComponent={LinkComponent}
      />,
    );

    expect(container.querySelector(".rm-workspace-selector__trigger")).toHaveTextContent("호스트 공간");
    const navigation = screen.getByRole("navigation", { name: "공간 선택" });
    expect(within(navigation).getByRole("link", { name: "멤버 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app",
    );
    expect(within(navigation).getByRole("link", { name: "호스트 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host",
    );
  });
});
