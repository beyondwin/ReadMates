/**
 * ClubAiDefaultsSection — host-facing dropdown to manage the club's
 * default AI model used by the session-generation flows (spec task 7.1).
 *
 * Reads the current default via `getClubAiDefault`, lets the host pick
 * a different model from the club administration allowlist,
 * and persists the change via `putClubAiDefault`. The post-save notice
 * is fixed copy ("새 generation 부터 적용됩니다.") per the task spec —
 * already-in-flight jobs keep their own model, only new generations
 * inherit the updated default.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClubAiDefault,
  putClubAiDefault,
} from "@/features/host/aigen/api/aigen-api";
import {
  CLUB_AI_MODEL_OPTIONS,
  CLUB_AI_OPENAI_DEFAULT_MODEL_ID,
} from "./club-ai-model-options";

export type ClubAiDefaultsSectionProps = {
  clubSlug: string;
};

function clubAiDefaultQueryKey(clubSlug: string): readonly unknown[] {
  return ["host", "aigen", "club-ai-default", clubSlug] as const;
}

export function ClubAiDefaultsSection({ clubSlug }: ClubAiDefaultsSectionProps) {
  const queryClient = useQueryClient();
  const defaultsQuery = useQuery({
    queryKey: clubAiDefaultQueryKey(clubSlug),
    queryFn: () => getClubAiDefault(clubSlug),
  });

  const serverModel = defaultsQuery.data?.defaultModel ?? null;
  // The dropdown's local selection; defaults to the server value but the
  // host can change it before saving. `null` while the initial query is
  // still loading so we don't flash a placeholder selection.
  const [selected, setSelected] = useState<string | null>(null);
  const [showSavedNotice, setShowSavedNotice] = useState(false);

  // Sync the selection to the server value the first time it loads, and
  // again whenever the server value changes (e.g. after invalidation
  // following a successful save). This is a server-event → local-state
  // sync, the same pattern AiGenerateTab uses for adopting the snapshot.
  useEffect(() => {
    if (serverModel === null && selected === null) return;
    if (serverModel !== null && selected === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- server-event → local sync
      setSelected(serverModel);
    }
  }, [serverModel, selected]);

  const mutation = useMutation({
    mutationFn: (model: string) =>
      putClubAiDefault(clubSlug, { defaultModel: model }),
    onSuccess: async () => {
      setShowSavedNotice(true);
      await queryClient.invalidateQueries({
        queryKey: clubAiDefaultQueryKey(clubSlug),
      });
    },
  });

  const effectiveSelected = selected ?? serverModel ?? CLUB_AI_OPENAI_DEFAULT_MODEL_ID;
  const isLoading = defaultsQuery.isLoading;
  const loadError = defaultsQuery.error;
  const isPending = mutation.isPending;
  const isDirty =
    selected !== null && serverModel !== null && selected !== serverModel;
  const canSave = isDirty && !isPending && !isLoading;
  const mutationError = mutation.error;

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setShowSavedNotice(false);
    mutation.reset();
    setSelected(event.target.value);
  };

  const handleSave = () => {
    if (!canSave || selected === null) return;
    mutation.mutate(selected);
  };

  return (
    <section
      aria-labelledby="club-ai-defaults-heading"
      className="stack"
      style={{ "--stack": "12px" } as CSSProperties}
    >
      <header>
        <h2 id="club-ai-defaults-heading" style={{ margin: 0 }}>
          AI 기본 모델 설정
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "4px 0 0" }}>
          새 세션 AI 생성에 사용할 기본 모델입니다. 호스트가 업로드 시 다른
          모델로 바꿀 수도 있습니다.
        </p>
      </header>

      {loadError ? (
        <div className="small" role="alert" style={{ color: "var(--danger)" }}>
          기본 모델 정보를 불러오지 못했습니다.
        </div>
      ) : null}

      <div>
        <label className="field-label" htmlFor="club-ai-default-model">
          기본 모델
        </label>
        <select
          id="club-ai-default-model"
          className="input"
          value={effectiveSelected}
          onChange={handleChange}
          disabled={isLoading || isPending}
          style={{ width: "100%" }}
        >
          {CLUB_AI_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={!canSave}
        >
          {isPending ? "저장 중…" : "저장"}
        </button>
        {isLoading ? (
          <span className="small" style={{ color: "var(--text-3)" }}>
            불러오는 중…
          </span>
        ) : null}
      </div>

      <div aria-live="polite" className="small" style={{ minHeight: "1.25em" }}>
        {showSavedNotice && !mutationError ? (
          <span style={{ color: "var(--text-2)" }}>
            변경 사항은 새 generation 부터 적용됩니다.
          </span>
        ) : null}
      </div>

      {mutationError ? (
        <div className="small" role="alert" style={{ color: "var(--danger)" }}>
          {mutationError instanceof Error
            ? mutationError.message
            : "기본 모델을 저장하지 못했습니다."}
        </div>
      ) : null}
    </section>
  );
}
