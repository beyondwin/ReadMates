import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextArea, TextField } from "./text-field";

describe("TextField", () => {
  it("renders an accessible labeled input with the input class", () => {
    render(<TextField label="표시 이름" defaultValue="민지" />);

    const input = screen.getByLabelText("표시 이름");
    expect(input).toHaveClass("input");
    expect(input).toHaveValue("민지");
  });
});

describe("TextArea", () => {
  it("renders an accessible labeled textarea with the textarea class", () => {
    render(<TextArea label="세션 메모" defaultValue="읽은 부분 기록" />);

    const textarea = screen.getByLabelText("세션 메모");
    expect(textarea).toHaveClass("textarea");
    expect(textarea).toHaveValue("읽은 부분 기록");
  });
});
