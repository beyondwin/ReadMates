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
  const coverClassName = className ? `m-cover ${className}` : "m-cover";

  return (
    <div
      aria-hidden={decorative ? true : undefined}
      className={coverClassName}
      style={{
        width,
        aspectRatio: "3 / 4",
        borderRadius: 4,
        border: "1px solid var(--line)",
        overflow: "hidden",
        flexShrink: 0,
        background: "var(--bg-sub)",
        boxShadow: "1px 1px 0 var(--line-soft), 2px 2px 0 var(--line-soft)",
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
          style={{
            width: "100%",
            height: "100%",
            padding: "10px 8px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 8,
          }}
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
