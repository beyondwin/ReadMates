import { useState } from "react";
import type { PlatformAdminClubRegistryItem } from "@/features/platform-admin/ui/platform-admin-club-registry";

type UpdatePlatformAdminClubRequest = {
  name?: string;
  tagline?: string;
  about?: string;
  publicVisibility?: "PRIVATE" | "PUBLIC";
};

type Props = {
  club: PlatformAdminClubRegistryItem | null;
  onUpdateClub?: (clubId: string, request: UpdatePlatformAdminClubRequest) => Promise<PlatformAdminClubRegistryItem>;
};

export function PlatformAdminClubDetail({ club, onUpdateClub }: Props) {
  const [draft, setDraft] = useState({ name: "", tagline: "", about: "" });
  const [saving, setSaving] = useState(false);

  if (club == null) {
    return null;
  }

  const activeDraft = draft.name === "" && draft.tagline === "" && draft.about === ""
    ? { name: club.name, tagline: club.tagline, about: club.about }
    : draft;

  async function saveInfo() {
    if (club == null || onUpdateClub == null) {
      return;
    }
    setSaving(true);
    try {
      const updated = await onUpdateClub(club.clubId, activeDraft);
      setDraft({ name: updated.name, tagline: updated.tagline, about: updated.about });
    } finally {
      setSaving(false);
    }
  }

  async function setVisibility(publicVisibility: "PRIVATE" | "PUBLIC") {
    if (onUpdateClub == null) {
      return;
    }
    setSaving(true);
    try {
      await onUpdateClub(club.clubId, { publicVisibility });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="platform-admin-detail" aria-labelledby="platform-admin-club-detail-title">
      <div>
        <p className="eyebrow">Club detail</p>
        <h3 id="platform-admin-club-detail-title" className="h4 editorial">
          공개 정보
        </h3>
      </div>

      <div className="platform-admin-detail__grid">
        <label className="field-group">
          <span className="label">클럽 이름</span>
          <input
            className="input"
            value={activeDraft.name}
            onChange={(event) => setDraft({ ...activeDraft, name: event.target.value })}
          />
        </label>
        <label className="field-group">
          <span className="label">Tagline</span>
          <input
            className="input"
            value={activeDraft.tagline}
            onChange={(event) => setDraft({ ...activeDraft, tagline: event.target.value })}
          />
        </label>
        <label className="field-group platform-admin-detail__about">
          <span className="label">About</span>
          <textarea
            className="input"
            value={activeDraft.about}
            onChange={(event) => setDraft({ ...activeDraft, about: event.target.value })}
          />
        </label>
      </div>

      <div className="platform-admin-detail__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={saveInfo} disabled={saving}>
          공개 정보 저장
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setVisibility("PUBLIC")} disabled={saving}>
          공개
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVisibility("PRIVATE")} disabled={saving}>
          비공개
        </button>
      </div>
    </section>
  );
}
