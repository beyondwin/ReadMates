import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BOOK_CLUB_AVATARS, type BookClubAvatarKey } from "@/shared/ui/book-club-avatar";

export type AvatarPickerProps = {
  value: BookClubAvatarKey;
  onChange: (avatarKey: BookClubAvatarKey) => void;
  disabled: boolean;
  errorId?: string;
};

export function AvatarPicker({ value, onChange, disabled, errorId }: AvatarPickerProps) {
  return (
    <div className="rm-avatar-picker__grid" role="group" aria-label="아바타 목록" aria-describedby={errorId}>
      {BOOK_CLUB_AVATARS.map(({ key, label, description }) => {
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            className="rm-avatar-picker__tile"
            aria-label={`${label}, ${description} 선택`}
            aria-pressed={selected}
            aria-describedby={errorId}
            disabled={disabled}
            onClick={() => onChange(key)}
          >
            <AvatarChip avatarKey={key} name={null} label="" size={52} />
            {selected ? <span className="rm-avatar-picker__check" aria-hidden="true"><CheckIcon /></span> : null}
          </button>
        );
      })}
    </div>
  );
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>;
}
