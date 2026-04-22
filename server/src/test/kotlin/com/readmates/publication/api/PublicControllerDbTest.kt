package com.readmates.publication.api

import com.readmates.support.MySqlTestContainer
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class PublicControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
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
                jsonPath("$.oneLiners.length()") { value(3) }
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
                jsonPath("$.highlights[*]") {
                    value(not(hasItem("왜곡된 인센티브와 보상 구조는 투자뿐 아니라 일상 조직에서도 판단을 흔들 수 있었다.")))
                }
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
                jsonPath("$.oneLiners[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.oneLiners[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.oneLiners[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.oneLiners[*].authorShortName") { value(not(hasItem("멤버1"))) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_NON_PUBLIC_SESSION_SQL,
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
              session_date, start_time, end_time, location_label, question_deadline_at, state
            )
            values (
              '00000000-0000-0000-0000-000000000999',
              '00000000-0000-0000-0000-000000000001',
              99, '99회차 · 비공개 테스트 책', '비공개 테스트 책', '비공개 테스트 저자', null, null, null,
              '2026-12-31', '20:00', '22:00', '온라인',
              '2026-12-30 14:59:00.000000', 'PUBLISHED'
            );
            """,
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, published_at
            )
            values (
              '00000000-0000-0000-0000-000000001999',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000999',
              '공개되지 않은 테스트 요약입니다.',
              false,
              null
            );
            """,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_NON_PUBLIC_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `public surfaces exclude published non-public session`() {
        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000999")
            .andExpect {
                status { isNotFound() }
            }

        mockMvc.get("/api/public/club")
            .andExpect {
                status { isOk() }
                jsonPath("$.stats.sessions") { value(6) }
                jsonPath("$.stats.books") { value(6) }
                jsonPath("$.recentSessions[*].bookTitle") { value(not(hasItem("비공개 테스트 책"))) }
            }
    }

    companion object {
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

        private const val CLEANUP_NON_PUBLIC_SESSION_SQL = """
            delete from public_session_publications
            where session_id = '00000000-0000-0000-0000-000000000999';
            delete from sessions
            where id = '00000000-0000-0000-0000-000000000999';
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
