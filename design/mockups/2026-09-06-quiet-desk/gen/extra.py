"""Gap-fill artboards: 게시 확인, 새 초대 링크, 휴지통 (desktop + mobile)."""
from lib import AV, ME, avatar, back_bar, checkbox, desktop_header, icon, meeting_ctx, mobile_header, mobile_tabbar, page_header, wrap


def frame(inner: str, h: int) -> str:
    return f'<div class="frame" style="min-height: {h}px;">{inner}</div>'


def m(inner: str, tab: str | None = None) -> str:
    return wrap(f'<div class="m-root">{inner}{mobile_tabbar(tab) if tab else ""}</div>')


# ---------------------------------------------------------------- 게시 확인 (모임 기록 5단계)
def publish_preview_card(small: bool = False) -> str:
    pad = "16px" if small else "24px"
    return f"""
        <div style="background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-3); padding: {pad};">
          <div class="kicker">No.28 · 9월 1일 · 을지로 북살롱</div>
          <h2 class="h3" style="margin: 4px 0 10px;">온실 밖으로 나가는 이야기</h2>
          <p style="font-size: 14px; color: var(--text-2);">더스트로 무너진 세계에서 식물과 사람이 서로를 살리는 이야기를 읽고, 우리는 무엇을 온실 안에 두고 무엇을 밖으로 내보낼지 이야기했어요.</p>
          <div style="display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap;"><span class="badge">출석 9명</span><span class="badge">소감 8편 · 4편 인용</span><span class="badge">피드백 문서</span></div>
        </div>"""


def d22_publish() -> str:
    return wrap(frame(f"""
  {desktop_header("host", "오늘")}
  <main class="page">
    {back_bar("오늘 · 모임 기록", meeting_ctx(), "게시 전까지 멤버에게 보이지 않아요")}
    {page_header("모임 기록 · 5단계", "멤버에게 게시", "앞선 네 단계가 모두 끝났어요. 게시하면 멤버 12명이 기록과 피드백 문서를 볼 수 있어요.", "", "host.publish.header")}
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 64px; max-width: 1180px;">
      <section data-spec="host.publish.preview">
        <div class="section-title"><h3 class="h4">멤버에게 보이는 모습</h3><a class="text-link quiet" href="#">전체 미리보기{icon("chevron-right", 16)}</a></div>
        <div style="background: var(--bg-sub); border-radius: var(--r-3); padding: 24px;">{publish_preview_card()}</div>
        <div class="section-title" style="margin-top: 24px;"><h3 class="h4">함께 게시되는 것</h3></div>
        <div class="todo-row" style="height: 52px;"><span class="circ" style="background: var(--ok-soft); color: var(--ok);">{icon("check", 14, stroke="2.6")}</span><span class="t">기록 본문</span><span class="m">3단계에서 작성</span></div>
        <div class="todo-row" style="height: 52px;"><span class="circ" style="background: var(--ok-soft); color: var(--ok);">{icon("check", 14, stroke="2.6")}</span><span class="t">피드백 문서 · 인쇄용</span><span class="m">no28-feedback.md</span></div>
        <div class="todo-row" style="height: 52px; border-bottom: 0;"><span class="circ" style="background: var(--ok-soft); color: var(--ok);">{icon("check", 14, stroke="2.6")}</span><span class="t">출석 9명 · 소감 인용 4편</span><span class="m">인용한 멤버 이름 표시</span></div>
      </section>
      <aside data-spec="host.publish.confirm">
        <div class="section-title"><h3 class="h4">게시 범위</h3></div>
        <div style="display: grid; gap: 8px; margin-bottom: 18px;">
          <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">멤버에게만</div><div class="small">클럽 멤버 12명이 기록 페이지에서 봐요.</div></div></div>
          <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">멤버 + 공개 사이트</div><div class="small">공개 요약과 본문이 readmates.app/clubs/euljiro/records/28 에 올라가요. 소감 인용은 이름 없이.</div></div></div>
        </div>
        <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; margin-bottom: 20px;">{checkbox(True, ' style="margin-top: 2px;"')}게시하면 멤버 12명에게 알림이 가요. 알고 있어요.</label>
        <a class="btn btn-primary btn-lg" href="#" style="width: 100%;">멤버에게 게시</a>
        <a class="btn btn-quiet" href="#" style="width: 100%; margin-top: 8px;">아직 게시하지 않기</a>
        <p class="info-line" style="margin-top: 16px;">{icon("info", 16)}게시한 뒤에도 고칠 수 있어요. 고치면 변경 이력에 남고, 내리는 것도 여기서 해요.</p>
      </aside>
    </div>
  </main>""", 900))


def m23_publish() -> str:
    return m(f"""
  {mobile_header("모임 기록 · 5단계", "멤버에게 게시", back="오늘", right=False)}
  <div class="m-body" style="padding-bottom: 170px;">
    <p class="status-line" style="padding: 14px 0 12px; font-size: 15px;">네 단계가 모두 끝났어요. 게시하면 멤버 12명이 볼 수 있어요.</p>
    <div style="background: var(--bg-sub); border-radius: var(--r-3); padding: 12px;" data-spec="host.publish.preview">{publish_preview_card(True)}</div>
    <div class="section-title" style="margin: 18px 0 6px;"><h3 class="h4">게시 범위</h3></div>
    <div style="display: grid; gap: 8px;">
      <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">멤버에게만</div><div class="small">클럽 멤버 12명</div></div></div>
      <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">멤버 + 공개 사이트</div><div class="small">소감 인용은 이름 없이</div></div></div>
    </div>
  </div>
  <div class="m-sticky-cta" style="bottom: 0; padding-bottom: 18px;"><a class="btn btn-primary" href="#" style="width: 100%; height: 48px;">멤버에게 게시</a><p class="tiny" style="text-align: center; margin-top: 8px;">게시하면 멤버 12명에게 알림이 가요 · 나중에 고칠 수 있어요</p></div>""")


# ---------------------------------------------------------------- 새 초대 링크
def invite_form(compact: bool = False) -> str:
    return f"""
      <div class="field"><label>링크 이름</label><div class="input">10월 정기 초대</div><div class="hint">나만 보는 이름이에요. 누가 어느 링크로 들어왔는지 구분할 때 써요.</div></div>
      <div class="field"><label>언제까지 쓸 수 있나요</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;"><span class="btn btn-ghost">7일</span><span class="btn btn-primary">30일</span><span class="btn btn-ghost">날짜 정하기</span></div></div>
      <div class="field"><label>몇 명까지</label><div class="input">제한 없음</div><div class="hint">숫자를 넣으면 그 인원이 가입 신청하면 링크가 닫혀요.</div></div>
      <div class="field"><label>가입 방식</label>
        <div style="display: grid; gap: 8px;">
          <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">신청 후 내가 승인</div><div class="small">멤버 페이지 승인 대기에 모여요.</div></div></div>
        </div></div>"""


def d23_new_invite() -> str:
    return wrap(frame(f"""
  {desktop_header("host", "", settings_current=True)}
  <div style="position: absolute; inset: 66px 0 0 0; background: oklch(0 0 0 / 0.28);"></div>
  <div data-spec="host.invites.new" style="position: absolute; top: 120px; left: 50%; transform: translateX(-50%); width: 560px; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-3); padding: 24px 28px 28px; box-shadow: 0 24px 64px -24px oklch(0 0 0 / 0.3);">
    <div class="section-title" style="margin-bottom: 4px;"><h2 class="h3">새 초대 링크</h2><span class="icon-btn" style="width: 32px; height: 32px;">{icon("x-circle", 20)}</span></div>
    <p class="small" style="margin-bottom: 18px;">링크를 받은 사람은 로그인 뒤 가입 신청 상태가 돼요. 링크는 만든 뒤 바로 복사할 수 있어요.</p>
    {invite_form()}
    <div class="actions" style="justify-content: flex-end; margin-top: 8px;"><a class="btn btn-quiet" href="#">취소</a><a class="btn btn-primary" href="#">{icon("link", 16)}링크 만들기</a></div>
  </div>
  <main class="page" style="opacity: .5;">
    {page_header("설정", "클럽 운영", "초대 링크 <b>2개</b> 활성 · 공동 호스트 <b>1명</b>", "", "")}
  </main>""", 820))


def m24_new_invite() -> str:
    return m(f"""
  {mobile_header("설정 · 초대 링크", "새 초대 링크", back="초대 링크", right=False)}
  <div class="m-body" style="padding-bottom: 150px;">
    <p class="small" style="padding: 14px 0 12px;">링크를 받은 사람은 로그인 뒤 가입 신청 상태가 돼요.</p>
    {invite_form(True)}
  </div>
  <div class="m-sticky-cta" style="bottom: 0; padding-bottom: 18px;"><a class="btn btn-primary" href="#" style="width: 100%; height: 48px;">{icon("link", 16)}링크 만들기</a><p class="tiny" style="text-align: center; margin-top: 8px;">만든 뒤 바로 복사할 수 있어요</p></div>""")


# ---------------------------------------------------------------- 휴지통
def d24_trash() -> str:
    rows = [("30", "미정 · 10월 임시 모임", "10월 3일 (금)", "어제 지움 · 김하늘", "6일 남음"), ("—", "테스트 모임", "9월 20일 (토)", "5일 전 지움 · 최유진", "2일 남음")]
    r = "".join(f'<tr><td class="mono muted">{n}</td><td style="font-weight: 600;">{b}</td><td class="detail">{d}</td><td class="detail">{w}</td><td><span class="tone-warn" style="font-weight: 500;">{left}</span></td><td><span style="display: inline-flex; gap: 12px; justify-content: flex-end;"><a class="text-link" href="#">{icon("undo", 14)}복구</a><a class="text-link quiet" href="#">바로 지우기</a></span></td></tr>' for n, b, d, w, left in rows)
    return wrap(frame(f"""
  {desktop_header("host", "모임")}
  <main class="page">
    {back_bar("모임")}
    {page_header("모임 · 휴지통", "지운 모임 2개", "지운 모임은 <b>7일</b> 동안 여기 있다가 자동으로 사라져요. 멤버 계정과 멤버십은 지워지지 않아요.", "", "host.meetings.trash")}
    <table class="ledger"><thead><tr><th style="width: 8%;">회차</th><th>모임</th><th>예정일</th><th>지운 사람</th><th>남은 기간</th><th style="width: 16%;">관리</th></tr></thead><tbody>{r}</tbody></table>
    <p class="info-line" style="margin-top: 16px;">{icon("info", 16)}복구하면 지우기 전 상태(초안/공개, 응답, 질문)로 돌아가요. 멤버에게는 알림이 가지 않아요.</p>
  </main>""", 640))


DESKTOP = [
    ("D22-Publish", "⑫′ 모임 기록 · 멤버에게 게시", d22_publish, 900),
    ("D23-NewInvite", "②′ 새 초대 링크", d23_new_invite, 820),
    ("D24-Trash", "⑭′ 모임 · 휴지통", d24_trash, 640),
]
MOBILE = [
    ("M23-Publish", "⑫′ 멤버에게 게시", m23_publish),
    ("M24-NewInvite", "②′ 새 초대 링크", m24_new_invite),
]
