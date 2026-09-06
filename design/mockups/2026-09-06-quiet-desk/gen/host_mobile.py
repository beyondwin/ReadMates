"""Host mobile artboards (390×844). M01..M11."""
from lib import AV, ME, att_row, avatar, checkbox, icon, mobile_header, mobile_tabbar, wrap


def m(inner: str, tab: str | None = "오늘") -> str:
    return wrap(f'<div class="m-root">{inner}{mobile_tabbar(tab) if tab else ""}</div>')


def meeting_card(state: str, badge: str = "D-3", badge_cls: str = "badge-accent") -> str:
    return f"""
    <div style="display: flex; gap: 14px; align-items: flex-start; padding: 16px 0 12px;" data-spec="host.today.meeting-header">
      <div class="cover" style="width: 56px; height: 56px;"></div>
      <div style="min-width: 0;">
        <div class="tiny">No.28 · 9월 정기 모임</div>
        <div style="display: flex; align-items: center; gap: 8px; margin: 2px 0 2px;"><h1 class="h3" style="font-size: 21px;">지구 끝의 온실</h1><span class="badge {badge_cls}">{badge}</span></div>
        <div class="state" style="font-size: 14px;">{state}</div>
      </div>
    </div>"""


def todo_block(t: str, why: str, primary: str, secondary: str, rows: list[tuple[str, str, str, str, str]], more: str) -> str:
    r = "".join(f'<a class="todo-row" href="#" style="height: 52px;"><span class="circ" style="width: 28px; height: 28px; background: {bg}; color: {fg};">{icon(ic, 16)}</span><span class="t">{tt}</span><span class="m">{mm}</span>{icon("chevron-right", 18, cls="chev")}</a>' for ic, fg, bg, tt, mm in rows)
    sec = f'<a class="btn btn-quiet" href="#" style="width: 100%; height: 40px; margin-top: 6px;">{icon("clock", 16)}{secondary}</a>' if secondary else ""
    return f"""
    <section data-spec="host.today.todo" style="border-top: 1px solid var(--line); padding-top: 14px;">
      <div class="section-title" style="margin-bottom: 4px;"><h3 class="h4">할 일 <span class="mono" style="color: var(--accent);">4</span></h3><span class="tiny">보류 1</span></div>
      <div class="todo-first" style="padding: 8px 0 16px;">
        <div class="t" style="font-size: 18px;">{t}</div>
        <p class="why">{why}</p>
        <a class="btn btn-primary btn-lg" href="#" style="width: 100%; height: 48px;">{primary}</a>{sec}
      </div>
      {r}
      <a class="text-link quiet" href="#" style="display: inline-flex; padding: 10px 0 2px;">{more}{icon("chevron-right", 16)}</a>
    </section>"""


def m01_today_prep() -> str:
    rows = [("calendar", "현재 일정 확인", "8 / 12", "tone-warn", "변경 전 확인 1 · 아직 안 봄 3"), ("people", "참석 응답", "9 / 12", "tone-ok", "참석 7 · 불참 2 · 미응답 3"), ("notes", "발제 질문", "6개", "", "2명은 아직 작성 전")]
    r = "".join(f'<div class="m-row">{icon(ic, 20, cls="lead")}<div class="txt"><div class="a">{a}</div><div class="b">{b}</div></div><span class="v {tone}">{v}</span>{icon("chevron-right", 18, cls="chev")}</div>' for ic, a, v, tone, b in rows)
    return m(f"""
  {mobile_header("호스트 · 오늘", "을지로 북살롱")}
  <div class="m-body">
    {meeting_card(f'<span class="dot accent"></span><b>모임까지 3일</b> · 9월 1일 19:30 <span style="color: var(--accent);">{icon("edit", 14)}</span>')}
    {todo_block("최신 일정을 아직 보지 않은 4명이 있어요", "대상과 문구를 확인한 뒤 직접 보내요.", "안내 보내기", "내일 09:00까지 보류", [("person-plus", "var(--ok)", "var(--ok-soft)", "가입 승인 검토", "2명"), ("document", "var(--accent)", "var(--accent-soft)", "지난 모임 기록 작성", "No.27")], "할 일 1개 더 · 보류 1")}
    <div class="section-title" style="margin-top: 14px; margin-bottom: 4px;"><h3 class="h4">1 · 준비 현황</h3><span class="tiny">12명 기준</span></div>
    <div data-spec="host.today.prep">{r}</div>
  </div>""")


def m02_today_live() -> str:
    people = [(ME, "김하늘", "참석", "yes"), (AV[1], "정민재", "미응답", ""), (AV[2], "최유진", "참석", "yes"), (AV[3], "한지우", "참석", ""), (AV[4], "오세린", "불참", "no"), (AV[5], "윤태호", "미응답", "")]
    rows = "".join(att_row(*p) for p in people)
    return m(f"""
  {mobile_header("호스트 · 오늘", "을지로 북살롱")}
  <div class="m-body" style="padding-bottom: 150px;">
    {meeting_card('<span class="dot ok"></span><b>오늘 오후 7:30</b> · 을지로 북살롱', "오늘", "badge-ok")}
    <section data-spec="host.today.live" style="border-top: 1px solid var(--line); padding-top: 14px;">
      <div class="section-title" style="margin-bottom: 2px;"><h3 class="h4">2 · 당일 출석</h3><span class="tiny">출석 <b class="tone-ok">2</b> · 불참 1 · 미확인 3</span></div>
      <p class="small" style="margin-bottom: 4px;">누르면 바로 저장돼요. 응답과 따로 기록돼요.</p>
      <div>{rows}</div>
    </section>
  </div>
  <div class="m-sticky-cta"><div style="display: flex; gap: 8px;"><a class="btn btn-secondary" href="#" style="flex: 0 0 44px; width: 44px; height: 44px; padding: 0;">{icon("undo", 18)}</a><a class="btn btn-primary" href="#" style="flex: 1; height: 44px;">모임 마치기 → 기록 작성</a></div></div>""")


def m03_today_record() -> str:
    steps = [("done", "출석 확정", "9명"), ("current", "소감 수집", "8 / 12 · 미작성 4명"), ("todo", "기록 초안", "초안 만들기"), ("todo", "피드백 문서", "파일 또는 초안"), ("todo", "멤버에게 게시", "앞선 단계 뒤")]
    s = "".join(f'<div class="check" data-state="{st}" style="min-height: 60px; padding: 8px 0;"><span class="n" style="width: 26px; height: 26px;">{icon("check", 13, stroke="2.4") if st == "done" else i + 1}</span><div class="txt"><div class="a" style="font-size: 15px;">{a}</div><div class="b" style="font-size: 13px;">{b}</div></div>{icon("chevron-right", 18, style="color: var(--text-4);")}</div>' for i, (st, a, b) in enumerate(steps))
    return m(f"""
  {mobile_header("호스트 · 오늘", "을지로 북살롱")}
  <div class="m-body">
    {meeting_card('<span class="dot warn"></span><b>모임 끝 · 기록 작성 중</b> · 9월 1일', "D+2", "badge-warn")}
    {todo_block("소감을 아직 쓰지 않은 4명이 있어요", "마감 9월 5일까지. 안내는 한 번만 가요.", "미작성 멤버에게 안내", "", [("person-plus", "var(--ok)", "var(--ok-soft)", "가입 승인 검토", "1명")], "할 일 2개 더")}
    <div class="section-title" style="margin-top: 14px; margin-bottom: 4px;"><h3 class="h4">3 · 모임 기록</h3><span class="tiny">5단계 중 1단계 끝</span></div>
    <div data-spec="host.today.record">{s}</div>
  </div>""")


def m04_meetings() -> str:
    rows = [("29", "다음 책 미정", "9월 15일 (월) 19:30", "초안 · 나만 보여요", "accent"), ("28", "지구 끝의 온실", "9월 1일 (월) 19:30", "응답 9/12 · 준비 중", "ok")]
    past = [("27", "물고기는 존재하지 않는다", "8월 4일", "기록 작성 필요", "danger"), ("26", "우리가 빛의 속도로 갈 수 없다면", "7월 7일", "게시됨", "ok"), ("25", "아몬드", "6월 2일", "게시됨", "ok")]

    def rr(items):
        return "".join(f'<a class="m-row" href="#"><div class="txt"><div class="tiny mono">No.{n}</div><div class="a">{b}</div><div class="b">{d} · <span class="tone-{t}">{s}</span></div></div>{icon("chevron-right", 18, cls="chev")}</a>' for n, b, d, s, t in items)

    return m(f"""
  {mobile_header("호스트", "모임")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">모임</div><h1>모임 28회</h1><p class="small">예정 2 · 이번 모임 No.28</p></div>
    <div class="m-tabs"><span class="tab" aria-selected="true">예정 <span class="mono">2</span></span><span class="tab">지난 모임 <span class="mono">26</span></span></div>
    <div data-spec="host.meetings.upcoming">{rr(rows)}</div>
    <div class="section-title" style="margin-top: 18px; margin-bottom: 0;"><h3 class="h4">지난 모임</h3><a class="text-link quiet" href="#">휴지통{icon("chevron-right", 14)}</a></div>
    <div data-spec="host.meetings.past">{rr(past)}</div>
  </div>
  <a class="btn btn-primary" href="#" style="position: absolute; right: 18px; bottom: 84px; height: 48px; border-radius: 999px; padding: 0 18px; box-shadow: 0 8px 24px -8px color-mix(in oklch, var(--accent), transparent 40%);">{icon("plus", 18, stroke="2.2")}새 모임</a>""", "모임")


def m05_new_meeting() -> str:
    return m(f"""
  {mobile_header("새 모임", "새 모임 만들기", back="오늘", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <div class="m-tabs" style="margin-top: 0;"><span class="tab" aria-selected="true">1 책</span><span class="tab">2 일시·장소</span><span class="tab">3 보이기</span><span class="tab">4 확인</span></div>
    <div style="padding-top: 18px;" data-spec="host.meeting-form.book">
      <div class="field"><label>책 제목</label><div class="input">지구 끝의 온실</div></div>
      <div class="field"><label>저자</label><div class="input">김초엽</div></div>
      <div class="field"><label>모임 제목 <span class="muted" style="font-weight: 400;">선택</span></label><div class="input ph">비우면 “No.28 · 지구 끝의 온실”</div></div>
      <div style="display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 12px; align-items: start;">
        <div class="field"><label>표지 이미지 주소</label><div class="input ph">https://…</div><div class="hint">넣으면 오른쪽에 미리보기</div></div>
        <div style="display: grid; gap: 4px;"><span class="tiny">미리보기</span><div class="cover" style="width: 72px; height: 96px; border-radius: 4px; background: var(--bg-deep); border: 1px dashed var(--line-strong);"></div></div>
      </div>
    </div>
  </div>
  <div class="m-sticky-cta" style="bottom: 0; padding-bottom: 18px;"><a class="btn btn-primary" href="#" style="width: 100%; height: 48px;">다음 · 일시와 장소</a><p class="tiny" style="text-align: center; margin-top: 8px;">책과 날짜만 정해도 저장할 수 있어요</p></div>""", None)


def m06_members() -> str:
    pend = "".join(f'<div class="m-row">{avatar(a, 30)}<div class="txt"><div class="a">{n}</div><div class="b">{r}</div></div><span style="display: inline-flex; gap: 6px;"><a class="btn btn-sm btn-primary" href="#">승인</a><a class="btn btn-sm btn-quiet" href="#">거절</a></span></div>' for a, n, r in [(AV[6], "박서윤", "9월 정기 초대 · 2시간 전"), (AV[7], "이도윤", "9월 정기 초대 · 어제")])
    mem = "".join(f'<a class="m-row" href="#">{avatar(a, 30)}<div class="txt"><div class="a">{n}</div><div class="b"><span class="{t1}">{s1}</span> · <span class="{t2}">{s2}</span> · 접속 {seen}</div></div>{icon("chevron-right", 18, cls="chev")}</a>' for a, n, s1, t1, s2, t2, seen in [(ME, "김하늘", "확인", "tone-ok", "참석", "tone-ok", "오늘"), (AV[1], "정민재", "아직 안 봄", "tone-warn", "미응답", "tone-warn", "5일 전"), (AV[2], "최유진", "확인", "tone-ok", "참석", "tone-ok", "어제"), (AV[3], "한지우", "변경 전 확인", "tone-warn", "참석", "tone-ok", "3일 전")])
    return m(f"""
  {mobile_header("호스트", "멤버")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">멤버</div><h1>멤버 12명</h1><p class="small">승인 대기 <b class="tone-accent">2</b> · 일정 안 봄 <b class="tone-warn">3</b></p></div>
    <div class="section-title" style="margin-bottom: 0;"><h3 class="h4">가입 승인 대기 <span class="mono" style="color: var(--accent);">2</span></h3><a class="text-link quiet" href="#">{icon("link", 14)}초대 링크</a></div>
    <div data-spec="host.members.pending">{pend}</div>
    <div class="m-tabs" style="margin-top: 18px;"><span class="tab" aria-selected="true">전체 <span class="mono">12</span></span><span class="tab">일정 안 봄 <span class="mono">3</span></span><span class="tab">미응답 <span class="mono">3</span></span><span class="tab">쉬는 중</span></div>
    <div data-spec="host.members.ledger">{mem}</div>
  </div>""", "멤버")


def m07_person() -> str:
    return m(f"""
  {mobile_header("멤버", "정민재", back="멤버")}
  <div class="m-body">
    <div style="display: flex; gap: 14px; align-items: center; padding: 18px 0 14px;">{avatar(AV[1], 56)}<div><h1 class="h3" style="font-size: 22px;">정민재</h1><p class="small">멤버 · 8개월째 · 최근 접속 5일 전</p></div></div>
    <div class="section-title" style="margin-bottom: 0;"><h3 class="h4">이번 모임 · No.28</h3></div>
    <div data-spec="host.person.current">
      <div class="m-row"><div class="txt"><div class="b">일정 확인</div><div class="a tone-warn">3번째 일정 아직 안 봄</div></div></div>
      <div class="m-row"><div class="txt"><div class="b">참석 응답</div><div class="a tone-warn">미응답</div></div></div>
      <div class="m-row"><div class="txt"><div class="b">실제 출석</div><div class="a muted" style="font-weight: 400;">모임 당일에 기록해요</div></div></div>
    </div>
    <a class="btn btn-secondary" href="#" style="width: 100%; height: 44px; margin: 14px 0 18px; justify-content: space-between;">안내 보내기{icon("chevron-right", 16)}</a>
    <div class="section-title" style="margin-bottom: 0;"><h3 class="h4">함께한 모임</h3><span class="tiny">출석 6 / 8</span></div>
    <div data-spec="host.person.history">
      <div class="m-row"><div class="txt"><div class="tiny mono">No.27</div><div class="a">물고기는 존재하지 않는다</div></div><span class="tiny"><span class="dot ok"></span>출석</span></div>
      <div class="m-row"><div class="txt"><div class="tiny mono">No.26</div><div class="a">우리가 빛의 속도로 갈 수 없다면</div></div><span class="tiny"><span class="dot ok"></span>출석</span></div>
    </div>
    <a class="text-link quiet" href="#" style="margin-top: 14px;">멤버십 · 가입 1월 12일 · 이름 변경 · 쉬는 중으로{icon("chevron-right", 14)}</a>
  </div>""", "멤버")


def m08_records() -> str:
    rows = [("28", "지구 끝의 온실", "9월 1일", "작성 중", "warn"), ("27", "물고기는 존재하지 않는다", "8월 4일", "작성 필요", "danger"), ("26", "우리가 빛의 속도로 갈 수 없다면", "7월 7일", "게시됨", "ok"), ("25", "아몬드", "6월 2일", "게시됨", "ok"), ("24", "긴긴밤", "5월 5일", "게시됨", "ok")]
    r = "".join(f'<a class="m-row" href="#"><div class="txt"><div class="tiny mono">No.{n}</div><div class="a">{b}</div><div class="b">{d} · <span class="tone-{t}">{s}</span></div></div>{icon("chevron-right", 18, cls="chev")}</a>' for n, b, d, s, t in rows)
    return m(f"""
  {mobile_header("호스트", "기록")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">기록</div><h1>모임 기록</h1><p class="small">게시 26 · 작성 중 <b class="tone-warn">1</b> · 작성 필요 <b class="tone-danger">1</b></p></div>
    <div class="banner" style="padding: 12px 14px; margin-bottom: 8px;" data-spec="host.records.banner">{icon("alert-circle", 20, style="color: var(--warn);")}<div style="flex: 1;"><div class="t" style="font-size: 14px;">No.27 기록이 아직 없어요</div><div class="d" style="font-size: 13px;">출석 10 · 소감 10편 모임</div></div><a class="btn btn-sm btn-primary" href="#">작성</a></div>
    <div class="m-tabs"><span class="tab" aria-selected="true">전체 <span class="mono">28</span></span><span class="tab">작성 필요 <span class="mono" style="color: var(--danger);">1</span></span><span class="tab">작성 중 <span class="mono" style="color: var(--warn);">1</span></span><span class="tab">게시됨</span></div>
    <div data-spec="host.records.ledger">{r}</div>
  </div>""", "기록")


def m09_settings() -> str:
    items = [("gear", "클럽 설정", "이름 · 소개 · 공개 설정"), ("link", "초대 링크", "활성 2개 · 만료 임박 1"), ("people", "공동 호스트", "최유진 1명"), ("history", "변경 이력", "마지막 어제 21:10"), ("bell", "보낸 안내", "오늘 09:00 일정 안내 4명")]
    r = "".join(f'<a class="m-row" href="#">{icon(ic, 20, cls="lead")}<div class="txt"><div class="a">{a}</div><div class="b">{b}</div></div>{icon("chevron-right", 18, cls="chev")}</a>' for ic, a, b in items)
    return m(f"""
  {mobile_header("호스트", "설정", back="오늘")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">설정</div><h1>클럽 운영</h1></div>
    <div data-spec="host.settings.index">{r}</div>
    <a class="m-row" href="#" style="color: var(--danger);">{icon("minus-circle", 20, style="color: var(--danger);")}<div class="txt"><div class="a">클럽 운영 종료</div><div class="b">확인 뒤 처리 · 게시된 기록은 유지</div></div>{icon("chevron-right", 18, cls="chev")}</a>
  </div>""", None)


def m10_schedule_notice() -> str:
    r = "".join(f'<div class="m-row" style="min-height: 48px;">{avatar(a, 26)}<div class="txt"><div class="a" style="font-size: 14px;">{n}</div></div><span class="tiny tone-warn">{s}</span></div>' for a, n, s in [(AV[1], "정민재", "아직 안 봄"), (AV[3], "한지우", "변경 전 확인"), (AV[5], "윤태호", "아직 안 봄"), (AV[7], "이도윤", "아직 안 봄")])
    return m(f"""
  {mobile_header("할 일", "일정 안내 보내기", back="오늘", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <p class="status-line" style="padding: 16px 0 12px; font-size: 15px;">시작 시간이 <b>오후 7:00 → 7:30</b>으로 바뀌었어요. 아직 보지 않은 <b>4명</b>에게 보내요.</p>
    <div class="field"><label>제목</label><div class="input">9월 1일 모임 시간이 7:30으로 바뀌었어요</div></div>
    <div class="field"><label>본문</label><div class="input area" style="min-height: 120px; font-size: 14px;">공간 예약 시간이 조정되어 시작 시간이 오후 7:30으로 바뀌었어요. 장소는 그대로예요.</div></div>
    <div class="section-title" style="margin-bottom: 0;"><h3 class="h4">받는 사람 <span class="mono" style="color: var(--accent);">4</span></h3><a class="text-link quiet" href="#">확인한 8명{icon("chevron-right", 14)}</a></div>
    <div data-spec="host.schedule-notice.recipients">{r}</div>
  </div>
  <div class="m-sticky-cta" style="bottom: 0; padding-bottom: 18px;"><a class="btn btn-primary" href="#" style="width: 100%; height: 48px;">4명에게 보내기</a><p class="tiny" style="text-align: center; margin-top: 8px;">보내기 전까지 아무것도 발송되지 않아요 · <a href="#">내일까지 보류</a></p></div>""", None)


def m11_today_start() -> str:
    checks = [("done", "클럽 설정 확인", "어제 저장"), ("current", "초대 링크 만들기", "링크로 멤버를 모아요"), ("todo", "첫 모임 만들기", "책, 날짜, 장소")]
    c = "".join(f'<div class="check" data-state="{st}" style="min-height: 64px; padding: 10px 0;"><span class="n">{icon("check", 14, stroke="2.4") if st == "done" else i + 1}</span><div class="txt"><div class="a">{a}</div><div class="b">{b}</div></div>{icon("chevron-right", 18, style="color: var(--text-4);")}</div>' for i, (st, a, b) in enumerate(checks))
    return m(f"""
  {mobile_header("호스트 · 오늘", "을지로 북살롱")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">오늘</div><h1>클럽을 열어요</h1><p class="small">멤버 3명 · 아직 모임이 없어요</p></div>
    <div data-spec="host.today.start-checklist">{c}</div>
    <a class="btn btn-primary btn-lg" href="#" style="width: 100%; height: 48px; margin-top: 18px;">초대 링크 만들기</a>
    <p class="info-line" style="margin-top: 14px;">{icon("info", 16)}세 가지가 끝나면 이 자리에 이번 모임과 할 일이 나타나요.</p>
  </div>""")


ARTBOARDS = [
    ("M11-TodayStart", "① 오늘 · 시작 전", m11_today_start),
    ("M05-NewMeeting", "④ 새 모임", m05_new_meeting),
    ("M01-TodayPrep", "⑤ 오늘 · 준비 중", m01_today_prep),
    ("M10-ScheduleNotice", "⑦ 일정 안내 보내기", m10_schedule_notice),
    ("M02-TodayLive", "⑨ 오늘 · 당일 출석", m02_today_live),
    ("M03-TodayRecord", "⑩ 오늘 · 기록 작성", m03_today_record),
    ("M04-Meetings", "⑭ 모임", m04_meetings),
    ("M06-Members", "③ 멤버", m06_members),
    ("M07-Person", "⑧ 멤버 상세", m07_person),
    ("M08-Records", "⑬ 기록", m08_records),
    ("M09-Settings", "⑯ 설정", m09_settings),
]
