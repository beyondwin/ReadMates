import type { ReactNode } from "react";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { ProfileNameEditor } from "./profile-name-editor";

type ProfileUpdateResult = Pick<MyPageProfile, "displayName" | "accountName">;

export function PreferencesSection({
  data,
  canEditProfile,
  onUpdateProfile,
}: {
  data: MyPageProfile;
  canEditProfile: boolean;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
}) {
  const preferences = [
    { label: "기록 공개 범위", sub: "클럽 내부 전체", icon: "eye" as const },
    { label: "언어", sub: "한국어", icon: "settings" as const },
  ];

  return (
    <section>
      <SectionHeader eyebrow="읽기 전용 설정" title="개인 설정" />
      <div className="surface" style={{ padding: "4px" }}>
        <ProfileNameEditor
          data={data}
          canEditProfile={canEditProfile}
          onUpdateProfile={onUpdateProfile}
          variant="desktop"
        />
        {preferences.map((preference, index) => (
          <div
            key={preference.label}
            style={{
              display: "grid",
              gridTemplateColumns: "28px minmax(0, 1fr) auto",
              gap: "14px",
              padding: "16px 18px",
              borderTop: index >= 0 ? "1px solid var(--line-soft)" : "none",
              alignItems: "center",
            }}
          >
            <span aria-hidden style={{ color: "var(--text-3)" }}>
              <Icon name={preference.icon} size={16} />
            </span>
            <div>
              <div className="body" style={{ fontSize: "14px" }}>
                {preference.label}
              </div>
              <div className="tiny">{preference.sub}</div>
            </div>
            <span className="tiny" aria-label={`${preference.label} 변경 준비 중`} style={{ color: "var(--text-3)" }}>
              변경 준비 중
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  eyebrowHelper,
  right,
}: {
  eyebrow: string;
  title: string;
  eyebrowHelper?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "18px", gap: "14px" }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: "8px" }}>
          {eyebrow}
          {eyebrowHelper}
        </div>
        <h2 className="h2 editorial" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

function Icon({
  name,
  size = 16,
}: {
  name: "eye" | "settings";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "eye") {
    return (
      <svg {...common}>
        <path d="M2.5 10s2.6-5 7.5-5 7.5 5 7.5 5-2.6 5-7.5 5-7.5-5-7.5-5z" />
        <path d="M10 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M10 3v2M10 15v2M4.5 5.5l1.4 1.4M14.1 13.1l1.4 1.4M3 10h2M15 10h2M4.5 14.5l1.4-1.4M14.1 6.9l1.4-1.4" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}
