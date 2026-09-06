"""Host desktop artboards (1440 wide). Journey order D01..D21."""
from lib import (AV, ME, TODO_ROWS_PREP, att_row, avatar, back_bar, checkbox, desktop_header, icon,
                 meeting_ctx, meeting_head, page_header, prep_rows, todo_rail, wrap)


def frame(inner: str, h: int) -> str:
    return f'<div class="frame" style="min-height: {h}px;">{inner}</div>'


# D01 ------------------------------------------------------------- 오늘 · 시작 전
def d01_today_start() -> str:
    checks = [
        ("done", "클럽 설정 확인", "이름 · 공개 설정 · 소개 — 어제 저장", "설정 보기"),
        ("current", "초대 링크 만들기", "링크를 만들어 멤버에게 보내요. 가입 신청은 멤버 페이지에 모여요.", "초대 링크 만들기"),
        ("todo", "첫 모임 만들기", "책, 날짜, 장소만 정하면 오늘 화면이 채워져요.", "새 모임"),
    ]
    c = "".join(
        f'<div class="check" data-state="{st}"><span class="n">{icon("check", 14, stroke="2.4") if st == "done" else i + 1}</span>'
        f'<div class="txt"><div class="a">{a}</div><div class="b">{b}</div></div>'
        f'<a class="{"btn btn-primary" if st == "current" else "text-link quiet"}" href="#">{act}{"" if st == "current" else icon("chevron-right", 16)}</a></div>'
        for i, (st, a, b, act) in enumerate(checks)
    )
    return wrap(frame(f"""
  {desktop_header("host", "오늘")}
  <main class="page">
    {page_header("오늘", "클럽을 열어요", "멤버 <b>3명</b> · 아직 모임이 없어요", "", "host.today.start")}
    <div class="two-col">
      <div class="main"><div data-spec="host.today.start-checklist">{c}</div>
        <p class="info-line" style="margin-top: 16px;">{icon("info", 16)}세 가지가 끝나면 이 자리에 이번 모임과 할 일이 나타나요.</p></div>
      <aside class="rail">
        <div class="section-title"><h3 class="h3">멤버</h3><a class="text-link quiet" href="#">멤버 보기{icon("chevron-right", 16)}</a></div>
        <div class="todo-row">{avatar(ME, 28)}<span class="t">김하늘 <span class="muted" style="font-weight: 400;">· 호스트</span></span></div>
        <div class="todo-row">{avatar(AV[1], 28)}<span class="t">정민재</span><span class="m">어제 가입</span></div>
        <div class="todo-row">{avatar(AV[2], 28)}<span class="t">최유진</span><span class="m">어제 가입</span></div>
      </aside>
    </div>
  </main>""", 720))


# settings pages ---------------------------------------------------
SETTINGS_INDEX = ["클럽 설정", "초대 링크", "공동 호스트", "변경 이력", "운영 종료"]


def settings_page(active: str, content: str, h: int = 900) -> str:
    side = "".join(f'<a href="#"{" aria-current=\"true\"" if s == active else ""}>{s}</a>' for s in SETTINGS_INDEX)
    return wrap(frame(f"""
  {desktop_header("host", "", settings_current=True)}
  <main class="page">
    {page_header("설정", "클럽 운영", "초대 링크 <b>2개</b> 활성 · 공동 호스트 <b>1명</b>", "", "host.settings.header")}
    <div style="display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 48px;">
      <nav class="side-index" data-spec="host.settings.index">{side}</nav>
      <section style="max-width: 880px;">{content}</section>
    </div>
  </main>""", h))


def d02_settings_invites() -> str:
    rows = [("9월 정기 초대", "활성", "tone-ok", "9월 30일까지", "가입 5 · 대기 2"), ("지인 소개용", "만료 임박", "tone-warn", "2일 남음", "가입 3")]
    r = "".join(
        f'<tr><td style="font-weight: 600;">{n}</td><td><span class="val {t}" style="font-weight: 500;">{s}</span></td><td class="detail">{e}</td><td class="detail">{j}</td>'
        f'<td><span style="display: inline-flex; gap: 14px; justify-content: flex-end;"><a class="text-link" href="#">{icon("copy", 16)}복사</a><a class="text-link quiet" href="#">관리{icon("chevron-right", 16)}</a></span></td></tr>'
        for n, s, t, e, j in rows
    )
    return settings_page("초대 링크", f"""
        <div class="section-title" style="margin-bottom: 4px;"><h2 class="h3">초대 링크</h2><a class="btn btn-primary" href="#">{icon("plus", 16, stroke="2.2")}새 초대 링크</a></div>
        <p class="small" style="margin-bottom: 16px;">링크로 들어온 사람은 가입 신청 상태가 되고, 멤버 페이지에서 승인해요.</p>
        <table class="ledger" data-spec="host.settings.invites"><thead><tr><th>이름</th><th>상태</th><th>만료</th><th>가입</th><th style="width: 22%;">관리</th></tr></thead><tbody>{r}</tbody></table>
        <div class="rail-foot" style="justify-content: flex-start; gap: 20px;"><a class="text-link quiet" href="#">만료·중지된 링크 보기{icon("chevron-right", 16)}</a><span>{icon("history", 14)} 어제 14:02 지인 소개용 링크 만듦</span></div>""")


def d16_settings_club() -> str:
    return settings_page("클럽 설정", f"""
        <div class="section-title" style="margin-bottom: 16px;"><h2 class="h3">클럽 설정</h2><span class="small">마지막 저장 어제 21:10 · revision 4</span></div>
        <div class="field"><label>클럽 이름</label><div class="input">을지로 북살롱</div></div>
        <div class="field"><label>한 줄 소개</label><div class="input">매달 첫 월요일, 을지로에서 함께 읽어요.</div></div>
        <div class="field"><label>공개 설정</label>
          <div style="display: grid; gap: 8px;">
            <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">초대로만 가입</div><div class="small">초대 링크로 신청하고 호스트가 승인해요.</div></div></div>
            <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">공개 기록만 공개</div><div class="small">게시한 기록을 공개 사이트에 보여 줘요. 가입은 초대로만.</div></div></div>
          </div></div>
        <div class="actions" style="padding-top: 6px;"><a class="btn btn-primary" href="#">저장</a><span class="small">저장하면 변경 이력에 남아요.</span></div>""")


def d17_settings_cohost() -> str:
    return settings_page("공동 호스트", f"""
        <div class="section-title" style="margin-bottom: 4px;"><h2 class="h3">공동 호스트</h2><a class="btn btn-ghost" href="#">{icon("person-plus", 16)}멤버 중에서 추가</a></div>
        <p class="small" style="margin-bottom: 16px;">공동 호스트는 모임·멤버·기록을 함께 운영해요. 클럽 설정과 운영 종료는 호스트만 할 수 있어요.</p>
        <table class="ledger" data-spec="host.settings.cohost"><thead><tr><th>멤버</th><th>역할</th><th>지정</th><th style="width: 18%;">관리</th></tr></thead><tbody>
          <tr><td><span class="cell-icon">{avatar(ME, 28)}<b>김하늘</b></span></td><td class="detail">호스트</td><td class="detail">2024년 5월</td><td><span class="muted">—</span></td></tr>
          <tr><td><span class="cell-icon">{avatar(AV[2], 28)}<b>최유진</b></span></td><td class="detail">공동 호스트</td><td class="detail">7월 3일 · 김하늘</td><td><a class="text-link quiet" href="#">해제{icon("chevron-right", 16)}</a></td></tr>
        </tbody></table>
        <p class="info-line" style="margin-top: 16px;">{icon("info", 16)}지정과 해제는 변경 이력에 남고 상대에게 알림이 가요.</p>""")


def d18_settings_history() -> str:
    rows = [("어제 21:10", "김하늘", "클럽 소개 문구 변경", "revision 4"), ("7월 3일", "김하늘", "최유진을 공동 호스트로 지정", "revision 3"), ("6월 12일", "김하늘", "공개 설정 · 초대로만 가입", "revision 2"), ("2024년 5월", "시스템", "클럽 개설", "revision 1")]
    r = "".join(f'<tr><td class="detail">{w}</td><td class="detail">{who}</td><td>{what}</td><td class="mono muted" style="font-size: 13px;">{rev}</td></tr>' for w, who, what, rev in rows)
    return settings_page("변경 이력", f"""
        <div class="section-title" style="margin-bottom: 12px;"><h2 class="h3">변경 이력</h2><span class="small">설정·공동 호스트 변경만 기록해요</span></div>
        <table class="ledger" data-spec="host.settings.history"><thead><tr><th style="width: 18%;">시각</th><th style="width: 14%;">누가</th><th>무엇을</th><th style="width: 14%;">버전</th></tr></thead><tbody>{r}</tbody></table>""")


def d19_settings_close() -> str:
    return settings_page("운영 종료", f"""
        <div class="section-title" style="margin-bottom: 8px;"><h2 class="h3">클럽 운영 종료</h2></div>
        <p class="status-line" style="margin-bottom: 20px;">종료하면 멤버는 더 이상 들어올 수 없고 새 모임을 만들 수 없어요. 게시된 기록은 공개 설정에 따라 유지돼요. 실제 종료는 확인 뒤에 처리돼요.</p>
        <div class="card" data-spec="host.settings.close" style="max-width: 640px;">
          <div class="kv" style="margin-bottom: 18px;">
            <span class="k">멤버</span><span>12명 — 종료 안내가 가요</span>
            <span class="k">예정 모임</span><span class="tone-warn">2개 — 먼저 지우거나 끝내야 해요</span>
            <span class="k">게시된 기록</span><span>26편 — 유지</span>
          </div>
          <a class="btn btn-secondary" href="#" style="border-color: color-mix(in oklch, var(--danger), transparent 60%); color: var(--danger);">종료 확인 화면으로</a>
        </div>""")


# D03 ------------------------------------------------------------- 멤버
def d03_members() -> str:
    pending = [(AV[6], "박서윤", "9월 정기 초대", "2시간 전"), (AV[7], "이도윤", "9월 정기 초대", "어제")]
    p = "".join(
        f'<tr><td><span class="cell-icon">{avatar(a, 28)}<b>{n}</b></span></td><td class="detail">{r}</td><td class="detail">{t}</td>'
        f'<td><span style="display: inline-flex; gap: 8px; justify-content: flex-end;"><a class="btn btn-sm btn-primary" href="#">승인</a><a class="btn btn-sm btn-quiet" href="#">거절</a></span></td></tr>'
        for a, n, r, t in pending
    )
    members = [
        (ME, "김하늘", "호스트", "확인", "tone-ok", "참석", "tone-ok", "오늘", "1년 2개월"),
        (AV[1], "정민재", "멤버", "아직 안 봄", "tone-warn", "미응답", "tone-warn", "5일 전", "8개월"),
        (AV[2], "최유진", "공동 호스트", "확인", "tone-ok", "참석", "tone-ok", "어제", "8개월"),
        (AV[3], "한지우", "멤버", "변경 전 확인", "tone-warn", "참석", "tone-ok", "3일 전", "5개월"),
        (AV[4], "오세린", "멤버", "확인", "tone-ok", "불참", "", "오늘", "5개월"),
        (AV[5], "윤태호", "멤버", "멤버", "아직 안 봄", "tone-warn", "미응답", "tone-warn", "2주 전"),
    ]
    m = ""
    for row in members:
        if len(row) == 9:
            a, n, role, s1, t1, s2, t2, seen, ten = row
        else:
            a, n, role, _, s1, t1, s2, t2, seen = row
            ten = "2개월"
        m += (f'<tr><td><span class="cell-icon">{avatar(a, 28)}<b>{n}</b></span></td><td class="detail">{role}</td>'
              f'<td><span class="{t1}" style="font-weight: 500;">{s1}</span></td><td><span class="{t2}" style="font-weight: 500;">{s2}</span></td>'
              f'<td class="detail">{seen}</td><td class="detail">{ten}</td><td><a class="text-link quiet" href="#">열기{icon("chevron-right", 16)}</a></td></tr>')
    return wrap(frame(f"""
  {desktop_header("host", "멤버")}
  <main class="page">
    {page_header("멤버", "멤버 12명", '승인 대기 <b class="tone-accent">2명</b> · 최신 일정 아직 안 본 멤버 <b class="tone-warn">3명</b>', f'<a class="btn btn-ghost" href="#">{icon("link", 18)}초대 링크</a>', "host.members.header")}
    <div class="two-col">
      <div class="main">
        <section data-spec="host.members.pending" style="padding: 4px 0 28px;">
          <div class="section-title"><h3 class="h3">가입 승인 대기 <span class="mono" style="color: var(--accent); font-size: 17px;">2</span></h3><span class="small">승인하면 바로 이번 모임 일정을 볼 수 있어요</span></div>
          <table class="ledger"><thead><tr><th style="width: 34%;">신청자</th><th>초대 링크</th><th style="width: 18%;">신청</th><th style="width: 18%;">처리</th></tr></thead><tbody>{p}</tbody></table>
        </section>
        <section data-spec="host.members.ledger">
          <div class="tabs" style="margin-bottom: 8px;">
            <span class="tab" aria-selected="true">전체 <span class="mono">12</span></span><span class="tab">일정 안 봄 <span class="mono">3</span></span><span class="tab">미응답 <span class="mono">3</span></span><span class="tab">쉬는 중 <span class="mono">1</span></span>
            <span style="margin-left: auto; display: inline-flex; align-items: center; gap: 8px; color: var(--text-3); font-size: 14px;">{icon("search", 18)}이름 찾기</span>
          </div>
          <table class="ledger"><thead><tr><th style="width: 24%;">멤버</th><th>역할</th><th>최신 일정</th><th>참석 응답</th><th>최근 접속</th><th>함께한 기간</th><th style="width: 9%;">관리</th></tr></thead><tbody>{m}</tbody></table>
          <div class="rail-foot" style="justify-content: flex-start; gap: 24px;">총 12명<a class="text-link quiet" href="#">쉬는 중·나간 멤버 보기{icon("chevron-right", 16)}</a></div>
        </section>
      </div>
      <aside class="rail" data-spec="host.members.schedule-rail">
        <div class="section-title"><h3 class="h3">현재 일정 확인</h3><span class="small">No.28 · 3번째 일정</span></div>
        <div class="todo-row"><span class="circ" style="background: var(--ok-soft); color: var(--ok);">{icon("check-circle", 18)}</span><span class="t">최신 일정 확인</span><span class="val">8명</span></div>
        <div class="todo-row"><span class="circ" style="background: var(--warn-soft); color: var(--warn);">{icon("history", 18)}</span><span class="t">변경 전 일정만 확인</span><span class="val tone-warn">1명</span></div>
        <div class="todo-row"><span class="circ" style="background: var(--warn-soft); color: var(--warn);">{icon("alert-circle", 18)}</span><span class="t">아직 안 봄</span><span class="val tone-warn">3명</span></div>
        <div class="todo-row" style="border-bottom: 0;"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">{icon("people", 18)}</span><span class="t">대상</span><span class="val">12명</span></div>
        <div style="padding-top: 16px; display: grid; gap: 12px;">
          <a class="btn btn-secondary" href="#" style="justify-content: space-between;">안 본 멤버에게 안내 보내기{icon("chevron-right", 16)}</a>
          <p class="info-line">{icon("info", 16)}일정 확인은 접속·참석 응답·실제 출석과 따로 기록해요.</p>
        </div>
      </aside>
    </div>
  </main>""", 960))


# D04 / D06 --------------------------------------------------------- 새 모임 / 모임 수정
def meeting_form(edit: bool) -> str:
    idx = ["책과 제목", "일시와 장소", "멤버에게 보이기", "저장 전 확인"] if not edit else ["책과 제목", "일시와 장소", "멤버에게 보이기", "변경 사유와 알림"]
    side = "".join(f'<a href="#"{" aria-current=\"true\"" if i == (1 if edit else 0) else ""}><span class="n">{i + 1}</span>{s}</a>' for i, s in enumerate(idx))
    title = "모임 수정" if edit else "새 모임 만들기"
    lede = "바꾼 내용은 저장할 때 한 번에 반영되고, 일정이 바뀌면 멤버에게 알릴지 정해요." if edit else "책과 날짜만 정해도 저장할 수 있어요. 나머지는 나중에 채워도 돼요."
    cover_field = f"""
          <div style="display: grid; grid-template-columns: minmax(0, 1fr) 96px; gap: 16px; align-items: start;">
            <div class="field"><label>표지 이미지 주소 <span class="muted" style="font-weight: 400;">선택</span></label><div class="input{"" if edit else " ph"}">{"https://…/greenhouse.jpg" if edit else "https://…"}</div><div class="hint">주소를 넣으면 오른쪽에 미리보기가 떠요. 비우면 책 제목으로 표지를 만들어요.</div></div>
            <div data-spec="host.meeting-form.cover-preview" style="display: grid; gap: 4px;"><span class="tiny">미리보기</span><div class="cover" style="width: 96px; height: 128px; border-radius: 4px;{"" if edit else " background: var(--bg-deep); border: 1px dashed var(--line-strong);"}"></div></div>
          </div>"""
    right = f"""
      <aside class="summary-card" data-spec="host.meeting-form.review">
        <h3 class="h4" style="margin-bottom: 12px;">4 · {"변경 사유와 알림" if edit else "저장 전 확인"}</h3>
        {"" if not edit else '<div class="field"><label>변경 사유</label><div class="input">공간 예약 시간 조정</div></div><div class="field"><label>설명 <span class="muted" style="font-weight: 400;">선택</span></label><div class="input ph">멤버에게 보이는 한 줄</div></div>'}
        <div style="display: grid; gap: 10px;">
          <div class="row"><span class="k">회차</span><b>No.28</b></div>
          <div class="row"><span class="k">책</span><b>지구 끝의 온실</b></div>
          <div class="row"><span class="k">일시</span><b>{"9월 1일 (월) 19:30 <span class='tone-warn'>← 19:00</span>" if edit else "9월 1일 (월) 19:30"}</b></div>
          <div class="row"><span class="k">장소</span><b>을지로 북살롱</b></div>
          <div class="row"><span class="k">보이기</span><b class="tone-ok">{"공개됨" if edit else "저장 즉시 공개"}</b></div>
        </div>
        <a class="btn btn-primary btn-lg" href="#" style="width: 100%; margin-top: 20px;">{"저장하고 안내 보낼지 정하기" if edit else "저장하고 오늘로"}</a>
        <p class="info-line" style="margin-top: 12px;">{icon("info", 16)}{"일정이 바뀌면 저장 뒤 '일정 안내 보내기'로 이어져요. 자동 발송은 없어요." if not edit else "저장하면 3번째 일정이 돼요. 그다음 화면에서 아직 안 본 멤버에게 안내를 보낼 수 있어요."}</p>
      </aside>"""
    body = f"""
  {desktop_header("host", "" if not edit else "오늘")}
  <main class="page">
    {back_bar("오늘", meeting_ctx() if edit else "", "" if not edit else "변경 이력 3건")}
    {page_header("모임 수정" if edit else "새 모임", title, lede, "", "host.meeting-form.header")}
    <div style="display: grid; grid-template-columns: 200px minmax(0, 1fr) 320px; gap: 48px;">
      <nav class="side-index" data-spec="host.meeting-form.index">{side}</nav>
      <div style="max-width: 720px;">
        <section class="form-sec" style="padding-top: 0;" data-spec="host.meeting-form.book">
          <h2>1 · 책과 제목</h2>
          <div class="field"><label>책 제목</label><div class="input">지구 끝의 온실</div></div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="field"><label>저자</label><div class="input">김초엽</div></div>
            <div class="field"><label>모임 제목 <span class="muted" style="font-weight: 400;">선택</span></label><div class="input{"" if edit else " ph"}">{"9월 정기 모임" if edit else "비우면 “No.28 · 지구 끝의 온실”"}</div></div>
          </div>
          <div class="field"><label>책 링크 <span class="muted" style="font-weight: 400;">선택</span></label><div class="input ph">https://…</div></div>
          {cover_field}
        </section>
        <section class="form-sec" data-spec="host.meeting-form.schedule">
          <h2>2 · 일시와 장소</h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
            <div class="field"><label>날짜</label><div class="input">2026-09-01 (월)</div></div>
            <div class="field"><label>시간</label><div class="input"{"" if not edit else ' style="border-color: var(--warn);"'}>19:30</div>{"" if not edit else '<div class="hint tone-warn">19:00에서 바뀜</div>'}</div>
            <div class="field"><label>질문 마감 <span class="muted" style="font-weight: 400;">선택</span></label><div class="input">08-30 (토)</div></div>
          </div>
          <div class="field"><label>장소</label><div class="input">을지로 북살롱</div><div class="hint">온라인이면 모임 링크와 참여 코드를 적어요. 지난 온라인 모임 링크를 불러올 수 있어요.</div></div>
        </section>
        <section class="form-sec" data-spec="host.meeting-form.audience">
          <h2>3 · 멤버에게 보이기</h2>
          <div style="display: grid; gap: 8px;">
            <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">{"멤버에게 공개 (현재)" if edit else "저장하면 바로 멤버에게 보이기"}</div><div class="small">멤버 오늘 화면에 이번 모임으로 표시되고 참석 응답을 받아요.</div></div></div>
            <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">초안으로 두기</div><div class="small">나만 볼 수 있어요. 준비가 되면 오늘 화면에서 공개해요.</div></div></div>
          </div>
        </section>
      </div>
      {right}
    </div>
  </main>"""
    return wrap(frame(body, 1040))


def d04_new_meeting() -> str:
    return meeting_form(False)


def d06_edit_meeting() -> str:
    return meeting_form(True)


# D05 ------------------------------------------------------------- 오늘 · 준비
def sections_prep() -> str:
    return f"""
        <section class="sec" data-state="current" data-spec="host.today.prep">
          <div class="sec-head"><span class="ttl"><span class="n">1</span><h3 class="h3">준비 현황</h3></span><span class="small">12명 기준</span></div>
          <table class="ledger" style="margin-top: 14px;"><thead><tr><th style="width: 30%;">항목</th><th style="width: 14%;">현황</th><th>세부 내용</th><th style="width: 14%;">관리</th></tr></thead><tbody>{prep_rows()}</tbody></table>
        </section>
        <section class="sec" data-state="todo" data-spec="host.today.live">
          <div class="sec-head"><span class="ttl"><span class="n">2</span><h3 class="h3">당일 출석</h3></span><span class="sum">9월 1일 모임 당일에 열려요 · 참석 예정 7명 <a class="text-link quiet" href="#">미리 보기 ›</a></span></div>
        </section>
        <section class="sec" data-state="todo" style="border-bottom: 0;" data-spec="host.today.record">
          <div class="sec-head"><span class="ttl"><span class="n">3</span><h3 class="h3">모임 기록</h3></span><span class="sum">모임이 끝나면 기록을 작성해요</span></div>
        </section>"""


def d05_today_prep() -> str:
    return wrap(frame(f"""
  {desktop_header("host", "오늘")}
  <main class="page">
    {meeting_head('<span class="dot accent"></span><b>모임까지 3일</b><span>·</span>멤버에게 공개됨<span>·</span>다음 모임 <a href="#" class="text-link" style="font-weight: 400;">9월 15일 ›</a>')}
    <div class="two-col" style="border-top: 1px solid var(--line);">
      <div class="main">{sections_prep()}</div>
      <div class="rail" style="padding-top: 20px;">{todo_rail(("최신 일정을 아직 보지 않은 4명이 있어요", "대상과 문구를 확인한 뒤 직접 보내요. 자동으로 발송하지 않아요.", "안내 보내기", "내일 09:00까지 보류"), TODO_ROWS_PREP)}</div>
    </div>
  </main>""", 960))


# D07 ------------------------------------------------------------- 일정 안내 보내기 (간소화)
def d07_schedule_notice() -> str:
    recips = [(AV[1], "정민재", "아직 안 봄", "5일 전"), (AV[3], "한지우", "변경 전 확인", "3일 전"), (AV[5], "윤태호", "아직 안 봄", "2주 전"), (AV[7], "이도윤", "아직 안 봄", "어제 가입")]
    r = "".join(f'<div class="todo-row" style="height: 52px;">{avatar(a, 28)}<span class="t">{n}</span><span class="m tone-warn">{s}</span><span class="m">{seen}</span></div>' for a, n, s, seen in recips)
    return wrap(frame(f"""
  {desktop_header("host", "오늘")}
  <main class="page">
    {back_bar("오늘", meeting_ctx(), "보내기 전까지 아무것도 발송되지 않아요")}
    {page_header("할 일", "일정 안내 보내기", "시작 시간이 <b>오후 7:00 → 7:30</b>으로 바뀌었어요. 아직 보지 않은 <b>4명</b>에게 보내요.", "", "host.schedule-notice.header")}
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 64px; max-width: 1100px;">
      <section data-spec="host.schedule-notice.composer">
        <div class="field"><label>제목</label><div class="input">9월 1일 모임 시간이 7:30으로 바뀌었어요</div></div>
        <div class="field"><label>본문</label><div class="input area" style="min-height: 150px;">공간 예약 시간이 조정되어 시작 시간이 오후 7:00에서 7:30으로 바뀌었어요. 장소는 그대로 을지로 북살롱이에요. 일정을 한 번 확인해 주세요.</div><div class="hint" style="text-align: right;">104 / 140</div></div>
        <div class="actions" style="gap: 12px;"><a class="btn btn-primary btn-lg" href="#">4명에게 보내기</a><a class="btn btn-quiet" href="#">{icon("clock", 16)}내일 09:00까지 보류</a><a class="btn btn-quiet" href="#">취소하고 오늘로</a></div>
        <p class="info-line" style="margin-top: 16px;">{icon("info", 16)}보낸 뒤 이 할 일은 사라지고 변경 이력에 남아요. 같은 안내는 두 번 가지 않아요.</p>
      </section>
      <aside data-spec="host.schedule-notice.recipients">
        <div class="section-title"><h3 class="h4">받는 사람 <span class="mono" style="color: var(--accent);">4</span></h3><a class="text-link quiet" href="#">이미 확인한 8명{icon("chevron-right", 16)}</a></div>
        {r}
        <div class="rail-foot">{icon("history", 14)} 이전 안내 · 8월 20일 일정 공개 12명</div>
      </aside>
    </div>
  </main>""", 800))


# D08 ------------------------------------------------------------- 멤버 상세
def d08_person() -> str:
    return wrap(frame(f"""
  {desktop_header("host", "멤버")}
  <main class="page">
    {back_bar("멤버", "", "")}
    <div class="page-header" data-spec="host.person.header" style="align-items: center;">
      <div style="display: flex; gap: 20px; align-items: center;">{avatar(AV[1], 72)}<div>
        <div class="kicker">멤버 · 8개월째</div>
        <h1 class="h2" style="margin: 2px 0 6px;">정민재</h1>
        <p class="status-line"><span class="dot warn"></span>최신 일정 <b class="tone-warn">아직 안 봄</b> · 참석 응답 <b class="tone-warn">미응답</b> · 최근 접속 5일 전</p></div></div>
      <div class="actions"><a class="btn btn-ghost" href="#">{icon("edit", 16)}이름 변경</a><a class="btn btn-ghost" href="#">{icon("more", 18)}</a></div>
    </div>
    <div class="two-col">
      <div class="main">
        <section class="sec" style="padding-top: 0;" data-spec="host.person.current">
          <div class="section-title"><h3 class="h3">이번 모임 · No.28</h3><a class="text-link" href="#">안내 보내기{icon("chevron-right", 16)}</a></div>
          <table class="ledger"><tbody>
            <tr><td class="detail" style="width: 24%;">최근 접속</td><td>5일 전 · 노트 화면</td></tr>
            <tr><td class="detail">일정 확인</td><td><span class="tone-warn" style="font-weight: 500;">3번째 일정 아직 안 봄</span> · 2번째 일정은 8월 21일 확인</td></tr>
            <tr><td class="detail">참석 응답</td><td><span class="tone-warn" style="font-weight: 500;">미응답</span></td></tr>
            <tr><td class="detail">실제 출석</td><td class="muted">모임 당일에 기록해요</td></tr>
          </tbody></table>
        </section>
        <section class="sec" style="border-bottom: 0;" data-spec="host.person.history">
          <div class="section-title"><h3 class="h3">함께한 모임</h3><span class="small">출석 6 / 8</span></div>
          <table class="ledger"><tbody>
            <tr><td class="mono muted" style="width: 12%;">No.27</td><td>물고기는 존재하지 않는다</td><td class="detail">8월 4일</td><td><span class="dot ok"></span>출석 · 소감 작성</td></tr>
            <tr><td class="mono muted">No.26</td><td>우리가 빛의 속도로 갈 수 없다면</td><td class="detail">7월 7일</td><td><span class="dot ok"></span>출석</td></tr>
            <tr><td class="mono muted">No.25</td><td>아몬드</td><td class="detail">6월 2일</td><td><span class="dot danger"></span>불참 응답</td></tr>
          </tbody></table>
        </section>
      </div>
      <aside class="rail" data-spec="host.person.membership">
        <div class="section-title"><h3 class="h3">멤버십</h3></div>
        <div class="kv" style="margin-bottom: 20px;">
          <span class="k">가입</span><span>1월 12일 · 지인 소개용 링크</span>
          <span class="k">승인</span><span>1월 12일 · 김하늘</span>
          <span class="k">상태</span><span>활성</span>
        </div>
        <div style="display: grid; gap: 8px;">
          <a class="btn btn-secondary" href="#" style="justify-content: space-between;">쉬는 중으로 바꾸기{icon("chevron-right", 16)}</a>
          <a class="btn btn-quiet" href="#" style="justify-content: space-between; color: var(--danger);">클럽에서 내보내기{icon("chevron-right", 16)}</a>
        </div>
        <p class="info-line" style="margin-top: 14px;">{icon("info", 16)}멤버의 노트와 소감 내용은 여기서 보지 않아요.</p>
      </aside>
    </div>
  </main>""", 900))


# D09 ------------------------------------------------------------- 오늘 · 당일 (데스크톱)
def d09_today_live() -> str:
    people = [(ME, "김하늘", "참석", "yes"), (AV[1], "정민재", "미응답", ""), (AV[2], "최유진", "참석", "yes"), (AV[3], "한지우", "참석", ""), (AV[4], "오세린", "불참", "no"), (AV[5], "윤태호", "미응답", ""), (AV[6], "박서윤", "참석", "")]
    rows = "".join(att_row(*p) for p in people)
    return wrap(frame(f"""
  {desktop_header("host", "오늘")}
  <main class="page">
    {meeting_head('<span class="dot ok"></span><b>오늘 오후 7:30</b><span>·</span>을지로 북살롱<span>·</span>참석 예정 7명', "오늘", "badge-ok", f'<a class="text-link quiet" href="#">{icon("history", 16)}변경 이력</a><a class="btn btn-ghost" href="#">{icon("list", 18)}진행 순서</a>')}
    <div class="two-col" style="border-top: 1px solid var(--line);">
      <div class="main">
        <section class="sec" data-state="done" data-spec="host.today.prep"><div class="sec-head"><span class="ttl"><span class="n">{icon("check", 14, stroke="2.4")}</span><h3 class="h3">준비 현황</h3></span><span class="sum">응답 9/12 · 질문 8개 <a class="text-link quiet" href="#">보기 ›</a></span></div></section>
        <section class="sec" data-state="current" data-spec="host.today.live">
          <div class="sec-head"><span class="ttl"><span class="n">2</span><h3 class="h3">당일 출석</h3></span><span class="sum">출석 <b class="tone-ok">2</b> · 불참 1 · 미확인 4 <a class="text-link quiet" href="#">{icon("undo", 14)}되돌리기</a></span></div>
          <p class="small" style="margin: 4px 0 6px;">누르면 바로 저장돼요. 응답과 따로 기록되고, 미확인은 그대로 둘 수 있어요.</p>
          <div style="margin-top: 6px;">{rows}</div>
        </section>
        <section class="sec" data-state="todo" style="border-bottom: 0;" data-spec="host.today.record">
          <div class="sec-head"><span class="ttl"><span class="n">3</span><h3 class="h3">모임 기록</h3></span><span class="sum">모임을 마치면 기록을 시작해요</span></div>
        </section>
      </div>
      <div class="rail" style="padding-top: 20px;">{todo_rail(("아직 출석을 확인하지 않은 4명이 있어요", "모임 중에 확인해도 되고, 끝난 뒤 정리해도 돼요.", "모임 마치기 → 기록 작성", ""), [("person-plus", "var(--ok)", "var(--ok-soft)", "가입 승인 검토", "2명 · 오늘"), ("document", "var(--accent)", "var(--accent-soft)", "지난 모임 기록 작성", "No.27")], 3, 1, "오늘 18:55 참석 응답 마감됨")}</div>
    </div>
  </main>""", 1040))


# D10 ------------------------------------------------------------- 오늘 · 기록 작성
def record_steps(current: int) -> str:
    steps = [("출석 확정", "9명 · 어제 21:42", "출석 보기"), ("소감 수집", "8 / 12 · 미작성 4명 · 마감 9월 5일", "미작성 멤버에게 안내"), ("기록 초안", "출석과 소감이 모이면 초안을 만들 수 있어요", "초안 만들기"), ("피드백 문서", "파일 올리기 또는 초안에서 만들기", "문서 열기"), ("멤버에게 게시", "앞선 두 단계가 끝나면 게시할 수 있어요", "")]
    out = ""
    for i, (a, b, act) in enumerate(steps):
        st = "done" if i < current else "current" if i == current else "todo"
        btn = f'<a class="{"btn btn-primary" if st == "current" else "text-link quiet"}" href="#">{act}{"" if st == "current" else icon("chevron-right", 16)}</a>' if act and st != "todo" or (act and i == current) else (f'<a class="text-link quiet" href="#">{act}{icon("chevron-right", 16)}</a>' if act else "")
        out += f'<div class="check" data-state="{st}"><span class="n">{icon("check", 14, stroke="2.4") if st == "done" else i + 1}</span><div class="txt"><div class="a">{a}</div><div class="b">{b}</div></div>{btn}</div>'
    return out


def d10_today_record() -> str:
    return wrap(frame(f"""
  {desktop_header("host", "오늘")}
  <main class="page">
    {meeting_head('<span class="dot warn"></span><b>모임 끝 · 기록 작성 중</b><span>·</span>9월 1일 모임<span>·</span>다음 모임 <a href="#" class="text-link" style="font-weight: 400;">9월 15일 ›</a>', "D+2", "badge-warn", f'<a class="text-link quiet" href="#">{icon("history", 16)}변경 이력</a><a class="btn btn-ghost" href="#">{icon("eye", 18)}기록 미리보기</a>')}
    <div class="two-col" style="border-top: 1px solid var(--line);">
      <div class="main">
        <section class="sec" data-state="done" data-spec="host.today.prep"><div class="sec-head"><span class="ttl"><span class="n">{icon("check", 14, stroke="2.4")}</span><h3 class="h3">준비 현황</h3></span><span class="sum">응답 9/12 · 질문 8개</span></div></section>
        <section class="sec" data-state="done" data-spec="host.today.live"><div class="sec-head"><span class="ttl"><span class="n">{icon("check", 14, stroke="2.4")}</span><h3 class="h3">당일 출석</h3></span><span class="sum">출석 9 · 불참 2 · 미확인 1 <a class="text-link quiet" href="#">고치기 ›</a></span></div></section>
        <section class="sec" data-state="current" style="border-bottom: 0;" data-spec="host.today.record">
          <div class="sec-head"><span class="ttl"><span class="n">3</span><h3 class="h3">모임 기록</h3></span><span class="small">5단계 중 1단계 끝</span></div>
          <div style="margin-top: 8px;">{record_steps(1)}</div>
        </section>
      </div>
      <div class="rail" style="padding-top: 20px;">{todo_rail(("소감을 아직 쓰지 않은 4명이 있어요", "마감 9월 5일까지. 안내는 한 번만 가요.", "미작성 멤버에게 안내", "9월 4일까지 보류"), [("person-plus", "var(--ok)", "var(--ok-soft)", "가입 승인 검토", "1명 · 오늘"), ("calendar", "var(--accent)", "var(--accent-soft)", "다음 모임 일정 공개", "9월 15일 · 초안"), ("link", "var(--danger)", "var(--danger-soft)", "초대 링크 만료 확인", "내일")], 4, 0, "오늘 10:18 기록 초안 자동 저장됨")}</div>
    </div>
  </main>""", 960))


# D11 ------------------------------------------------------------- 기록 초안 편집
def d11_record_draft() -> str:
    notes = [(AV[2], "최유진", "인공적인 온실이 결국 사람을 살린다는 역설이 오래 남았어요."), (AV[3], "한지우", "레이첼과 지수의 관계가 이 소설의 중심이라고 느꼈어요."), (AV[4], "오세린", "더스트 시대의 묘사가 지금과 겹쳐 보여서 불편하고 좋았어요.")]
    n = "".join(f'<div style="display: flex; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line-soft);">{avatar(a, 26)}<div style="min-width: 0;"><div style="font-size: 13px; font-weight: 600;">{nm}</div><p style="font-size: 14px; color: var(--text-2);">{t}</p></div></div>' for a, nm, t in notes)
    return wrap(frame(f"""
  {desktop_header("host", "오늘")}
  <main class="page">
    {back_bar("오늘 · 모임 기록", meeting_ctx(), "마지막 저장 10:18 · 자동 저장")}
    {page_header("모임 기록 · 3단계", "기록 초안", "출석 9명 · 소감 8편이 모였어요. 초안을 만들거나 직접 써요.", f'<a class="btn btn-ghost" href="#">{icon("sparkle", 16)}소감으로 초안 만들기</a><a class="btn btn-primary" href="#">저장하고 다음 단계</a>', "host.record-draft.header")}
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 48px;">
      <section data-spec="host.record-draft.editor">
        <div class="field"><label>제목</label><div class="input">No.28 · 지구 끝의 온실 — 온실 밖으로 나가는 이야기</div></div>
        <div class="field"><label>공개 요약 <span class="muted" style="font-weight: 400;">공개 사이트에 보이는 두 줄</span></label><div class="input area" style="min-height: 72px;">더스트로 무너진 세계에서 식물과 사람이 서로를 살리는 이야기를 읽고, 우리는 무엇을 온실 안에 두고 무엇을 밖으로 내보낼지 이야기했어요.</div></div>
        <div class="field"><label>본문</label><div class="input area" style="min-height: 320px;"><b>함께 나눈 질문</b><br>1. 온실은 보호일까 격리일까?<br>2. 레이첼이 지수에게 보인 감정을 사랑이라고 부를 수 있을까?<br><br><b>이야기의 흐름</b><br>첫 질문에서는 "보호받는 쪽이 원한 적 없는 보호"라는 말이 나왔고, …</div><div class="hint">Markdown을 써도 돼요. 멤버 이름은 소감을 인용할 때만 들어가요.</div></div>
      </section>
      <aside data-spec="host.record-draft.notes">
        <div class="section-title"><h3 class="h4">모인 소감 <span class="mono" style="color: var(--accent);">8</span></h3><a class="text-link quiet" href="#">미작성 4명{icon("chevron-right", 16)}</a></div>
        {n}
        <a class="text-link quiet" href="#" style="margin-top: 10px;">소감 5편 더 보기{icon("chevron-right", 16)}</a>
        <p class="info-line" style="margin-top: 18px;">{icon("info", 16)}소감 원문은 작성한 멤버와 호스트만 볼 수 있어요. 초안에 넣을 때는 인용 표시가 붙어요.</p>
      </aside>
    </div>
  </main>""", 960))


# D12 ------------------------------------------------------------- 피드백 문서
def d12_feedback_doc() -> str:
    return wrap(frame(f"""
  {desktop_header("host", "오늘")}
  <main class="page">
    {back_bar("오늘 · 모임 기록", meeting_ctx(), "")}
    {page_header("모임 기록 · 4단계", "피드백 문서", "모임 뒤 멤버에게 전하는 문서예요. 파일을 올리거나 초안에서 만들어요.", f'<a class="btn btn-primary" href="#">저장하고 게시 준비</a>', "host.feedback-doc.header")}
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 48px;">
      <section data-spec="host.feedback-doc.form">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
          <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">기록 초안에서 만들기</div><div class="small">3단계 초안을 문서로 정리해요.</div></div></div>
          <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">파일 올리기</div><div class="small">정리한 파일을 여기에 놓아요 (.md, .pdf)</div></div></div>
        </div>
        <div class="field"><label>문서 제목</label><div class="input">No.28 피드백 · 지구 끝의 온실</div></div>
        <div class="field"><label>파일 이름</label><div class="input mono" style="font-size: 14px;">no28-feedback.md</div></div>
        <div class="field"><label>본문 (Markdown)</label><div class="input area" style="min-height: 260px;"># 지구 끝의 온실<br><br>함께 읽어 주셔서 고마워요. 이번 모임에서 가장 오래 머문 질문은 …</div></div>
        <div class="field"><label>인쇄용</label><div class="info-line">{icon("info", 16)}저장하면 멤버가 인쇄용 화면으로 볼 수 있어요.</div></div>
      </section>
      <aside data-spec="host.feedback-doc.preview" style="border: 1px solid var(--line); border-radius: var(--r-3); padding: 24px; background: var(--bg-sub);">
        <div class="tiny" style="margin-bottom: 12px;">미리보기 · 멤버에게 보이는 모습</div>
        <div style="background: var(--bg); border: 1px solid var(--line-soft); border-radius: var(--r-2); padding: 24px; min-height: 420px;">
          <div class="kicker">No.28 · 9월 1일</div>
          <h2 class="h3" style="margin: 4px 0 12px;">지구 끝의 온실</h2>
          <p style="font-size: 14px; color: var(--text-2);">함께 읽어 주셔서 고마워요. 이번 모임에서 가장 오래 머문 질문은 "온실은 보호일까 격리일까"였어요. …</p>
        </div>
      </aside>
    </div>
  </main>""", 960))


# D13 ------------------------------------------------------------- 기록
def d13_records() -> str:
    rows = [("28", "지구 끝의 온실", "9월 1일", "9 / 12", "8 / 12", "작성 중", "warn", "이어서 작성"), ("27", "물고기는 존재하지 않는다", "8월 4일", "10 / 12", "10 / 12", "작성 필요", "danger", "기록 작성"), ("26", "우리가 빛의 속도로 갈 수 없다면", "7월 7일", "11 / 12", "11 / 12", "게시됨", "ok", "열기"), ("25", "아몬드", "6월 2일", "8 / 11", "8 / 11", "게시됨", "ok", "열기"), ("24", "긴긴밤", "5월 5일", "10 / 11", "9 / 11", "게시됨", "ok", "열기")]
    r = "".join(
        f'<tr><td class="mono muted">No.{n}</td><td style="font-weight: 600;">{b}</td><td class="detail">{d}</td><td class="detail">{a}</td><td class="detail">{f}</td>'
        f'<td><span class="dot {tone}"></span><span class="tone-{tone}" style="font-weight: 500;">{s}</span></td><td><a class="text-link{"" if tone != "ok" else " quiet"}" href="#">{act}{icon("chevron-right", 16)}</a></td></tr>'
        for n, b, d, a, f, s, tone, act in rows
    )
    return wrap(frame(f"""
  {desktop_header("host", "기록")}
  <main class="page">
    {page_header("기록", "모임 기록", '게시 <b>26편</b> · 작성 중 <b class="tone-warn">1</b> · 작성 필요 <b class="tone-danger">1</b>', "", "host.records.header")}
    <div class="banner" data-spec="host.records.banner" style="margin-bottom: 20px;">{icon("alert-circle", 22, style="color: var(--warn);")}<div style="flex: 1;"><div class="t">No.27 물고기는 존재하지 않는다 — 기록이 아직 없어요</div><div class="d">모임이 끝난 지 33일. 출석 10명 · 소감 10편이 모여 있어 바로 초안을 만들 수 있어요.</div></div><a class="btn btn-primary" href="#">기록 작성</a></div>
    <div class="tabs" style="margin-bottom: 8px;" data-spec="host.records.tabs">
      <span class="tab" aria-selected="true">전체 <span class="mono">28</span></span><span class="tab">작성 필요 <span class="mono" style="color: var(--danger);">1</span></span><span class="tab">작성 중 <span class="mono" style="color: var(--warn);">1</span></span><span class="tab">게시됨 <span class="mono">26</span></span>
    </div>
    <table class="ledger" data-spec="host.records.ledger"><thead><tr><th style="width: 8%;">회차</th><th>책</th><th>모임일</th><th>출석</th><th>소감</th><th>상태</th><th style="width: 12%;">관리</th></tr></thead><tbody>{r}</tbody></table>
    <div class="rail-foot" style="justify-content: flex-start; gap: 24px;">총 28편<span>{icon("history", 14)} 게시 이력 · 7월 12일 No.26 멤버 게시</span><a class="text-link quiet" href="#">공개 사이트 게시 설정{icon("chevron-right", 16)}</a></div>
  </main>""", 900))


# D14 ------------------------------------------------------------- 모임
def d14_meetings() -> str:
    up = [("29", "다음 책 미정", "9월 15일 (월) 19:30", "초안 · 나만 보여요", "accent", "공개하기"), ("28", "지구 끝의 온실", "9월 1일 (월) 19:30", "응답 9/12 · 준비 중", "ok", "열기")]
    past = [("27", "물고기는 존재하지 않는다", "8월 4일", "출석 10 · 기록 작성 필요", "danger", "기록 작성"), ("26", "우리가 빛의 속도로 갈 수 없다면", "7월 7일", "출석 11 · 게시됨", "ok", "열기"), ("25", "아몬드", "6월 2일", "출석 8 · 게시됨", "ok", "열기")]

    def rows(items):
        return "".join(f'<tr><td class="mono muted">No.{n}</td><td style="font-weight: 600;">{b}</td><td class="detail">{d}</td><td><span class="dot {t}"></span>{s}</td><td><a class="text-link{"" if t in ("danger", "accent") else " quiet"}" href="#">{a}{icon("chevron-right", 16)}</a></td></tr>' for n, b, d, s, t, a in items)

    return wrap(frame(f"""
  {desktop_header("host", "모임")}
  <main class="page">
    {page_header("모임", "모임 28회", '예정 <b>2</b> · 이번 모임 <b>No.28 · 9월 1일</b>', "", "host.meetings.header")}
    <div class="two-col">
      <div class="main">
        <section data-spec="host.meetings.upcoming" style="padding-bottom: 28px;">
          <div class="section-title"><h3 class="h3">예정</h3></div>
          <table class="ledger"><thead><tr><th style="width: 10%;">회차</th><th>책</th><th>일시</th><th>상태</th><th style="width: 12%;">관리</th></tr></thead><tbody>{rows(up)}</tbody></table>
        </section>
        <section data-spec="host.meetings.past">
          <div class="section-title"><h3 class="h3">지난 모임</h3><a class="text-link quiet" href="#">휴지통 보기 · 7일 안에 복구{icon("chevron-right", 16)}</a></div>
          <table class="ledger"><thead><tr><th style="width: 10%;">회차</th><th>책</th><th>모임일</th><th>상태</th><th style="width: 12%;">관리</th></tr></thead><tbody>{rows(past)}</tbody></table>
          <div class="rail-foot" style="justify-content: flex-start;">총 28회 · 2024년 5월부터</div>
        </section>
      </div>
      <aside class="rail" data-spec="host.meetings.month">
        <div class="section-title"><h3 class="h3">9월</h3><span class="small">첫째·셋째 월요일</span></div>
        <div class="todo-row"><span class="circ" style="background: var(--ok-soft); color: var(--ok);">1</span><span class="t">지구 끝의 온실</span><span class="m">월 19:30</span></div>
        <div class="todo-row"><span class="circ" style="background: var(--accent-soft); color: var(--accent);">15</span><span class="t">다음 책 미정 <span class="badge badge-accent" style="margin-left: 6px;">초안</span></span><span class="m">월 19:30</span></div>
        <div class="todo-row" style="border-bottom: 0;"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">30</span><span class="t muted">초대 링크 만료</span><span class="m">화</span></div>
      </aside>
    </div>
  </main>""", 900))


# D15 ------------------------------------------------------------- 지난 모임 상세
def d15_meeting_detail_past() -> str:
    return wrap(frame(f"""
  {desktop_header("host", "모임")}
  <main class="page">
    {back_bar("모임", "", "")}
    {meeting_head('<span class="dot ok"></span><b>게시됨</b><span>·</span>7월 7일 모임<span>·</span>7월 12일 멤버 게시', "No.26", "badge-ok", f'<a class="text-link quiet" href="#">{icon("history", 16)}변경 이력</a><a class="btn btn-ghost" href="#">{icon("eye", 18)}멤버 시야로 보기</a><a class="btn btn-ghost" href="#">{icon("more", 18)}</a>', "지난 모임 · No.26 · 7월 정기 모임", "우리가 빛의 속도로 갈 수 없다면", "past", f'{icon("calendar", 18)}7월 7일 (월)<span class="sep">·</span>{icon("clock", 18)}오후 7:30<span class="sep">·</span>{icon("pin", 18)}을지로 북살롱')}
    <div class="two-col" style="border-top: 1px solid var(--line);">
      <div class="main">
        <section class="sec" data-state="done"><div class="sec-head"><span class="ttl"><span class="n">{icon("check", 14, stroke="2.4")}</span><h3 class="h3">준비 현황</h3></span><span class="sum">응답 11/12 · 질문 9개</span></div></section>
        <section class="sec" data-state="done"><div class="sec-head"><span class="ttl"><span class="n">{icon("check", 14, stroke="2.4")}</span><h3 class="h3">당일 출석</h3></span><span class="sum">출석 11 · 불참 1 <a class="text-link quiet" href="#">고치기 ›</a></span></div></section>
        <section class="sec" data-state="done" style="border-bottom: 0;">
          <div class="sec-head"><span class="ttl"><span class="n">{icon("check", 14, stroke="2.4")}</span><h3 class="h3">모임 기록</h3></span><span class="sum">5단계 모두 끝 · 7월 12일 게시</span></div>
          <div data-spec="host.past-meeting.record" style="margin-top: 16px; border: 1px solid var(--line); border-radius: var(--r-3); overflow: hidden;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--line-soft);">
              <div><div class="kicker">기록 제목</div><div class="h4" style="font-size: 18px; margin-top: 2px;">빛의 속도로 갈 수 없어서 남는 것들</div></div>
              <span class="badge badge-ok">멤버 게시 · 7월 12일</span>
            </div>
            <div class="todo-row" style="padding: 0 20px; height: 56px;"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">{icon("notes", 18)}</span><span class="t">소감 11편</span><span class="m">초안에 4편 인용</span><a class="text-link quiet" href="#">보기{icon("chevron-right", 16)}</a></div>
            <div class="todo-row" style="padding: 0 20px; height: 56px;"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">{icon("document", 18)}</span><span class="t">피드백 문서</span><span class="m mono" style="font-size: 13px;">no26-feedback.md</span><a class="text-link quiet" href="#">인쇄용{icon("chevron-right", 16)}</a></div>
            <div class="todo-row" style="padding: 0 20px; height: 56px; border-bottom: 0;"><span class="circ" style="background: var(--ok-soft); color: var(--ok);">{icon("eye", 18)}</span><span class="t">공개 사이트</span><span class="m">게시됨</span><a class="text-link quiet" href="#">/clubs/euljiro/records/26{icon("chevron-right", 16)}</a></div>
          </div>
          <div class="actions" style="margin-top: 16px;"><a class="btn btn-ghost" href="#">{icon("edit", 16)}기록 고치기</a><a class="btn btn-quiet" href="#">게시 내리기</a></div>
        </section>
      </div>
      <aside class="rail" style="padding-top: 20px;">
        <div class="section-title"><h3 class="h3">이 모임의 이력</h3></div>
        <div class="todo-row" style="height: 52px;"><span class="m" style="width: 72px;">7월 12일</span><span class="t" style="font-weight: 400;">멤버에게 게시</span></div>
        <div class="todo-row" style="height: 52px;"><span class="m" style="width: 72px;">7월 9일</span><span class="t" style="font-weight: 400;">피드백 문서 저장</span></div>
        <div class="todo-row" style="height: 52px;"><span class="m" style="width: 72px;">7월 7일</span><span class="t" style="font-weight: 400;">출석 확정 11명</span></div>
        <div class="todo-row" style="height: 52px; border-bottom: 0;"><span class="m" style="width: 72px;">6월 20일</span><span class="t" style="font-weight: 400;">멤버에게 공개</span></div>
      </aside>
    </div>
  </main>""", 900))


# D20 ------------------------------------------------------------- 알림 (호스트 유틸)
def d20_notifications() -> str:
    rows = [("오늘 09:00", "일정 안내 · 시작 시간 7:30", "4명", "전달 4", "ok"), ("어제 19:30", "자동 리마인드 · 참석 응답 요청", "3명", "전달 3", "ok"), ("8월 20일", "새 모임 알림 · No.28", "12명", "전달 11 · 실패 1", "warn"), ("8월 4일", "기록 게시 알림 · No.26", "12명", "전달 12", "ok")]
    r = "".join(f'<tr><td class="detail">{w}</td><td style="font-weight: 500;">{t}</td><td class="detail">{n}</td><td><span class="dot {tone}"></span><span class="tone-{tone}" style="font-weight: 500;">{res}</span></td><td><a class="text-link quiet" href="#">받는 사람{icon("chevron-right", 16)}</a></td></tr>' for w, t, n, res, tone in rows)
    return wrap(frame(f"""
  {desktop_header("host", "")}
  <main class="page">
    {back_bar("오늘", "", "")}
    {page_header("알림", "멤버에게 보낸 안내", "이 클럽에서 나간 안내와 자동 리마인드 기록이에요. 내가 받은 알림은 종 아이콘에서 봐요.", "", "host.notifications.header")}
    <table class="ledger" data-spec="host.notifications.ledger"><thead><tr><th style="width: 14%;">시각</th><th>내용</th><th style="width: 10%;">대상</th><th style="width: 16%;">결과</th><th style="width: 12%;"></th></tr></thead><tbody>{r}</tbody></table>
    <p class="info-line" style="margin-top: 16px;">{icon("info", 16)}실패한 안내는 자동으로 다시 보내지 않아요. 필요하면 해당 할 일에서 다시 보내요.</p>
  </main>""", 720))


# D21 ------------------------------------------------------------- 공유 셸 (멤버 시야 · 메뉴 열림)
def d21_shell_menus() -> str:
    return wrap(frame(f"""
  {desktop_header("member", "오늘", club_menu=True, multi_club=True, account_open=True)}
  <div style="padding: 260px 32px 0 560px; max-width: 1100px;">
    <p class="small">멤버 시야 헤더. 왼쪽은 클럽이 둘 이상일 때만 열리는 클럽 선택, 오른쪽은 계정 메뉴. 플랫폼 운영 항목은 운영 권한이 있을 때만 보여요. 세그먼트는 이 클럽에서 호스트 권한이 있을 때만 있어요.</p>
  </div>""", 420))


ARTBOARDS = [
    ("D01-TodayStart", "① 오늘 · 시작 전", d01_today_start, 720),
    ("D02-SettingsInvites", "② 설정 › 초대 링크", d02_settings_invites, 900),
    ("D03-Members", "③ 멤버 · 가입 승인", d03_members, 960),
    ("D04-NewMeeting", "④ 새 모임", d04_new_meeting, 1040),
    ("Main", "⑤ 오늘 · 준비 중", d05_today_prep, 960),
    ("D06-EditMeeting", "⑥ 모임 수정 (일정 편집)", d06_edit_meeting, 1040),
    ("D07-ScheduleNotice", "⑦ 일정 안내 보내기", d07_schedule_notice, 800),
    ("D08-Person", "⑧ 멤버 상세", d08_person, 900),
    ("D09-TodayLive", "⑨ 오늘 · 당일 출석", d09_today_live, 1040),
    ("D10-TodayRecord", "⑩ 오늘 · 기록 작성", d10_today_record, 960),
    ("D11-RecordDraft", "⑪ 기록 초안", d11_record_draft, 960),
    ("D12-FeedbackDoc", "⑫ 피드백 문서", d12_feedback_doc, 960),
    ("D13-Records", "⑬ 기록", d13_records, 900),
    ("D14-Meetings", "⑭ 모임", d14_meetings, 900),
    ("D15-PastMeeting", "⑮ 지난 모임 상세", d15_meeting_detail_past, 900),
    ("D16-SettingsClub", "⑯ 설정 › 클럽 설정", d16_settings_club, 900),
    ("D17-SettingsCoHost", "⑰ 설정 › 공동 호스트", d17_settings_cohost, 760),
    ("D18-SettingsHistory", "⑱ 설정 › 변경 이력", d18_settings_history, 760),
    ("D19-SettingsClose", "⑲ 설정 › 운영 종료", d19_settings_close, 760),
    ("D20-Notifications", "⑳ 알림 · 보낸 안내", d20_notifications, 720),
    ("D21-ShellMenus", "공유 셸 · 멤버 시야 + 메뉴", d21_shell_menus, 420),
]
