import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BookCover } from "@/shared/ui/book-cover";

const aladinCoverUrl = "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg";
const nextCoverUrl = "https://image.aladin.co.kr/product/10044/19/cover500/8960515833_3.jpg";

afterEach(cleanup);

describe("BookCover", () => {
  it("renders a registered cover image with accessible cover text and width", () => {
    render(<BookCover title="팩트풀니스" author="한스 로슬링" imageUrl={aladinCoverUrl} width={96} />);

    const image = screen.getByRole("img", { name: "팩트풀니스 표지" });

    expect(image).toHaveAttribute("src", aladinCoverUrl);
    expect(image.parentElement).toHaveStyle({ width: "96px" });
  });

  it("falls back to a text cover when the registered cover image fails", () => {
    render(<BookCover title="팩트풀니스" author="한스 로슬링" imageUrl={aladinCoverUrl} width={96} />);

    fireEvent.error(screen.getByRole("img", { name: "팩트풀니스 표지" }));

    expect(screen.queryByRole("img", { name: "팩트풀니스 표지" })).not.toBeInTheDocument();
    expect(screen.getByText("팩트풀니스")).toBeInTheDocument();
    expect(screen.getByText("한스 로슬링")).toBeInTheDocument();
  });

  it("renders a new image URL after the previous URL failed", () => {
    const { rerender } = render(
      <BookCover title="팩트풀니스" author="한스 로슬링" imageUrl={aladinCoverUrl} width={96} />,
    );

    fireEvent.error(screen.getByRole("img", { name: "팩트풀니스 표지" }));
    expect(screen.queryByRole("img", { name: "팩트풀니스 표지" })).not.toBeInTheDocument();

    rerender(<BookCover title="팩트풀니스" author="한스 로슬링" imageUrl={nextCoverUrl} width={96} />);

    expect(screen.getByRole("img", { name: "팩트풀니스 표지" })).toHaveAttribute("src", nextCoverUrl);
  });

  it("keeps decorative cover images out of the accessibility tree", () => {
    render(<BookCover decorative title="팩트풀니스" author="한스 로슬링" imageUrl={aladinCoverUrl} width={96} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps fallback title and author discoverable when no image is registered", () => {
    render(<BookCover title="팩트풀니스" author="한스 로슬링" width={96} />);

    expect(screen.getByText("팩트풀니스")).toBeInTheDocument();
    expect(screen.getByText("한스 로슬링")).toBeInTheDocument();
  });
});
