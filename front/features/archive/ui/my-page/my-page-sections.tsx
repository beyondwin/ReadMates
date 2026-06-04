import { type CSSProperties, type ReactNode, useId, useRef, useState } from "react";
import type { MyPageProfile, NotificationPreferences } from "@/features/archive/model/archive-model";
import {
  attendanceSummary,
  clubDisplayName,
  formatJoinedMonth,
  membershipIdentityLabel,
  notificationEventLabels,
  notificationEventOrder,
} from "@/features/archive/model/archive-model";
import { readingCompletionRate } from "@/features/archive/model/reading-journey-model";
import { Link } from "@/features/archive/ui/archive-link";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import type { LogoutControlComponent } from "./types";

function SectionHeader({
  eyebrow,
  eyebrowHelper,
  title,
  right,
}: {
  eyebrow: string;
  eyebrowHelper?: ReactNode;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "16px" }}>
      <div>
        <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: "8px" }}>
          <div className="eyebrow">{eyebrow}</div>
          {eyebrowHelper}
        </div>
        <h2 className="h2" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}


export function AccountSection({
  data,
  LogoutButtonComponent,
  canEditProfile,
}: {
  data: MyPageProfile;
  LogoutButtonComponent: LogoutControlComponent;
  canEditProfile: boolean;
}) {
  return (
    <section>
      <SectionHeader eyebrow="멤버 정체성" title="계정" />
      <div className="surface" style={{ padding: "26px" }}>
        <div className="row" style={{ gap: "16px" }}>
          <AvatarChip name={data.displayName} fallbackInitial={data.displayName} label={data.displayName} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="h4 editorial">{data.displayName}</div>
            <div className="small">{data.email}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <span
              className="tiny"
              aria-label={canEditProfile ? "이름 편집 가능" : "프로필 수정 준비 중"}
              style={{ color: "var(--text-3)", flexShrink: 0 }}
            >
              {canEditProfile ? "프로필 수정 가능" : "프로필 수정 준비 중"}
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <LogoutButtonComponent className="btn btn-ghost btn-sm" style={{ color: "var(--text-3)" }}>
                로그아웃
              </LogoutButtonComponent>
            </div>
          </div>
        </div>
        <hr className="divider-soft" style={{ margin: "20px 0" }} />
        <dl
          className="rm-account-keyval"
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: "16px",
            rowGap: "8px",
            margin: 0,
            fontSize: "13px",
          }}
        >
          {[
            ["멤버 상태", membershipIdentityLabel(data)],
            ["클럽", clubDisplayName(data)],
            ["합류", formatJoinedMonth(data.joinedAt)],
            ["참석 회차", `${data.sessionCount}회 참석`],
          ].map(([label, value]) => (
            <KeyValue key={label} label={label} value={value} />
          ))}
        </dl>
      </div>
    </section>
  );
}


export function RhythmSection({
  data,
  reviewCount,
  questionCount,
}: {
  data: MyPageProfile;
  reviewCount: string;
  questionCount: string;
}) {
  const summary = attendanceSummary(data);
  const completionRate = readingCompletionRate({
    completedReadingCount: data.completedReadingCount ?? 0,
    totalSessionCount: data.totalSessionCount,
  });
  const recentAttendances = data.recentAttendances ?? [];
  const firstRecent = recentAttendances.at(0)?.sessionNumber;
  const lastRecent = recentAttendances.at(-1)?.sessionNumber;
  const stats = [
    { key: "참석률", value: String(summary.rate), sub: "%" },
    { key: "완독률", value: String(completionRate), sub: "%" },
    { key: "질문", value: String(questionCount), sub: "개" },
    { key: "서평", value: String(reviewCount), sub: "편" },
  ];

  return (
    <section>
      <SectionHeader eyebrow="읽기 기록" title="나의 리듬" />
      <div className="surface" style={{ padding: "26px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
          {stats.map((stat) => (
            <div key={stat.key}>
              <div className="tiny">{stat.key}</div>
              <div className="editorial" style={{ fontSize: "30px", lineHeight: 1, marginTop: "6px" }}>
                {stat.value}
                <span className="tiny mono" style={{ color: "var(--text-3)", marginLeft: "3px" }}>
                  {stat.sub}
                </span>
              </div>
            </div>
          ))}
        </div>
        {recentAttendances.length > 0 ? (
          <>
            <div className="tiny" style={{ color: "var(--text-3)", marginBottom: "8px" }}>
              최근 {recentAttendances.length}회 참석
            </div>
            <div className="row" style={{ gap: "4px" }}>
              {recentAttendances.map((attendance) => (
                <div
                  key={attendance.sessionNumber}
                  className="rm-rhythm-attendance-bar"
                  aria-label={`No.${attendance.sessionNumber} ${attendance.attended ? "참석" : "불참"}`}
                  style={{
                    flex: 1,
                    height: "24px",
                    borderRadius: "2px",
                    background: attendance.attended ? "var(--accent-soft)" : "var(--bg-sub)",
                    border: `1px solid ${attendance.attended ? "var(--accent-line)" : "var(--line-soft)"}`,
                  }}
                />
              ))}
            </div>
            <div className="row-between" style={{ marginTop: "6px" }}>
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                No.{firstRecent}
              </span>
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                No.{lastRecent}
              </span>
            </div>
          </>
        ) : (
          <div className="surface-quiet" style={{ padding: "16px 18px" }}>
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              아직 최근 참석 데이터가 없습니다.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}


export function WritingSection({ reviewCount, questionCount }: { reviewCount: string; questionCount: string }) {
  return (
    <section>
      <SectionHeader eyebrow="내 글" title="내가 남긴 문장" />
      <div style={{ padding: "4px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px" }}>
          <WritingCountCard label="질문" value={questionCount} body="모임 전에 꺼낸 질문과 초안" href="/app/archive?view=questions" />
          <WritingCountCard label="서평" value={reviewCount} body="회차별로 남긴 장문 서평" href="/app/archive?view=reviews" />
        </div>
      </div>
    </section>
  );
}


function WritingCountCard({ label, value, body, href }: { label: string; value: string; body: string; href: string }) {
  return (
    <Link to={href} style={{ display: "block", padding: "18px 20px", background: "var(--bg-sub)", borderRadius: "var(--r-2)" }}>
      <div className="tiny mono" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      <div className="editorial" style={{ fontSize: 30, lineHeight: 1, marginTop: 8 }}>
        {value}
        <span className="tiny mono" style={{ marginLeft: 4, color: "var(--text-3)" }}>
          개
        </span>
      </div>
      <p className="small" style={{ margin: "10px 0 0", color: "var(--text-2)" }}>
        {body}
      </p>
    </Link>
  );
}


export function NotificationsSection({
  preferences,
  onSave,
  variant = "desktop",
}: {
  preferences: NotificationPreferences;
  onSave: (preferences: NotificationPreferences) => Promise<NotificationPreferences>;
  variant?: "desktop" | "mobile";
}) {
  const [draftState, setDraftState] = useState({ source: preferences, draft: preferences });
  const draft = draftState.source === preferences ? draftState.draft : preferences;
  const [saving, setSaving] = useState(false);
  const [errorState, setErrorState] = useState<{ source: NotificationPreferences; message: string | null }>({
    source: preferences,
    message: null,
  });
  const error = errorState.source === preferences ? errorState.message : null;
  const savingRef = useRef(false);

  function setDraft(updater: (current: NotificationPreferences) => NotificationPreferences) {
    setDraftState({ source: preferences, draft: updater(draft) });
  }

  function setError(message: string | null) {
    setErrorState({ source: preferences, message });
  }

  async function submitNotificationPreferences() {
    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const saved = await onSave(draft);
      setDraftState({ source: preferences, draft: saved });
    } catch {
      setError("알림 설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const controls = (
    <>
      <NotificationSwitchRow
        label="이메일 알림"
        sub="ReadMates에서 보내는 이메일 알림 전체"
        checked={draft.emailEnabled}
        disabled={saving}
        first
        variant={variant}
        onChange={(checked) => {
          setDraft((current) => ({ ...current, emailEnabled: checked }));
          setError(null);
        }}
      />
      {notificationEventOrder.map((event) => (
        <NotificationSwitchRow
          key={event}
          label={notificationEventLabels[event].label}
          sub={draft.emailEnabled ? notificationEventLabels[event].sub : "전체 알림 꺼짐"}
          checked={draft.events[event]}
          disabled={saving || !draft.emailEnabled}
          variant={variant}
          onChange={(checked) => {
            setDraft((current) => ({ ...current, events: { ...current.events, [event]: checked } }));
            setError(null);
          }}
        />
      ))}
      {error ? (
        <div
          className="small"
          role="alert"
          style={{
            margin: "10px 12px 0",
            color: "var(--danger)",
            wordBreak: "keep-all",
          }}
        >
          {error}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: variant === "mobile" ? "12px 8px 8px" : "14px 12px 12px",
        }}
      >
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={saving}
          onClick={() => void submitNotificationPreferences()}
          style={variant === "mobile" ? { width: "100%", height: 38, borderRadius: 10 } : undefined}
        >
          {saving ? "저장 중" : "알림 설정 저장"}
        </button>
      </div>
    </>
  );

  if (variant === "mobile") {
    return (
      <section className="m-sec">
        <div className="m-row-between" style={{ marginBottom: 10, alignItems: "center" }}>
          <div className="eyebrow">알림</div>
        </div>
        <div className="m-card" style={{ padding: "6px" }}>
          {controls}
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader eyebrow="설정" title="알림" />
      <div className="surface" style={{ padding: "6px" }}>
        {controls}
      </div>
    </section>
  );
}


function NotificationSwitchRow({
  label,
  sub,
  checked,
  disabled = false,
  first = false,
  variant = "desktop",
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  disabled?: boolean;
  first?: boolean;
  variant?: "desktop" | "mobile";
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const descriptionId = useId();
  const [isFocused, setFocused] = useState(false);
  const trackStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    width: "34px",
    height: "18px",
    padding: "2px",
    borderRadius: "999px",
    border: checked ? "1px solid var(--accent-line)" : "1px solid var(--line-soft)",
    background: checked ? "var(--accent-soft)" : "var(--bg-sub)",
    boxShadow: isFocused ? "0 0 0 3px var(--focus-ring-soft)" : "inset 0 1px 0 color-mix(in oklch, white 64%, transparent)",
    opacity: disabled ? 0.58 : 1,
    transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease",
  };
  const thumbStyle: CSSProperties = {
    display: "block",
    width: "12px",
    height: "12px",
    borderRadius: "999px",
    background: checked ? "var(--accent)" : "var(--text-3)",
    transform: checked ? "translateX(14px)" : "translateX(0)",
    boxShadow: checked ? "0 2px 5px color-mix(in oklch, var(--accent), transparent 70%)" : "0 1px 3px color-mix(in oklch, black, transparent 84%)",
    transition: "transform 140ms ease, background 140ms ease, box-shadow 140ms ease",
  };

  return (
    <div
      className="row-between"
      style={{
        padding: variant === "mobile" ? "12px 10px" : "14px 18px",
        borderTop: first ? "none" : "1px solid var(--line-soft)",
        alignItems: "center",
        gap: variant === "mobile" ? "12px" : undefined,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <label className="body" htmlFor={id} style={{ display: "block", fontSize: "14px", fontWeight: 500 }}>
          {label}
        </label>
        <div id={descriptionId} className="tiny" style={{ color: disabled ? "var(--text-3)" : undefined, wordBreak: "keep-all" }}>
          {sub}
        </div>
      </div>
      <label
        htmlFor={id}
        style={{
          position: "relative",
          display: "inline-flex",
          flexShrink: 0,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-label={label}
          aria-describedby={descriptionId}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            margin: 0,
            opacity: 0,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
        <span aria-hidden="true" style={trackStyle}>
          <span style={thumbStyle} />
        </span>
      </label>
    </div>
  );
}


function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="eyebrow" style={{ alignSelf: "center" }}>
        {label}
      </dt>
      <dd style={{ margin: 0, color: "var(--text)" }}>{value}</dd>
    </>
  );
}
