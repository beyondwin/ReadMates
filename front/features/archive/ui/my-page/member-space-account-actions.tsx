import type { ReactElement, ReactNode } from "react";

export function MemberSpaceAccountActions({ logoutControl }: { logoutControl: ReactNode }): ReactElement {
  return (
    <section className="rm-member-space-account-actions" aria-labelledby="member-space-account-heading">
      <div>
        <h2 id="member-space-account-heading">계정</h2>
        <p>현재 기기에서 ReadMates 사용을 마칩니다.</p>
      </div>
      <div className="rm-member-space-account-actions__control">{logoutControl}</div>
    </section>
  );
}
