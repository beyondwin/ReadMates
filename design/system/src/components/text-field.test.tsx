import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextArea, TextField } from "./text-field";

describe("TextField", () => {
  it("associates the label with the input so assistive tech can find it", () => {
    render(<TextField label="표시 이름" defaultValue="민지" />);

    expect(screen.getByLabelText("표시 이름")).toHaveValue("민지");
  });
});

describe("TextArea", () => {
  it("associates the label with the textarea so assistive tech can find it", () => {
    render(<TextArea label="세션 메모" defaultValue="읽은 부분 기록" />);

    expect(screen.getByLabelText("세션 메모")).toHaveValue("읽은 부분 기록");
  });
});
