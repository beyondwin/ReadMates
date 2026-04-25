package com.readmates.publication.api

import com.readmates.support.MySqlTestContainer
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasItems
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class PublicControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `public club returns real published sessions`() {
        mockMvc.get("/api/public/club")
            .andExpect {
                status { isOk() }
                jsonPath("$.clubName") { value("읽는사이") }
                jsonPath("$.stats.sessions") { value(6) }
                jsonPath("$.recentSessions[0].sessionNumber") { value(6) }
                jsonPath("$.recentSessions[0].bookTitle") { value("가난한 찰리의 연감") }
                jsonPath("$.recentSessions[0].bookImageUrl") { value("https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg") }
                jsonPath("$.recentSessions[0].highlightCount") { value(3) }
                jsonPath("$.recentSessions[0].oneLinerCount") { value(3) }
                jsonPath("$.recentSessions[0].meetingUrl") { doesNotExist() }
                jsonPath("$.recentSessions[0].meetingPasscode") { doesNotExist() }
            }
    }

    @Test
    fun `public session returns details for published session`() {
        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000306")
            .andExpect {
                status { isOk() }
                jsonPath("$.sessionNumber") { value(6) }
                jsonPath("$.bookTitle") { value("가난한 찰리의 연감") }
                jsonPath("$.bookImageUrl") { value("https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg") }
                jsonPath("$.meetingUrl") { doesNotExist() }
                jsonPath("$.meetingPasscode") { doesNotExist() }
                jsonPath("$.summary") { exists() }
                jsonPath("$.highlights.length()") { value(3) }
                jsonPath("$.highlights[0].text") { value("모르는 영역을 피하는 전략과 배움을 확장하는 전략의 장단점을 비교했다.") }
                jsonPath("$.highlights[*].authorName") { value(hasItems("이멤버5", "최멤버2", "김호스트")) }
                jsonPath("$.highlights[*].authorShortName") { value(hasItems("멤버5", "멤버2", "호스트")) }
                jsonPath("$.oneLiners.length()") { value(3) }
            }
    }

    @Test
    @Sql(
        statements = [
            MARK_MEMBER5_SESSION_SIX_ONE_LINER_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_MEMBER5_SESSION_SIX_ONE_LINER_PUBLIC_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `public surfaces keep session one-liners private to members`() {
        mockMvc.get("/api/public/club")
            .andExpect {
                status { isOk() }
                jsonPath("$.recentSessions[0].sessionNumber") { value(6) }
                jsonPath("$.recentSessions[0].oneLinerCount") { value(2) }
            }

        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000306")
            .andExpect {
                status { isOk() }
                jsonPath("$.oneLiners.length()") { value(2) }
                jsonPath("$.oneLiners[*].text") { value(not(hasItem("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다."))) }
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
    fun `public surfaces exclude removed participant authored records`() {
        mockMvc.get("/api/public/club")
            .andExpect {
                status { isOk() }
                jsonPath("$.recentSessions[0].sessionNumber") { value(6) }
                jsonPath("$.recentSessions[0].highlightCount") { value(2) }
                jsonPath("$.recentSessions[0].oneLinerCount") { value(2) }
            }

        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000306")
            .andExpect {
                status { isOk() }
                jsonPath("$.highlights.length()") { value(2) }
                jsonPath("$.highlights[*].text") {
                    value(not(hasItem("왜곡된 인센티브와 보상 구조는 투자뿐 아니라 일상 조직에서도 판단을 흔들 수 있었다.")))
                }
                jsonPath("$.highlights[*].authorName") { value(not(hasItem("최멤버2"))) }
                jsonPath("$.oneLiners.length()") { value(2) }
                jsonPath("$.oneLiners[*].authorName") { value(not(hasItem("최멤버2"))) }
                jsonPath("$.oneLiners[*].text") { value(not(hasItem("전기와 연감 형식이 왜 반복해서 등장하는지 계속 묻게 됐다."))) }
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
    fun `public session anonymizes left member one-liner authors`() {
        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000301")
            .andExpect {
                status { isOk() }
                jsonPath("$.highlights[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.highlights[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.highlights[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.highlights[*].authorShortName") { value(not(hasItem("멤버1"))) }
                jsonPath("$.oneLiners[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.oneLiners[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.oneLiners[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.oneLiners[*].authorShortName") { value(not(hasItem("멤버1"))) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_TEST_SESSIONS_SQL,
            INSERT_PUBLIC_OPEN_SESSION_SQL,
            INSERT_PUBLIC_OPEN_PUBLICATION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_TEST_SESSIONS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `public club excludes public open session`() {
        mockMvc.get("/api/public/club")
            .andExpect {
                status { isOk() }
                jsonPath("$.stats.sessions") { value(6) }
                jsonPath("$.stats.books") { value(6) }
                jsonPath("$.recentSessions[*].bookTitle") { value(not(hasItem("외부 공개 테스트 책"))) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_PUBLISH_TEST_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_PUBLISH_TEST_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `public records exclude closed public visibility sessions until published`() {
        val sessionId = createSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc.put("/api/host/sessions/$sessionId/publication") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "publicSummary": "아직 공개 완료 전 요약입니다.",
                  "visibility": "PUBLIC"
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
        }

        mockMvc.get("/api/public/sessions/$sessionId").andExpect {
            status { isNotFound() }
        }

        mockMvc.post("/api/host/sessions/$sessionId/publish") {
            with(user("host@example.com"))
            with(csrf())
        }.andExpect {
            status { isOk() }
        }

        mockMvc.get("/api/public/sessions/$sessionId").andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
        }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_TEST_SESSIONS_SQL,
            INSERT_MEMBER_PUBLISHED_SESSION_SQL,
            INSERT_MEMBER_PUBLISHED_PUBLICATION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_TEST_SESSIONS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `public surfaces hide member visible published session`() {
        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000997")
            .andExpect {
                status { isNotFound() }
            }

        mockMvc.get("/api/public/club")
            .andExpect {
                status { isOk() }
                jsonPath("$.stats.sessions") { value(6) }
                jsonPath("$.stats.books") { value(6) }
                jsonPath("$.recentSessions[*].bookTitle") { value(not(hasItem("멤버 공개 테스트 책"))) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_TEST_SESSIONS_SQL,
            INSERT_HOST_ONLY_PUBLISHED_SESSION_SQL,
            INSERT_HOST_ONLY_PUBLISHED_PUBLICATION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_TEST_SESSIONS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `public surfaces hide host only published session`() {
        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000996")
            .andExpect {
                status { isNotFound() }
            }

        mockMvc.get("/api/public/club")
            .andExpect {
                status { isOk() }
                jsonPath("$.stats.sessions") { value(6) }
                jsonPath("$.stats.books") { value(6) }
                jsonPath("$.recentSessions[*].bookTitle") { value(not(hasItem("호스트 공개 테스트 책"))) }
            }
    }

    private fun createSessionSeven(): String {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
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
              ?,
              '00000000-0000-0000-0000-000000000001',
              7,
              '7회차 · 공개 전환 테스트 책',
              '공개 전환 테스트 책',
              '공개 전환 테스트 저자',
              'https://example.com/books/publication-test',
              'https://example.com/covers/publication-test.jpg',
              '2026-05-20',
              '20:00:00',
              '22:00:00',
              '온라인',
              'https://meet.google.com/readmates-test',
              'readmates',
              '2026-05-19 14:59:00',
              'OPEN'
            )
            """.trimIndent(),
            sessionId,
        )
        jdbcTemplate.update(
            """
            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, ?, memberships.id, 'NO_RESPONSE', 'UNKNOWN'
            from memberships
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
            sessionId,
        )
        return sessionId
    }

    private fun updateSessionState(sessionId: String, state: String) {
        jdbcTemplate.update(
            """
            update sessions
            set state = ?
            where id = ?
              and club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            state,
            sessionId,
        )
    }

    companion object {
        private const val MARK_MEMBER5_SESSION_SIX_ONE_LINER_SESSION_SQL = """
            update one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            set one_line_reviews.visibility = 'SESSION'
            where one_line_reviews.club_id = '00000000-0000-0000-0000-000000000001'
              and one_line_reviews.session_id = '00000000-0000-0000-0000-000000000306'
              and users.email = 'member5@example.com';
        """

        private const val RESET_MEMBER5_SESSION_SIX_ONE_LINER_PUBLIC_SQL = """
            update one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            set one_line_reviews.visibility = 'PUBLIC'
            where one_line_reviews.club_id = '00000000-0000-0000-0000-000000000001'
              and one_line_reviews.session_id = '00000000-0000-0000-0000-000000000306'
              and users.email = 'member5@example.com';
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

        private const val CLEANUP_VISIBILITY_TEST_SESSIONS_SQL = """
            delete from public_session_publications
            where session_id in (
              '00000000-0000-0000-0000-000000000998',
              '00000000-0000-0000-0000-000000000997',
              '00000000-0000-0000-0000-000000000996'
            );
            delete from sessions
            where id in (
              '00000000-0000-0000-0000-000000000998',
              '00000000-0000-0000-0000-000000000997',
              '00000000-0000-0000-0000-000000000996'
            );
        """

        private const val CLEANUP_PUBLISH_TEST_SESSION_SQL = """
            delete from public_session_publications
            where session_id = '00000000-0000-0000-0000-000000009777';
            delete from session_participants
            where session_id = '00000000-0000-0000-0000-000000009777';
            delete from sessions
            where id = '00000000-0000-0000-0000-000000009777';
        """

        private const val INSERT_PUBLIC_OPEN_SESSION_SQL = """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
              session_date, start_time, end_time, location_label, question_deadline_at, state
            )
            values (
              '00000000-0000-0000-0000-000000000998',
              '00000000-0000-0000-0000-000000000001',
              98, '98회차 · 외부 공개 테스트 책', '외부 공개 테스트 책', '외부 공개 테스트 저자', null, null, null,
              '2026-12-30', '20:00', '22:00', '온라인',
              '2026-12-29 14:59:00.000000', 'OPEN'
            );
        """

        private const val INSERT_PUBLIC_OPEN_PUBLICATION_SQL = """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values (
              '00000000-0000-0000-0000-000000001998',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000998',
              '외부 공개 테스트 요약입니다.',
              true,
              'PUBLIC',
              '2026-04-25 00:00:00.000000'
            );
        """

        private const val INSERT_MEMBER_PUBLISHED_SESSION_SQL = """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
              session_date, start_time, end_time, location_label, question_deadline_at, state
            )
            values (
              '00000000-0000-0000-0000-000000000997',
              '00000000-0000-0000-0000-000000000001',
              97, '97회차 · 멤버 공개 테스트 책', '멤버 공개 테스트 책', '멤버 공개 테스트 저자', null, null, null,
              '2026-12-29', '20:00', '22:00', '온라인',
              '2026-12-28 14:59:00.000000', 'PUBLISHED'
            );
        """

        private const val INSERT_MEMBER_PUBLISHED_PUBLICATION_SQL = """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values (
              '00000000-0000-0000-0000-000000001997',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000997',
              '멤버 공개 테스트 요약입니다.',
              true,
              'MEMBER',
              '2026-04-25 00:00:00.000000'
            );
        """

        private const val INSERT_HOST_ONLY_PUBLISHED_SESSION_SQL = """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
              session_date, start_time, end_time, location_label, question_deadline_at, state
            )
            values (
              '00000000-0000-0000-0000-000000000996',
              '00000000-0000-0000-0000-000000000001',
              96, '96회차 · 호스트 공개 테스트 책', '호스트 공개 테스트 책', '호스트 공개 테스트 저자', null, null, null,
              '2026-12-28', '20:00', '22:00', '온라인',
              '2026-12-27 14:59:00.000000', 'PUBLISHED'
            );
        """

        private const val INSERT_HOST_ONLY_PUBLISHED_PUBLICATION_SQL = """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values (
              '00000000-0000-0000-0000-000000001996',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000996',
              '호스트 공개 테스트 요약입니다.',
              true,
              'HOST_ONLY',
              '2026-04-25 00:00:00.000000'
            );
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
