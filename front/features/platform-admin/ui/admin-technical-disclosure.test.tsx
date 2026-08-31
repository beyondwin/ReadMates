import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminTechnicalDisclosure } from "./admin-technical-disclosure";

describe("AdminTechnicalDisclosure", () => {
  it("keeps canonical values behind one labelled disclosure boundary", () => {
    const { container } = render(
      <AdminTechnicalDisclosure
        items={[
          { label: "상태 코드", value: "RUNNING" },
          { label: "빈 값", value: null },
        ]}
      />,
    );

    const disclosure = container.querySelector("[data-admin-technical-disclosure]");
    expect(disclosure).toHaveAttribute("aria-label", "기술 정보");
    expect(screen.getByText("기술 정보")).toBeInTheDocument();
    expect(disclosure).toHaveTextContent("상태 코드");
    expect(disclosure).toHaveTextContent("RUNNING");
    expect(disclosure).not.toHaveTextContent("빈 값");
  });

  it("omits the boundary when no canonical value is available", () => {
    const { container } = render(
      <AdminTechnicalDisclosure items={[{ label: "상태 코드", value: null }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
