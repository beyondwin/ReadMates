"""Additional mobile artboards: host M12..M22 and admin AM5..AM10 (390×844)."""
from lib import AV, ME, admin_mobile_header, admin_mobile_tabbar, avatar, checkbox, icon, mobile_header, mobile_tabbar, wrap


def m(inner: str, tab: str | None = "오늘") -> str:
    return wrap(f'<div class="m-root">{inner}{mobile_tabbar(tab) if tab else ""}</div>')


def am(inner: str, tab: str | None) -> str:
    return wrap(f'<div class="m-root">{inner}{admin_mobile_tabbar(tab) if tab else ""}</div>')


def sticky(primary: str, note: str = "", tabbar: bool = False) -> str:
    return f'<div class="m-sticky-cta" style="bottom: {"64px" if tabbar else "0"}; padding-bottom: {"12px" if tabbar else "18px"};"><a class="btn btn-primary" href="#" style="width: 100%; height: 48px;">{primary}</a>{f"<p class=\"tiny\" style=\"text-align: center; margin-top: 8px;\">{note}</p>" if note else ""}</div>'


# ---------------------------------------------------------------- host
def m12_edit_meeting() -> str:
    return m(f"""
  {mobile_header("모임 수정 · No.28", "지구 끝의 온실", back="오늘", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <div class="m-tabs" style="margin-top: 0;"><span class="tab">1 책</span><span class="tab" aria-selected="true">2 일시·장소</span><span class="tab">3 보이기</span><span class="tab">4 사유</span></div>
    <div style="padding-top: 18px;" data-spec="host.meeting-form.schedule">
      <div class="field"><label>날짜</label><div class="input">2026-09-01 (월)</div></div>
      <div class="field"><label>시간</label><div class="input" style="border-color: var(--warn);">19:30</div><div class="hint tone-warn">19:00에서 바뀜 · 저장하면 3번째 일정이 돼요</div></div>
      <div class="field"><label>질문 마감 <span class="muted" style="font-weight: 400;">선택</span></label><div class="input">08-30 (토)</div></div>
      <div class="field"><label>장소</label><div class="input">을지로 북살롱</div><div class="hint">온라인이면 모임 링크와 참여 코드. 지난 링크 불러오기 가능</div></div>
    </div>
  </div>
  {sticky("다음 · 멤버에게 보이기", "바꾼 내용은 마지막 단계에서 한 번에 저장돼요")}""", None)


def m13_record_draft() -> str:
    return m(f"""
  {mobile_header("모임 기록 · 3단계", "기록 초안", back="오늘", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <p class="small" style="padding: 14px 0 10px;">출석 9명 · 소감 8편 · 마지막 저장 10:18</p>
    <div class="field"><label>제목</label><div class="input">No.28 · 지구 끝의 온실 — 온실 밖으로</div></div>
    <div class="field"><label>공개 요약</label><div class="input area" style="min-height: 72px; font-size: 14px;">더스트로 무너진 세계에서 식물과 사람이 서로를 살리는 이야기를 읽고…</div></div>
    <div class="field"><label>본문</label><div class="input area" style="min-height: 180px; font-size: 14px;"><b>함께 나눈 질문</b><br>1. 온실은 보호일까 격리일까?<br>2. 레이첼이 지수에게 보인 감정은…</div></div>
    <a class="btn btn-ghost" href="#" style="width: 100%; height: 44px;">{icon("sparkle", 16)}소감 8편으로 초안 만들기</a>
    <a class="text-link quiet" href="#" style="margin-top: 12px;">모인 소감 보기 · 미작성 4명{icon("chevron-right", 14)}</a>
  </div>
  {sticky("저장하고 다음 단계", "자동 저장돼요")}""", None)


def m14_feedback_doc() -> str:
    return m(f"""
  {mobile_header("모임 기록 · 4단계", "피드백 문서", back="오늘", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <div style="display: grid; gap: 8px; padding: 14px 0 18px;">
      <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">기록 초안에서 만들기</div><div class="small">3단계 초안을 문서로 정리해요.</div></div></div>
      <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">파일 올리기</div><div class="small">.md, .pdf</div></div></div>
    </div>
    <div class="field"><label>문서 제목</label><div class="input">No.28 피드백 · 지구 끝의 온실</div></div>
    <div class="field"><label>본문 (Markdown)</label><div class="input area" style="min-height: 160px; font-size: 14px;"># 지구 끝의 온실<br><br>함께 읽어 주셔서 고마워요. 이번 모임에서 가장 오래 머문 질문은…</div></div>
    <a class="text-link quiet" href="#">{icon("eye", 14)}멤버에게 보이는 모습 미리보기{icon("chevron-right", 14)}</a>
  </div>
  {sticky("저장하고 게시 준비")}""", None)


def m15_past_meeting() -> str:
    return m(f"""
  {mobile_header("지난 모임 · No.26", "우리가 빛의 속도로 갈 수 없다면", back="모임")}
  <div class="m-body">
    <div style="display: flex; gap: 14px; align-items: flex-start; padding: 16px 0 12px;">
      <div class="cover past" style="width: 56px; height: 56px;"></div>
      <div style="min-width: 0;"><div class="tiny">7월 정기 모임</div><div style="display: flex; align-items: center; gap: 8px; margin: 2px 0;"><h1 class="h3" style="font-size: 20px;">우리가 빛의 속도로 갈 수 없다면</h1></div><div class="state" style="font-size: 14px;"><span class="dot ok"></span><b>게시됨</b> · 7월 7일 · 7월 12일 게시</div></div>
    </div>
    <div class="m-row"><span class="circ" style="width: 26px; height: 26px; background: var(--ok-soft); color: var(--ok);">{icon("check", 12, stroke="2.6")}</span><div class="txt"><div class="a">준비 현황</div><div class="b">응답 11/12 · 질문 9개</div></div></div>
    <div class="m-row"><span class="circ" style="width: 26px; height: 26px; background: var(--ok-soft); color: var(--ok);">{icon("check", 12, stroke="2.6")}</span><div class="txt"><div class="a">당일 출석</div><div class="b">출석 11 · 불참 1</div></div><a class="text-link quiet" href="#">고치기</a></div>
    <div class="section-title" style="margin: 18px 0 8px;"><h3 class="h4">모임 기록</h3><span class="badge badge-ok">멤버 게시</span></div>
    <div data-spec="host.past-meeting.record" style="border: 1px solid var(--line); border-radius: var(--r-3); padding: 0 14px;">
      <div style="padding: 14px 0; border-bottom: 1px solid var(--line-soft);"><div class="tiny">기록 제목</div><div style="font-weight: 600; margin-top: 2px;">빛의 속도로 갈 수 없어서 남는 것들</div></div>
      <a class="m-row" href="#" style="min-height: 52px; padding: 8px 0;">{icon("notes", 18, cls="lead")}<div class="txt"><div class="a" style="font-size: 14px;">소감 11편 · 4편 인용</div></div>{icon("chevron-right", 16, cls="chev")}</a>
      <a class="m-row" href="#" style="min-height: 52px; padding: 8px 0;">{icon("document", 18, cls="lead")}<div class="txt"><div class="a" style="font-size: 14px;">피드백 문서 · 인쇄용</div></div>{icon("chevron-right", 16, cls="chev")}</a>
      <a class="m-row" href="#" style="min-height: 52px; padding: 8px 0; border-bottom: 0;">{icon("eye", 18, cls="lead")}<div class="txt"><div class="a" style="font-size: 14px;">공개 사이트 · 게시됨</div></div>{icon("chevron-right", 16, cls="chev")}</a>
    </div>
    <div style="display: flex; gap: 8px; margin-top: 14px;"><a class="btn btn-ghost" href="#" style="flex: 1; height: 44px;">{icon("edit", 16)}기록 고치기</a><a class="btn btn-quiet" href="#" style="flex: 1; height: 44px;">게시 내리기</a></div>
  </div>""", "모임")


def m16_settings_invites() -> str:
    return m(f"""
  {mobile_header("설정", "초대 링크", back="설정", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <p class="small" style="padding: 14px 0 6px;">링크로 들어온 사람은 가입 신청 상태가 되고, 멤버 페이지에서 승인해요.</p>
    <div data-spec="host.settings.invites">
      <div class="m-row"><div class="txt"><div class="a">9월 정기 초대</div><div class="b"><span class="tone-ok">활성</span> · 9월 30일까지 · 가입 5 · 대기 2</div></div><a class="btn btn-sm btn-ghost" href="#">{icon("copy", 14)}복사</a></div>
      <div class="m-row"><div class="txt"><div class="a">지인 소개용</div><div class="b"><span class="tone-warn">만료 임박</span> · 2일 남음 · 가입 3</div></div><a class="btn btn-sm btn-ghost" href="#">{icon("copy", 14)}복사</a></div>
    </div>
    <a class="text-link quiet" href="#" style="margin-top: 14px;">만료·중지된 링크 보기{icon("chevron-right", 14)}</a>
  </div>
  {sticky("새 초대 링크")}""", None)


def m17_settings_club() -> str:
    return m(f"""
  {mobile_header("설정", "클럽 설정", back="설정", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <p class="small" style="padding: 14px 0 6px;">마지막 저장 어제 21:10</p>
    <div class="field"><label>클럽 이름</label><div class="input">을지로 북살롱</div></div>
    <div class="field"><label>한 줄 소개</label><div class="input">매달 첫 월요일, 을지로에서 함께 읽어요.</div></div>
    <div class="field"><label>공개 설정</label>
      <div style="display: grid; gap: 8px;">
        <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">초대로만 가입</div><div class="small">초대 링크로 신청하고 호스트가 승인해요.</div></div></div>
        <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">공개 기록만 공개</div><div class="small">게시한 기록을 공개 사이트에 보여 줘요.</div></div></div>
      </div></div>
  </div>
  {sticky("저장", "저장하면 변경 이력에 남아요")}""", None)


def m18_settings_cohost() -> str:
    return m(f"""
  {mobile_header("설정", "공동 호스트", back="설정", right=False)}
  <div class="m-body">
    <p class="small" style="padding: 14px 0 6px;">공동 호스트는 모임·멤버·기록을 함께 운영해요. 클럽 설정과 운영 종료는 호스트만.</p>
    <div class="m-row">{avatar(ME, 30)}<div class="txt"><div class="a">김하늘</div><div class="b">호스트 · 2024년 5월</div></div></div>
    <div class="m-row">{avatar(AV[2], 30)}<div class="txt"><div class="a">최유진</div><div class="b">공동 호스트 · 7월 3일 지정</div></div><a class="text-link quiet" href="#">해제</a></div>
    <a class="btn btn-ghost" href="#" style="width: 100%; height: 44px; margin-top: 16px;">{icon("person-plus", 16)}멤버 중에서 추가</a>
  </div>""", None)


def m19_settings_history() -> str:
    rows = [("어제 21:10", "클럽 소개 문구 변경", "김하늘 · revision 4"), ("7월 3일", "최유진을 공동 호스트로 지정", "김하늘 · revision 3"), ("6월 12일", "공개 설정 · 초대로만 가입", "김하늘 · revision 2"), ("2024년 5월", "클럽 개설", "시스템 · revision 1")]
    r = "".join(f'<div class="m-row"><div class="txt"><div class="tiny">{w}</div><div class="a">{a}</div><div class="b">{b}</div></div></div>' for w, a, b in rows)
    return m(f"""
  {mobile_header("설정", "변경 이력", back="설정", right=False)}
  <div class="m-body"><p class="small" style="padding: 14px 0 0;">설정·공동 호스트 변경만 기록해요.</p><div data-spec="host.settings.history">{r}</div></div>""", None)


def m20_settings_close() -> str:
    return m(f"""
  {mobile_header("설정", "클럽 운영 종료", back="설정", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <p class="status-line" style="padding: 14px 0 16px; font-size: 15px;">종료하면 멤버는 더 이상 들어올 수 없고 새 모임을 만들 수 없어요. 게시된 기록은 공개 설정에 따라 유지돼요.</p>
    <div class="card" style="padding: 14px;"><div class="kv" style="font-size: 14px;"><span class="k">멤버</span><span>12명 — 종료 안내가 가요</span><span class="k">예정 모임</span><span class="tone-warn">2개 — 먼저 처리해야 해요</span><span class="k">게시된 기록</span><span>26편 — 유지</span></div></div>
  </div>
  <div class="m-sticky-cta" style="bottom: 0; padding-bottom: 18px;"><a class="btn btn-secondary" href="#" style="width: 100%; height: 48px; border-color: color-mix(in oklch, var(--danger), transparent 60%); color: var(--danger);">종료 확인 화면으로</a></div>""", None)


def m21_notifications() -> str:
    rows = [("오늘 09:00", "일정 안내 · 시작 시간 7:30", "4명 · 전달 4", "ok"), ("어제 19:30", "자동 리마인드 · 참석 응답 요청", "3명 · 전달 3", "ok"), ("8월 20일", "새 모임 알림 · No.28", "12명 · 전달 11 · 실패 1", "warn"), ("8월 4일", "기록 게시 알림 · No.26", "12명 · 전달 12", "ok")]
    r = "".join(f'<a class="m-row" href="#"><span class="dot {t}" style="margin: 0;"></span><div class="txt"><div class="tiny">{w}</div><div class="a">{a}</div><div class="b">{b}</div></div>{icon("chevron-right", 18, cls="chev")}</a>' for w, a, b, t in rows)
    return m(f"""
  {mobile_header("설정", "보낸 안내", back="설정", right=False)}
  <div class="m-body"><p class="small" style="padding: 14px 0 0;">이 클럽에서 나간 안내와 자동 리마인드. 내가 받은 알림은 종 아이콘에서.</p><div data-spec="host.notifications.ledger">{r}</div></div>""", None)


def m22_account_sheet() -> str:
    return m(f"""
  {mobile_header("호스트 · 오늘", "을지로 북살롱")}
  <div class="m-body" style="opacity: .35; pointer-events: none;">
    <div style="display: flex; gap: 14px; align-items: flex-start; padding: 16px 0 12px;"><div class="cover" style="width: 56px; height: 56px;"></div><div><div class="tiny">No.28 · 9월 정기 모임</div><h1 class="h3" style="font-size: 21px;">지구 끝의 온실</h1></div></div>
    <div class="todo-first" style="padding: 8px 0 16px;"><div class="t" style="font-size: 18px;">최신 일정을 아직 보지 않은 4명이 있어요</div></div>
  </div>
  <div style="position: absolute; inset: 0; background: oklch(0 0 0 / 0.35);"></div>
  <div data-spec="shell.account-sheet" style="position: absolute; left: 0; right: 0; bottom: 0; background: var(--bg); border: 1px solid var(--line); border-bottom: 0; border-radius: 20px 20px 0 0; padding: 0 12px 18px;">
    <div style="width: 36px; height: 4px; background: var(--line-strong); border-radius: 2px; margin: 10px auto 12px;"></div>
    <div class="menu-item" style="min-height: 56px;">{avatar(ME, 36)}<div><div class="name">김하늘</div><div class="meta">hanul@example.com</div></div></div>
    <div class="menu-sep"></div>
    <div class="menu-label">클럽</div>
    <div class="menu-item" aria-current="true">{avatar(AV[0], 28)}<div><div class="name">을지로 북살롱</div><div class="meta">멤버 · 호스트</div></div>{icon("check", 18, cls="end", stroke="2.2")}</div>
    <div class="menu-item">{avatar(AV[1], 28)}<div><div class="name">한강 야간 독서회</div><div class="meta">멤버</div></div>{icon("chevron-right", 18, cls="end")}</div>
    <div class="menu-sep"></div>
    <div class="menu-item">{icon("swap", 18, cls="lead")}멤버 시야로 전환</div>
    <div class="menu-item">{icon("person", 18, cls="lead")}내 프로필</div>
    <div class="menu-item">{icon("shield-check", 18, cls="lead")}플랫폼 운영{icon("chevron-right", 18, cls="end")}</div>
    <div class="menu-item">{icon("logout", 18, cls="lead")}로그아웃</div>
  </div>""", None)


HOST_MORE = [
    ("M12-EditMeeting", "⑥ 모임 수정", m12_edit_meeting),
    ("M13-RecordDraft", "⑪ 기록 초안", m13_record_draft),
    ("M14-FeedbackDoc", "⑫ 피드백 문서", m14_feedback_doc),
    ("M15-PastMeeting", "⑮ 지난 모임 상세", m15_past_meeting),
    ("M16-SettingsInvites", "설정 › 초대 링크", m16_settings_invites),
    ("M17-SettingsClub", "설정 › 클럽 설정", m17_settings_club),
    ("M18-SettingsCoHost", "설정 › 공동 호스트", m18_settings_cohost),
    ("M19-SettingsHistory", "설정 › 변경 이력", m19_settings_history),
    ("M20-SettingsClose", "설정 › 운영 종료", m20_settings_close),
    ("M21-Notifications", "설정 › 보낸 안내", m21_notifications),
    ("M22-AccountSheet", "계정·클럽 시트", m22_account_sheet),
]


# ---------------------------------------------------------------- admin mobile more
def am5_today_quiet() -> str:
    return am(f"""
  {admin_mobile_header("오늘")}
  <div class="m-body">
    <a href="#" class="banner" style="margin-top: 14px; padding: 10px 12px; border-color: var(--ok-soft); background: var(--ok-soft); color: var(--text);">{icon("check-circle", 18, style="color: var(--ok);")}<span style="font-size: 14px; flex: 1;">서비스 정상 · 확인할 일 없음</span>{icon("chevron-right", 16, style="color: var(--text-4);")}</a>
    <div class="m-title"><div class="kicker">오늘</div><h1>확인할 일이 없어요</h1><p class="small">마지막 확인 09:40 · 클럽 14곳 운영 중</p></div>
    <div class="section-title" style="margin-bottom: 0;"><h3 class="h4">최근 처리</h3><a class="text-link quiet" href="#">기록{icon("chevron-right", 14)}</a></div>
    <div class="m-row"><div class="txt"><div class="tiny">어제 18:20</div><div class="a">알림 전달 실패 6건 다시 보냄</div></div><span class="tiny tone-ok">완료</span></div>
    <div class="m-row"><div class="txt"><div class="tiny">어제 11:05</div><div class="a">한강 야간 독서회 개설 · 호스트 초대</div></div><span class="tiny tone-ok">수락됨</span></div>
    <div class="m-row"><div class="txt"><div class="tiny">9월 3일</div><div class="a">공개 기록 3건 캐시 반영</div></div><span class="tiny tone-ok">완료</span></div>
  </div>""", "오늘")


def am6_club_detail() -> str:
    return am(f"""
  {admin_mobile_header("성수 목요 독서회", back="클럽")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">클럽 · 상세</div><h1>성수 목요 독서회</h1><p class="small"><span class="badge badge-warn">설정 필요</span> 호스트 초대 대기 · 2일 전 발송</p></div>
    <div class="card" style="padding: 4px 14px; margin-bottom: 14px;" data-spec="admin.clubs.detail.info">
      <div class="m-row" style="min-height: 48px; padding: 8px 0;"><div class="txt"><div class="b">주소</div><div class="a" style="font-size: 14px;">/clubs/seongsu-thursday</div></div></div>
      <div class="m-row" style="min-height: 48px; padding: 8px 0;"><div class="txt"><div class="b">호스트</div><div class="a" style="font-size: 14px;">김서연 <span class="badge badge-warn" style="margin-left: 6px;">초대됨</span></div></div><a class="text-link" href="#">{icon("mail", 14)}다시 보내기</a></div>
      <div class="m-row" style="min-height: 48px; padding: 8px 0;"><div class="txt"><div class="b">공개 설정</div><div class="a" style="font-size: 14px;">비공개 · 초대로만 가입</div></div></div>
      <div class="m-row" style="min-height: 48px; padding: 8px 0; border-bottom: 0;"><div class="txt"><div class="b">개설</div><div class="a" style="font-size: 14px;">9월 4일 · 은영</div></div></div>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px;" data-spec="admin.clubs.detail.stats">
      <div class="card" style="padding: 12px 14px;"><div class="tiny">{icon("people", 12)} 멤버</div><div class="val" style="font-size: 22px;">0</div></div>
      <div class="card" style="padding: 12px 14px;"><div class="tiny">{icon("calendar", 12)} 모임</div><div class="val" style="font-size: 22px;">0</div></div>
      <div class="card" style="padding: 12px 14px;"><div class="tiny">{icon("document", 12)} 공개 기록</div><div class="val" style="font-size: 22px;">0</div></div>
      <div class="card" style="padding: 12px 14px;"><div class="tiny">{icon("bell", 12)} 알림 실패</div><div class="val" style="font-size: 22px;">0</div></div>
    </div>
    <div class="section-title" style="margin-bottom: 0;"><h3 class="h4">행동</h3></div>
    <a class="m-row" href="#"><span class="circ" style="width: 28px; height: 28px; background: var(--bg-deep); color: var(--text-3);">{icon("eye", 16)}</span><div class="txt"><div class="a">공개 페이지 보기</div></div>{icon("chevron-right", 18, cls="chev")}</a>
    <a class="m-row" href="#"><span class="circ" style="width: 28px; height: 28px; background: var(--bg-deep); color: var(--text-3);">{icon("history", 16)}</span><div class="txt"><div class="a">이 클럽의 처리 기록</div><div class="b">9월 4일 개설 · 초대 발송 · 지원 접근·중지는 데스크톱</div></div>{icon("chevron-right", 18, cls="chev")}</a>
  </div>""", "클럽")


def am7_records() -> str:
    rows = [("오늘 09:12", "은영 · 알림 전달 실패 6건 다시 보냄", "완료", "ok"), ("어제 11:05", "은영 · 성수 목요 독서회 개설", "초대 대기", "warn"), ("9월 3일", "자동 · 공개 기록 3건 캐시 반영", "완료", "ok"), ("9월 2일", "은영 · 을지로 북살롱 지원 접근 발급", "만료됨", ""), ("9월 1일", "은영 · 긴급 공개 회수 · 기록 1건", "완료", "ok")]
    r = "".join(f'<a class="m-row" href="#"><div class="txt"><div class="tiny">{w}</div><div class="a">{a}</div></div><span class="tiny {"tone-" + t if t else "muted"}"><span class="dot {t}"></span>{s}</span></a>' for w, a, s, t in rows)
    return am(f"""
  {admin_mobile_header("기록")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">기록</div><h1>처리 기록</h1><p class="small">이번 주 12건 · 실패 0</p></div>
    <div class="m-tabs"><span class="tab" aria-selected="true">처리 기록</span><span class="tab">분석</span></div>
    <div class="input ph" style="min-height: 40px; margin: 10px 0 4px;">{icon("search", 16)}본문만 검색</div>
    <div data-spec="admin.records.ledger">{r}</div>
  </div>""", "기록")


def am8_account_menu() -> str:
    return am(f"""
  {admin_mobile_header("오늘")}
  <div class="m-body" style="opacity: .35;"><div class="m-title"><div class="kicker">오늘</div><h1>확인할 일 3</h1></div></div>
  <div style="position: absolute; inset: 0; background: oklch(0 0 0 / 0.35);"></div>
  <div data-spec="admin.shell.account-sheet" style="position: absolute; left: 0; right: 0; bottom: 0; background: var(--bg); border: 1px solid var(--line); border-bottom: 0; border-radius: 20px 20px 0 0; padding: 0 12px 18px;">
    <div style="width: 36px; height: 4px; background: var(--line-strong); border-radius: 2px; margin: 10px auto 12px;"></div>
    <div class="menu-item" style="min-height: 56px;">{avatar(ME, 36)}<div><div class="name">김은영</div><div class="meta">플랫폼 운영자</div></div></div>
    <div class="menu-sep"></div>
    <div class="menu-item">{icon("swap", 18, cls="lead")}<div><div class="name" style="font-weight: 500;">내 클럽으로</div><div class="meta">을지로 북살롱 · 멤버 시야로 복귀</div></div>{icon("chevron-right", 18, cls="end")}</div>
    <div class="menu-sep"></div>
    <div class="menu-item" style="color: var(--danger);">{icon("alert-circle", 18, cls="lead", style="color: var(--danger);")}긴급 공개 회수</div>
    <div class="menu-item">{icon("logout", 18, cls="lead")}로그아웃</div>
  </div>""", None)


def am9_notifications() -> str:
    return am(f"""
  {admin_mobile_header("서비스 · 알림 전달", back="서비스")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">서비스</div><h1>알림 전달</h1><p class="small"><span class="dot warn"></span><b class="tone-warn">지연 1건</b> · 자동 재시도 14:20</p></div>
    <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px;">
      <div class="stat"><span class="k">발송 대기</span><span class="v" style="font-size: 20px;">3</span></div><div class="stat"><span class="k">발송 실패</span><span class="v tone-warn" style="font-size: 20px;">6</span></div><div class="stat"><span class="k">배달 대기</span><span class="v" style="font-size: 20px;">0</span></div><div class="stat"><span class="k">중계 지연</span><span class="v tone-warn" style="font-size: 20px;">2</span></div>
    </div>
    <div class="section-title" style="margin-bottom: 0;"><h3 class="h4">실패 묶음</h3></div>
    <div class="m-row"><div class="txt"><div class="a">을지로 북살롱 · 일정 변경 안내</div><div class="b"><span class="tone-warn">6건 실패</span> · 13:58 ~ 14:05 · 메일 발송 제한</div></div></div>
    <div class="m-row"><div class="txt"><div class="a">한강 야간 독서회 · 새 모임 알림</div><div class="b"><span class="tone-warn">2건 지연</span> · 14:01 · 중계 지연</div></div></div>
    <p class="info-line" style="margin-top: 14px;">{icon("info", 16)}다시 보내기는 데스크톱에서 해요. 여기서는 상태 확인만.</p>
  </div>""", "서비스")


def am10_analytics() -> str:
    kpis = [("활성 클럽", "12", "지난달 11"), ("이번 달 모임", "23", "지난달 21"), ("참석 응답률", "84%", "지난달 81%"), ("게시된 기록", "9", "지난달 8")]
    k = "".join(f'<div class="card" style="padding: 12px;"><div class="tiny">{n}</div><div class="val" style="font-size: 22px;">{v}</div><div class="tiny">{d}</div></div>' for n, v, d in kpis)
    return am(f"""
  {admin_mobile_header("기록 · 분석")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">기록</div><h1>분석 부록</h1><p class="small">정의와 가용성을 먼저, 값은 그다음</p></div>
    <div class="m-tabs"><span class="tab">처리 기록</span><span class="tab" aria-selected="true">분석</span></div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 16px;" data-spec="admin.analytics.kpis">{k}</div>
    <div class="m-row"><div class="txt"><div class="a">알림 전달 성공률</div><div class="b">7일 · 전달 / 발송</div></div><span class="val">98.7%</span></div>
    <div class="m-row"><div class="txt"><div class="a">기록 게시 소요</div><div class="b">모임일 → 게시 중앙값</div></div><span class="val">6일</span></div>
    <div class="m-row"><div class="txt"><div class="a">재방문 멤버</div><div class="b">30일 내 2회 이상 접속</div></div><span class="muted">—</span></div>
  </div>""", "기록")


ADMIN_MORE = [
    ("AM5-TodayQuiet", "오늘 · 확인할 일 없음", am5_today_quiet),
    ("AM6-ClubDetail", "클럽 › 상세", am6_club_detail),
    ("AM7-Records", "기록", am7_records),
    ("AM9-Notifications", "서비스 › 알림 전달", am9_notifications),
    ("AM10-Analytics", "기록 › 분석", am10_analytics),
    ("AM8-AccountSheet", "계정 시트 · 내 클럽으로", am8_account_menu),
]
