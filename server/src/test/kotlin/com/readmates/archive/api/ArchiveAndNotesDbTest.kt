package com.readmates.archive.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.hamcrest.Matchers.emptyOrNullString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasItems
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
class ArchiveAndNotesDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) {
    private val createdSessionParticipantIds = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("session_participants", "id", createdSessionParticipantIds)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("memberships", "user_id", createdUserIds)
            deleteWhereIn("users", "id", createdUserIds)
        } finally {
            createdSessionParticipantIds.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
        }
    }

    @Test
    fun `archive sessions are returned newest first from seeded sessions`() {
        mockMvc.get("/api/archive/sessions") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(6) }
                jsonPath("$[0].sessionNumber") { value(6) }
                jsonPath("$[0].bookTitle") { value("가난한 찰리의 연감") }
                jsonPath("$[0].bookImageUrl") { value("https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg") }
                jsonPath("$[0].state") { value("PUBLISHED") }
                jsonPath("$[5].sessionNumber") { value(1) }
                jsonPath("$[5].bookTitle") { value("팩트풀니스") }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_VIEWER_ARCHIVE_VISIBILITY_SESSIONS_SQL,
            INSERT_VIEWER_DRAFT_SESSION_SQL,
            INSERT_VIEWER_OPEN_SESSION_SQL,
            INSERT_VIEWER_CLOSED_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_VIEWER_ARCHIVE_VISIBILITY_SESSIONS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `viewer can list and read preserved sessions but cannot read feedback document`() {
        val cookie = viewerSessionCookie("viewer.archive.${UUID.randomUUID()}@example.com")
        val viewerMembershipId = createdMembershipIds.last()
        insertViewerSessionParticipant(
            membershipId = viewerMembershipId,
            sessionId = "00000000-0000-0000-0000-000000000306",
        )

        mockMvc.get("/api/archive/sessions") {
            cookie(cookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$[*].sessionNumber") { value(hasItems(997, 6)) }
            jsonPath("$[*].sessionNumber") { value(not(hasItem(998))) }
            jsonPath("$[?(@.sessionNumber == 997)].state") { value(hasItem("CLOSED")) }
            jsonPath("$[*].sessionNumber") { value(not(hasItem(999))) }
            jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.available") { value(hasItem(true)) }
            jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.readable") { value(hasItem(false)) }
            jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.lockedReason") { value(hasItem("NOT_ATTENDED")) }
        }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000009992") {
            cookie(cookie)
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000009993") {
            cookie(cookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionNumber") { value(997) }
            jsonPath("$.state") { value("CLOSED") }
            jsonPath("$.attendance") { value(0) }
            jsonPath("$.total") { value(0) }
        }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000301") {
            cookie(cookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionNumber") { value(1) }
            jsonPath("$.state") { value("PUBLISHED") }
        }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000009991") {
            cookie(cookie)
        }.andExpect {
            status { isNotFound() }
        }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
            cookie(cookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.myAttendanceStatus") { value("ATTENDED") }
            jsonPath("$.feedbackDocument.available") { value(true) }
            jsonPath("$.feedbackDocument.readable") { value(false) }
        }

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            cookie(cookie)
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `notes feed includes seeded prepared questions`() {
        mockMvc.get("/api/notes/feed") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(greaterThan(0)) }
                jsonPath("$[0].kind") { value(not(emptyOrNullString())) }
                jsonPath("$[0].text") { value(not(emptyOrNullString())) }
                jsonPath("$[*].kind") {
                    value(hasItems("QUESTION", "ONE_LINE_REVIEW", "HIGHLIGHT"))
                }
                jsonPath("$[*].text") {
                    value(
                        hasItem(
                            "10가지 본능 중에서 본인에게 가장 강하게 작용한다고 느낀 것은 무엇인가요? 그리고 왜 그 본능이 유독 자신에게 강하게 나타난다고 생각하나요?",
                        ),
                    )
                }
            }
    }

    @Test
    fun `notes feed includes book metadata`() {
        mockMvc.get("/api/notes/feed") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].bookTitle") { exists() }
                jsonPath("$[0].date") { exists() }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_PRIVATE_ONE_LINER_SQL,
            INSERT_PRIVATE_ONE_LINER_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_PRIVATE_ONE_LINER_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `note sessions are returned newest first with public note counts`() {
        mockMvc.get("/api/notes/sessions") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(6) }
                jsonPath("$[0].sessionId") { value("00000000-0000-0000-0000-000000000306") }
                jsonPath("$[0].sessionNumber") { value(6) }
                jsonPath("$[0].bookTitle") { value("가난한 찰리의 연감") }
                jsonPath("$[0].date") { value("2026-04-15") }
                jsonPath("$[0].questionCount") { value(6) }
                jsonPath("$[0].oneLinerCount") { value(3) }
                jsonPath("$[0].highlightCount") { value(3) }
                jsonPath("$[0].checkinCount") { value(3) }
                jsonPath("$[0].totalCount") { value(15) }
                jsonPath("$[5].sessionNumber") { value(1) }
            }
    }

    @Test
    @Sql(
        statements = [
            MARK_MEMBER2_SESSION_SIX_REMOVED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_MEMBER2_SESSION_SIX_ACTIVE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `notes sessions and feed exclude removed participant authored records`() {
        mockMvc.get("/api/notes/sessions") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[?(@.sessionNumber == 6)].questionCount") { value(hasItem(4)) }
                jsonPath("$[?(@.sessionNumber == 6)].oneLinerCount") { value(hasItem(2)) }
                jsonPath("$[?(@.sessionNumber == 6)].highlightCount") { value(hasItem(2)) }
                jsonPath("$[?(@.sessionNumber == 6)].checkinCount") { value(hasItem(2)) }
                jsonPath("$[?(@.sessionNumber == 6)].totalCount") { value(hasItem(10)) }
            }

        mockMvc.get("/api/notes/feed") {
            param("sessionId", "00000000-0000-0000-0000-000000000306")
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(10) }
                jsonPath("$[*].text") {
                    value(not(hasItem("찰리는 왜 전기 애호가가 되었을까? 책 제목도 전기의 형태이고, 작중 몇차례 언급된다. 전기가 다른 형태의 문학과 달리 뛰어난 점은 무엇일까?")))
                }
                jsonPath("$[*].text") { value(not(hasItem("전기와 연감 형식이 왜 반복해서 등장하는지 계속 묻게 됐다."))) }
                jsonPath("$[*].text") { value(not(hasItem("왜곡된 인센티브와 보상 구조는 투자뿐 아니라 일상 조직에서도 판단을 흔들 수 있었다."))) }
                jsonPath("$[*].text") { value(not(hasItem("전기의 효용과 정의의 주장을 중심으로 질문을 정리했습니다."))) }
                jsonPath("$[*].text") { value(hasItem("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.")) }
            }
    }

    @Test
    fun `notes feed can be filtered to a published session in the same club`() {
        mockMvc.get("/api/notes/feed") {
            param("sessionId", "00000000-0000-0000-0000-000000000306")
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(15) }
                jsonPath("$[*].sessionId") { value(everyItem(equalTo("00000000-0000-0000-0000-000000000306"))) }
                jsonPath("$[*].kind") {
                    value(hasItems("QUESTION", "ONE_LINE_REVIEW", "HIGHLIGHT", "CHECKIN"))
                }
                jsonPath("$[*].text") {
                    value(hasItem("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다."))
                }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_BULK_SESSION_HIGHLIGHTS_SQL,
            INSERT_BULK_SESSION_HIGHLIGHTS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_BULK_SESSION_HIGHLIGHTS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `session notes feed does not use the recent feed limit`() {
        mockMvc.get("/api/notes/feed") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(120) }
            }

        mockMvc.get("/api/notes/feed") {
            param("sessionId", "00000000-0000-0000-0000-000000000306")
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(140) }
                jsonPath("$[*].text") { value(hasItem("세션 필터 무제한 하이라이트 125")) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_HIDDEN_OTHER_CLUB_SESSION_SQL,
            CLEANUP_HIDDEN_UNPUBLISHED_SESSION_SQL,
            INSERT_HIDDEN_UNPUBLISHED_SESSION_SQL,
            INSERT_HIDDEN_UNPUBLISHED_QUESTION_SQL,
            INSERT_HIDDEN_OTHER_CLUB_SESSION_SQL,
            INSERT_HIDDEN_OTHER_CLUB_QUESTION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_HIDDEN_OTHER_CLUB_SESSION_SQL,
            CLEANUP_HIDDEN_UNPUBLISHED_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `notes feed session filter returns empty for invalid unavailable and hidden sessions`() {
        listOf(
            "not-a-uuid",
            "00000000-0000-0000-0000-000000009999",
            "00000000-0000-0000-0000-000000009061",
            "00000000-0000-0000-0000-000000009073",
        ).forEach { sessionId ->
            mockMvc.get("/api/notes/feed") {
                param("sessionId", sessionId)
                with(user("member5@example.com"))
            }
                .andExpect {
                    status { isOk() }
                    jsonPath("$.length()") { value(0) }
                }
        }
    }

    @Test
    fun `notes feed uses seeded highlight authors`() {
        mockMvc.get("/api/notes/feed") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[?(@.kind == 'HIGHLIGHT')].authorName") { value(hasItems("이멤버5", "최멤버2", "송멤버4")) }
                jsonPath("$[?(@.kind == 'HIGHLIGHT')].authorShortName") { value(hasItems("멤버5", "멤버2", "멤버4")) }
            }
    }

    @Test
    @Sql(
        statements = [
            MARK_MEMBER1_LEFT_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_MEMBER1_ACTIVE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `member archive and notes feed anonymize left member authored records`() {
        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000301") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.state") { value("PUBLISHED") }
                jsonPath("$.clubQuestions[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.clubQuestions[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.clubQuestions[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.clubQuestions[*].authorShortName") { value(not(hasItem("멤버1"))) }
                jsonPath("$.clubCheckins[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.clubCheckins[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.clubCheckins[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.clubCheckins[*].authorShortName") { value(not(hasItem("멤버1"))) }
                jsonPath("$.publicOneLiners[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.publicOneLiners[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.publicOneLiners[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.publicOneLiners[*].authorShortName") { value(not(hasItem("멤버1"))) }
            }

        mockMvc.get("/api/notes/feed") {
            param("sessionId", "00000000-0000-0000-0000-000000000301")
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[?(@.authorName == '탈퇴한 멤버')].kind") {
                    value(hasItems("QUESTION", "ONE_LINE_REVIEW", "CHECKIN", "HIGHLIGHT"))
                }
                jsonPath("$[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$[*].authorShortName") { value(not(hasItem("멤버1"))) }
            }
    }

    @Test
    fun `my archive questions returns only current member questions`() {
        mockMvc.get("/api/archive/me/questions") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].sessionNumber") { exists() }
                jsonPath("$[0].bookTitle") { exists() }
                jsonPath("$[0].text") { exists() }
            }
    }

    @Test
    fun `my archive reviews returns current member one-liners`() {
        mockMvc.get("/api/archive/me/reviews") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].kind") { value("ONE_LINE_REVIEW") }
                jsonPath("$[0].bookTitle") { exists() }
                jsonPath("$[0].text") { exists() }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_LATEST_FEED_QUESTION_SQL,
            INSERT_LATEST_FEED_QUESTION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_LATEST_FEED_QUESTION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `notes feed returns latest created item first`() {
        mockMvc.get("/api/notes/feed") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].kind") { value("QUESTION") }
                jsonPath("$[0].text") { value(LATEST_FEED_QUESTION_TEXT) }
            }
    }

    @Test
    fun `my page returns the current seeded member profile and reading rhythm`() {
        mockMvc.get("/api/app/me") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.displayName") { value("이멤버5") }
                jsonPath("$.email") { value("member5@example.com") }
                jsonPath("$.role") { value("MEMBER") }
                jsonPath("$.membershipStatus") { value("ACTIVE") }
                jsonPath("$.clubName") { value("읽는사이") }
                jsonPath("$.sessionCount") { value(4) }
                jsonPath("$.totalSessionCount") { value(6) }
                jsonPath("$.recentAttendances.length()") { value(6) }
                jsonPath("$.recentAttendances[0].sessionNumber") { value(1) }
                jsonPath("$.recentAttendances[0].attended") { value(true) }
                jsonPath("$.recentAttendances[3].sessionNumber") { value(4) }
                jsonPath("$.recentAttendances[3].attended") { value(false) }
                jsonPath("$.recentAttendances[5].sessionNumber") { value(6) }
                jsonPath("$.recentAttendances[5].attended") { value(true) }
            }
    }

    companion object {
        private const val CLEANUP_VIEWER_ARCHIVE_VISIBILITY_SESSIONS_SQL = """
            delete from sessions
            where id in (
              '00000000-0000-0000-0000-000000009991',
              '00000000-0000-0000-0000-000000009992',
              '00000000-0000-0000-0000-000000009993'
            );
        """

        private const val INSERT_VIEWER_DRAFT_SESSION_SQL = """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            select
              '00000000-0000-0000-0000-000000009991',
              clubs.id,
              999,
              '숨겨진 초안 세션',
              '숨겨진 초안 책',
              '숨겨진 저자',
              null,
              null,
              null,
              '2030-04-01',
              '19:00:00',
              '21:00:00',
              '온라인',
              null,
              null,
              '2030-03-31 14:59:00.000000',
              'DRAFT'
            from clubs
            where clubs.id = '00000000-0000-0000-0000-000000000001';
        """

        private const val INSERT_VIEWER_OPEN_SESSION_SQL = """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            select
              '00000000-0000-0000-0000-000000009992',
              clubs.id,
              998,
              '998회차 · 공개 진행 세션',
              '공개 진행 책',
              '공개 진행 저자',
              null,
              null,
              null,
              '2030-03-01',
              '19:00:00',
              '21:00:00',
              '온라인',
              null,
              null,
              '2030-02-28 14:59:00.000000',
              'OPEN'
            from clubs
            where clubs.id = '00000000-0000-0000-0000-000000000001';
        """

        private const val INSERT_VIEWER_CLOSED_SESSION_SQL = """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            select
              '00000000-0000-0000-0000-000000009993',
              clubs.id,
              997,
              '997회차 · 공개 종료 세션',
              '공개 종료 책',
              '공개 종료 저자',
              null,
              null,
              null,
              '2030-02-01',
              '19:00:00',
              '21:00:00',
              '온라인',
              null,
              null,
              '2030-01-31 14:59:00.000000',
              'CLOSED'
            from clubs
            where clubs.id = '00000000-0000-0000-0000-000000000001';
        """

        private const val MARK_MEMBER1_LEFT_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'LEFT'
            where users.email = 'member1@example.com'
              and memberships.club_id = '00000000-0000-0000-0000-000000000001';
        """
        private const val RESET_MEMBER1_ACTIVE_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'ACTIVE'
            where users.email = 'member1@example.com'
              and memberships.club_id = '00000000-0000-0000-0000-000000000001';
        """

        private const val LATEST_FEED_QUESTION_TEXT = "2030년에 작성된 최신 피드 정렬 검증 질문"
        private const val CLEANUP_LATEST_FEED_QUESTION_SQL = """
            delete from questions
            where id = '00000000-0000-0000-0000-000000008001';
        """
        private const val INSERT_LATEST_FEED_QUESTION_SQL = """
            insert into questions (
              id,
              club_id,
              session_id,
              membership_id,
              priority,
              text,
              draft_thought,
              created_at,
              updated_at
            )
            select
              '00000000-0000-0000-0000-000000008001',
              clubs.id,
              sessions.id,
              memberships.id,
              5,
              '2030년에 작성된 최신 피드 정렬 검증 질문',
              null,
              '2030-01-01 00:00:00.000000',
              '2030-01-01 00:00:00.000000'
            from clubs
            join sessions on sessions.club_id = clubs.id
              and sessions.number = 1
            join users on users.email = 'member5@example.com'
            join memberships on memberships.club_id = clubs.id
              and memberships.user_id = users.id
            where clubs.id = '00000000-0000-0000-0000-000000000001';
        """

        private const val CLEANUP_PRIVATE_ONE_LINER_SQL = """
            delete from one_line_reviews
            where id = '00000000-0000-0000-0000-000000008101';
        """
        private const val INSERT_PRIVATE_ONE_LINER_SQL = """
            insert into one_line_reviews (
              id,
              club_id,
              session_id,
              membership_id,
              text,
              visibility,
              created_at,
              updated_at
            )
            select
              '00000000-0000-0000-0000-000000008101',
              sessions.club_id,
              sessions.id,
              memberships.id,
              '비공개 한줄평은 노트 세션 공개 카운트에서 제외됩니다.',
              'PRIVATE',
              '2030-01-02 00:00:00.000000',
              '2030-01-02 00:00:00.000000'
            from sessions
            join users on users.email = 'member1@example.com'
            join memberships on memberships.club_id = sessions.club_id
              and memberships.user_id = users.id
            where sessions.id = '00000000-0000-0000-0000-000000000306';
        """

        private const val MARK_MEMBER2_SESSION_SIX_REMOVED_SQL = """
            update session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            join users on users.id = memberships.user_id
            set session_participants.participation_status = 'REMOVED',
                session_participants.attendance_status = 'ATTENDED'
            where session_participants.club_id = '00000000-0000-0000-0000-000000000001'
              and session_participants.session_id = '00000000-0000-0000-0000-000000000306'
              and users.email = 'member2@example.com';
        """

        private const val RESET_MEMBER2_SESSION_SIX_ACTIVE_SQL = """
            update session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            join users on users.id = memberships.user_id
            set session_participants.participation_status = 'ACTIVE',
                session_participants.attendance_status = 'ATTENDED'
            where session_participants.club_id = '00000000-0000-0000-0000-000000000001'
              and session_participants.session_id = '00000000-0000-0000-0000-000000000306'
              and users.email = 'member2@example.com';
        """

        private const val CLEANUP_BULK_SESSION_HIGHLIGHTS_SQL = """
            delete from highlights
            where id >= '00000000-0000-0000-0000-000000007001'
              and id <= '00000000-0000-0000-0000-000000007125';
        """
        private const val INSERT_BULK_SESSION_HIGHLIGHTS_SQL = """
            insert into highlights (
              id,
              club_id,
              session_id,
              membership_id,
              text,
              sort_order,
              created_at,
              updated_at
            )
            with recursive sequence_numbers(n) as (
              select 1
              union all
              select n + 1
              from sequence_numbers
              where n < 125
            )
            select
              concat('00000000-0000-0000-0000-', lpad(7000 + n, 12, '0')),
              sessions.club_id,
              sessions.id,
              memberships.id,
              concat('세션 필터 무제한 하이라이트 ', n),
              1000 + n,
              '2031-01-01 00:00:00.000000',
              '2031-01-01 00:00:00.000000'
            from sequence_numbers
            join sessions on sessions.id = '00000000-0000-0000-0000-000000000306'
            join users on users.email = 'member5@example.com'
            join memberships on memberships.club_id = sessions.club_id
              and memberships.user_id = users.id;
        """

        private const val CLEANUP_HIDDEN_UNPUBLISHED_SESSION_SQL = """
            delete from questions
            where id = '00000000-0000-0000-0000-000000009062';
            delete from sessions
            where id = '00000000-0000-0000-0000-000000009061';
        """
        private const val INSERT_HIDDEN_UNPUBLISHED_SESSION_SQL = """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            select
              '00000000-0000-0000-0000-000000009061',
              clubs.id,
              906,
              '숨겨진 진행중 세션',
              '숨겨진 책',
              '숨겨진 저자',
              null,
              null,
              null,
              '2030-02-01',
              '19:00:00',
              '21:00:00',
              '온라인',
              null,
              null,
              '2030-01-31 14:59:00.000000',
              'OPEN'
            from clubs
            where clubs.id = '00000000-0000-0000-0000-000000000001';
        """
        private const val INSERT_HIDDEN_UNPUBLISHED_QUESTION_SQL = """
            insert into questions (
              id,
              club_id,
              session_id,
              membership_id,
              priority,
              text,
              draft_thought,
              created_at,
              updated_at
            )
            select
              '00000000-0000-0000-0000-000000009062',
              sessions.club_id,
              sessions.id,
              memberships.id,
              1,
              '발행되지 않은 세션 질문은 노트 피드에서 숨겨집니다.',
              null,
              '2030-02-01 00:00:00.000000',
              '2030-02-01 00:00:00.000000'
            from sessions
            join users on users.email = 'member5@example.com'
            join memberships on memberships.club_id = sessions.club_id
              and memberships.user_id = users.id
            where sessions.id = '00000000-0000-0000-0000-000000009061';
        """

        private const val CLEANUP_HIDDEN_OTHER_CLUB_SESSION_SQL = """
            delete from questions
            where id = '00000000-0000-0000-0000-000000009074';
            delete from sessions
            where id = '00000000-0000-0000-0000-000000009073';
            delete from memberships
            where id = '00000000-0000-0000-0000-000000009072';
            delete from users
            where id = '00000000-0000-0000-0000-000000009071';
            delete from clubs
            where id = '00000000-0000-0000-0000-000000000002';
        """
        private const val INSERT_HIDDEN_OTHER_CLUB_SESSION_SQL = """
            insert into clubs (id, slug, name, tagline, about)
            values (
              '00000000-0000-0000-0000-000000000002',
              'other-reading-club',
              '다른 독서모임',
              '다른 클럽',
              '다른 클럽의 데이터입니다.'
            );

            insert into users (id, google_subject_id, email, name, short_name, profile_image_url)
            values (
              '00000000-0000-0000-0000-000000009071',
              'readmates-test-other-member',
              'other.member@example.com',
              '다른회원',
              '다른',
              null
            );

            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (
              '00000000-0000-0000-0000-000000009072',
              '00000000-0000-0000-0000-000000000002',
              '00000000-0000-0000-0000-000000009071',
              'MEMBER',
              'ACTIVE',
              '2029-01-01 00:00:00.000000'
            );

            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000009073',
              '00000000-0000-0000-0000-000000000002',
              1,
              '다른 클럽 발행 세션',
              '다른 클럽 책',
              '다른 저자',
              null,
              null,
              null,
              '2030-03-01',
              '19:00:00',
              '21:00:00',
              '온라인',
              null,
              null,
              '2030-02-28 14:59:00.000000',
              'PUBLISHED'
            );
        """
        private const val INSERT_HIDDEN_OTHER_CLUB_QUESTION_SQL = """
            insert into questions (
              id,
              club_id,
              session_id,
              membership_id,
              priority,
              text,
              draft_thought,
              created_at,
              updated_at
            )
            values (
              '00000000-0000-0000-0000-000000009074',
              '00000000-0000-0000-0000-000000000002',
              '00000000-0000-0000-0000-000000009073',
              '00000000-0000-0000-0000-000000009072',
              1,
              '다른 클럽 질문은 현재 멤버에게 노출되지 않습니다.',
              null,
              '2030-03-01 00:00:00.000000',
              '2030-03-01 00:00:00.000000'
            );
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }

    private fun viewerSessionCookie(email: String): Cookie {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, 'Viewer Archive', 'Viewer', null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-viewer-archive-$userId",
            email,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'VIEWER', null)
            """.trimIndent(),
            membershipId,
            userId,
        )
        createdMembershipIds += membershipId
        val issuedSession = authSessionService.issueSession(
            userId = userId,
            userAgent = "ArchiveAndNotesDbTest",
            ipAddress = "127.0.0.1",
        )
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun insertViewerSessionParticipant(membershipId: String, sessionId: String) {
        val participantId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into session_participants (
              id,
              club_id,
              session_id,
              membership_id,
              rsvp_status,
              attendance_status,
              participation_status
            )
            values (
              ?,
              '00000000-0000-0000-0000-000000000001',
              ?,
              ?,
              'GOING',
              'ATTENDED',
              'ACTIVE'
            )
            """.trimIndent(),
            participantId,
            sessionId,
            membershipId,
        )
        createdSessionParticipantIds += participantId
    }

    private fun deleteWhereIn(tableName: String, columnName: String, values: Set<String>) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }
}
