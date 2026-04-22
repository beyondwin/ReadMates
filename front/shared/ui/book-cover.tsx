"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";
import { displayText } from "@/shared/ui/readmates-display";

type BookCoverProps = {
  title: string | null | undefined;
  author?: string | null;
  imageUrl?: string | null;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  decorative?: boolean;
};

export function BookCover({
  title,
  author,
  imageUrl,
  width = 96,
  className,
  style,
  decorative = false,
}: BookCoverProps) {
  const safeTitle = displayText(title, "도서 제목 미정");
  const safeAuthor = displayText(author, "저자 미상");
  const normalizedImageUrl = safeExternalHttpsUrl(imageUrl) ?? "";
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const shouldRenderImage = normalizedImageUrl.length > 0 && failedImageUrl !== normalizedImageUrl;
  const coverClassName = className ? `rm-book-cover m-cover ${className}` : "rm-book-cover m-cover";

  return (
    <div
      aria-hidden={decorative ? true : undefined}
      className={coverClassName}
      style={{
        width,
        ...style,
      }}
    >
      {shouldRenderImage ? (
        <img
          src={normalizedImageUrl}
          alt={decorative ? "" : `${safeTitle} 표지`}
          onError={() => setFailedImageUrl(normalizedImageUrl)}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          className="rm-book-cover__fallback"
        >
          <span className="editorial" style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.25 }}>
            {safeTitle}
          </span>
          <span className="tiny" style={{ color: "var(--text-3)" }}>
            {safeAuthor}
          </span>
        </div>
      )}
    </div>
  );
}
