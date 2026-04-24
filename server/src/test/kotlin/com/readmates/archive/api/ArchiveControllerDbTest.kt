package com.readmates.archive.api

import com.readmates.archive.adapter.`in`.web.ArchiveController
import com.readmates.support.MySqlTestContainer
import org.hamcrest.Matchers.emptyOrNullString
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasItems
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get as requestGet
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class ArchiveControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `archive session detail returns attended member detail with feedback status`() {
        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000000306") }
                jsonPath("$.sessionNumber") { value(6) }
                jsonPath("$.title") { value("6회차 · 가난한 찰리의 연감") }
                jsonPath("$.bookTitle") { value("가난한 찰리의 연감") }
                jsonPath("$.bookAuthor") { value("찰리 멍거") }
                jsonPath("$.bookImageUrl") { value("https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg") }
                jsonPath("$.date") { value("2026-04-15") }
                jsonPath("$.locationLabel") { value("온라인") }
                jsonPath("$.attendance") { value(3) }
                jsonPath("$.total") { value(6) }
                jsonPath("$.myAttendanceStatus") { value("ATTENDED") }
                jsonPath("$.isHost") { value(false) }
                jsonPath("$.publicSummary") { exists() }
                jsonPath("$.publicHighlights.length()") { value(greaterThan(0)) }
                jsonPath("$.publicHighlights[*].text") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.publicHighlights[*].sortOrder") { value(hasItem(0)) }
                jsonPath("$.publicHighlights[*].authorName") { value(hasItems("멤버5", "멤버2", "호스트")) }
                jsonPath("$.publicHighlights[*].authorShortName") { value(hasItems("멤버5", "멤버2", "호스트")) }
                jsonPath("$.clubQuestions.length()") { value(greaterThan(0)) }
                jsonPath("$.clubQuestions[*].priority") { value(hasItems(1, 2)) }
                jsonPath("$.clubQuestions[*].text") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.clubQuestions[0].draftThought") { value(null) }
                jsonPath("$.clubQuestions[*].authorName") { value(hasItem("호스트")) }
                jsonPath("$.clubQuestions[*].authorShortName") { value(hasItem("호스트")) }
                jsonPath(removedJsonPath("$.", "club", "Checkins")) { doesNotExist() }
                jsonPath("$.clubOneLiners.length()") { value(greaterThan(0)) }
                jsonPath("$.clubOneLiners[*].authorName") { value(hasItem("호스트")) }
                jsonPath("$.clubOneLiners[*].text") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.publicOneLiners.length()") { value(greaterThan(0)) }
                jsonPath("$.publicOneLiners[*].authorName") { value(hasItem("호스트")) }
                jsonPath("$.publicOneLiners[*].authorShortName") { value(hasItem("호스트")) }
                jsonPath("$.publicOneLiners[*].text") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.myQuestions.length()") { value(greaterThan(0)) }
                jsonPath("$.myQuestions[*].priority") { value(hasItems(1, 2)) }
                jsonPath("$.myQuestions[*].text") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.myQuestions[0].draftThought") { value(null) }
                jsonPath("$.myQuestions[*].authorName") { value(hasItem("멤버5")) }
                jsonPath("$.myQuestions[*].authorShortName") { value(hasItem("멤버5")) }
                jsonPath("$.myCheckin.authorName") { doesNotExist() }
                jsonPath("$.myCheckin.authorShortName") { doesNotExist() }
                jsonPath("$.myCheckin.readingProgress") { value(100) }
                jsonPath(removedJsonPath("$.my", "Checkin.", "note")) { doesNotExist() }
                jsonPath("$.myOneLineReview.text") { exists() }
                jsonPath("$.myLongReview") { value(null) }
                jsonPath("$.feedbackDocument.available") { value(true) }
                jsonPath("$.feedbackDocument.readable") { value(true) }
                jsonPath("$.feedbackDocument.lockedReason") { value(null) }
                jsonPath("$.feedbackDocument.title") { value("독서모임 6차 피드백") }
                jsonPath("$.feedbackDocument.uploadedAt") { exists() }
                jsonPath("$.feedbackDocument.sourceText") { doesNotExist() }
                jsonPath("$.feedbackDocument.body") { doesNotExist() }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_ARCHIVE_PUBLICATION_VISIBILITY_SESSIONS_SQL,
            INSERT_ARCHIVE_PUBLICATION_VISIBILITY_SESSIONS_SQL,
            INSERT_ARCHIVE_PUBLICATION_VISIBILITY_PUBLICATIONS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_ARCHIVE_PUBLICATION_VISIBILITY_SESSIONS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `member archive exposes member and public summaries but only marks public records as published`() {
        mockMvc.get("/api/archive/sessions") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[?(@.sessionNumber == 998)].published") { value(hasItem(false)) }
                jsonPath("$[?(@.sessionNumber == 997)].published") { value(hasItem(false)) }
                jsonPath("$[?(@.sessionNumber == 996)].published") { value(hasItem(true)) }
            }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000998") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.publicSummary") { value(null) }
            }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000997") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.publicSummary") { value("멤버 공개 아카이브 테스트 요약입니다.") }
            }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000996") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.publicSummary") { value("전체 공개 아카이브 테스트 요약입니다.") }
            }
    }

    @Test
    fun `archive session detail locks feedback document for member who did not attend`() {
        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
            with(user("member1@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.bookTitle") { value("가난한 찰리의 연감") }
                jsonPath("$.feedbackDocument.available") { value(true) }
                jsonPath("$.feedbackDocument.readable") { value(false) }
                jsonPath("$.feedbackDocument.lockedReason") { value("NOT_ATTENDED") }
                jsonPath("$.feedbackDocument.sourceText") { doesNotExist() }
                jsonPath("$.feedbackDocument.body") { doesNotExist() }
            }
    }

    @Test
    fun `archive session list exposes locked feedback document for member who did not attend`() {
        mockMvc.get("/api/archive/sessions") {
            with(user("member1@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.available") { value(hasItem(true)) }
                jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.readable") { value(hasItem(false)) }
                jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.lockedReason") { value(hasItem("NOT_ATTENDED")) }
                jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.title") { value(hasItem("독서모임 6차 피드백")) }
                jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.uploadedAt") { exists() }
            }
    }

    @Test
    fun `archive session detail makes feedback document readable for host`() {
        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
            with(user("host@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.isHost") { value(true) }
                jsonPath("$.feedbackDocument.available") { value(true) }
                jsonPath("$.feedbackDocument.readable") { value(true) }
                jsonPath("$.feedbackDocument.sourceText") { doesNotExist() }
                jsonPath("$.feedbackDocument.body") { doesNotExist() }
            }
    }

    @Test
    @Sql(
        statements = [
            MARK_MEMBER5_SUSPENDED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_MEMBER5_ACTIVE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `archive feedback document remains locked for suspended attended member`() {
        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.myAttendanceStatus") { value("ATTENDED") }
                jsonPath("$.feedbackDocument.available") { value(true) }
                jsonPath("$.feedbackDocument.readable") { value(false) }
                jsonPath("$.feedbackDocument.lockedReason") { value("NOT_ATTENDED") }
                jsonPath("$.feedbackDocument.sourceText") { doesNotExist() }
                jsonPath("$.feedbackDocument.body") { doesNotExist() }
            }

        mockMvc.get("/api/archive/sessions") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.available") { value(hasItem(true)) }
                jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.readable") { value(hasItem(false)) }
                jsonPath("$[?(@.sessionNumber == 6)].feedbackDocument.lockedReason") { value(hasItem("NOT_ATTENDED")) }
            }
    }

    @Test
    @Sql(
        statements = [
            MARK_SESSION6_MEMBER5_ONE_LINER_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_SESSION6_MEMBER5_ONE_LINER_PUBLIC_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `archive member detail includes session visible one-liners only in club list`() {
        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath(removedJsonPath("$.", "club", "Checkins")) { doesNotExist() }
                jsonPath("$.clubOneLiners[*].text") { value(hasItem("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.")) }
                jsonPath("$.publicOneLiners[*].text") { value(not(hasItem("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다."))) }
            }
    }

    @Test
    fun `archive session detail rejects invalid session id`() {
        mockMvc.get("/api/archive/sessions/not-a-uuid") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `archive session detail returns not found for missing session`() {
        mockMvc.perform(
            requestGet("/api/archive/sessions/00000000-0000-0000-0000-000000009999")
                .with(user("member5@example.com")),
        )
            .andExpect(status().isNotFound)
            .andExpect(handler().handlerType(ArchiveController::class.java))
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_UNPUBLISHED_SESSION_SQL,
            INSERT_UNPUBLISHED_SESSION_SQL,
            INSERT_UNPUBLISHED_SESSION_PARTICIPANT_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_UNPUBLISHED_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `archive preserved records exclude same club open sessions`() {
        mockMvc.get("/api/archive/sessions") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[*].sessionNumber") { value(not(hasItem(906))) }
            }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000906") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isNotFound() }
            }
    }

    @Test
    @Sql(
        statements = [
            MARK_SESSION6_MEMBER2_REMOVED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_SESSION6_MEMBER2_ACTIVE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `archive sessions exclude removed participant counts and authored records`() {
        mockMvc.get("/api/archive/sessions") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].sessionId") { value("00000000-0000-0000-0000-000000000306") }
                jsonPath("$[0].attendance") { value(2) }
                jsonPath("$[0].total") { value(5) }
            }

        mockMvc.get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.attendance") { value(2) }
                jsonPath("$.total") { value(5) }
                jsonPath("$.publicHighlights[*].text") {
                    value(not(hasItem("왜곡된 인센티브와 보상 구조는 투자뿐 아니라 일상 조직에서도 판단을 흔들 수 있었다.")))
                }
                jsonPath("$.clubQuestions[*].authorName") { value(not(hasItem("멤버2"))) }
                jsonPath(removedJsonPath("$.", "club", "Checkins")) { doesNotExist() }
                jsonPath("$.clubOneLiners[*].authorName") { value(not(hasItem("멤버2"))) }
                jsonPath("$.publicOneLiners[*].authorName") { value(not(hasItem("멤버2"))) }
                jsonPath("$.clubQuestions[*].text") { value(not(hasItem("찰리는 왜 전기 애호가가 되었을까? 책 제목도 전기의 형태이고, 작중 몇차례 언급된다. 전기가 다른 형태의 문학과 달리 뛰어난 점은 무엇일까?"))) }
                jsonPath("$.clubOneLiners[*].text") { value(not(hasItem("전기와 연감 형식이 왜 반복해서 등장하는지 계속 묻게 됐다."))) }
                jsonPath("$.publicOneLiners[*].text") { value(not(hasItem("전기와 연감 형식이 왜 반복해서 등장하는지 계속 묻게 됐다."))) }
            }
    }

    companion object {
        private fun removedJsonPath(vararg parts: String) = parts.joinToString(separator = "")

        private const val MARK_SESSION6_MEMBER5_ONE_LINER_SESSION_SQL = """
            update one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            set one_line_reviews.visibility = 'SESSION'
            where one_line_reviews.session_id = '00000000-0000-0000-0000-000000000306'
              and one_line_reviews.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'member5@example.com';
        """

        private const val RESET_SESSION6_MEMBER5_ONE_LINER_PUBLIC_SQL = """
            update one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            set one_line_reviews.visibility = 'PUBLIC'
            where one_line_reviews.session_id = '00000000-0000-0000-0000-000000000306'
              and one_line_reviews.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'member5@example.com';
        """

        private const val MARK_SESSION6_MEMBER2_REMOVED_SQL = """
            update session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            join users on users.id = memberships.user_id
            set session_participants.participation_status = 'REMOVED'
            where session_participants.session_id = '00000000-0000-0000-0000-000000000306'
              and session_participants.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'member2@example.com';
        """

        private const val RESET_SESSION6_MEMBER2_ACTIVE_SQL = """
            update session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            join users on users.id = memberships.user_id
            set session_participants.participation_status = 'ACTIVE'
            where session_participants.session_id = '00000000-0000-0000-0000-000000000306'
              and session_participants.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'member2@example.com';
        """

        private const val MARK_MEMBER5_SUSPENDED_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'SUSPENDED'
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'member5@example.com';
        """

        private const val RESET_MEMBER5_ACTIVE_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'ACTIVE'
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'member5@example.com';
        """

        private const val CLEANUP_UNPUBLISHED_SESSION_SQL = """
            delete from session_feedback_documents
            where session_id = '00000000-0000-0000-0000-000000000906';
            delete from public_session_publications
            where session_id = '00000000-0000-0000-0000-000000000906';
            delete from highlights
            where session_id = '00000000-0000-0000-0000-000000000906';
            delete from long_reviews
            where session_id = '00000000-0000-0000-0000-000000000906';
            delete from one_line_reviews
            where session_id = '00000000-0000-0000-0000-000000000906';
            delete from questions
            where session_id = '00000000-0000-0000-0000-000000000906';
            delete from reading_checkins
            where session_id = '00000000-0000-0000-0000-000000000906';
            delete from session_participants
            where session_id = '00000000-0000-0000-0000-000000000906';
            delete from sessions
            where id = '00000000-0000-0000-0000-000000000906';
        """

        private const val INSERT_UNPUBLISHED_SESSION_SQL = """
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
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000000906',
              '00000000-0000-0000-0000-000000000001',
              906,
              '906회차 · 미공개 테스트 책',
              '미공개 테스트 책',
              '미공개 테스트 저자',
              null,
              null,
              null,
              '2026-12-31',
              '20:00',
              '22:00',
              '온라인',
              '2026-12-30 14:59:00.000000',
              'OPEN'
            );
        """

        private const val INSERT_UNPUBLISHED_SESSION_PARTICIPANT_SQL = """
            insert into session_participants (
              id,
              club_id,
              session_id,
              membership_id,
              rsvp_status,
              attendance_status
            )
            select
              '00000000-0000-0000-0000-000000001906',
              sessions.club_id,
              sessions.id,
              memberships.id,
              'GOING',
              'ATTENDED'
            from sessions
            join memberships on memberships.club_id = sessions.club_id
            join users on users.id = memberships.user_id
            where sessions.id = '00000000-0000-0000-0000-000000000906'
              and users.email = 'member5@example.com';
        """

        private const val CLEANUP_ARCHIVE_PUBLICATION_VISIBILITY_SESSIONS_SQL = """
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

        private const val INSERT_ARCHIVE_PUBLICATION_VISIBILITY_SESSIONS_SQL = """
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
              question_deadline_at,
              state
            )
            values
            (
              '00000000-0000-0000-0000-000000000998',
              '00000000-0000-0000-0000-000000000001',
              998,
              '998회차 · 호스트 전용 아카이브 테스트 책',
              '호스트 전용 아카이브 테스트 책',
              '호스트 전용 아카이브 테스트 저자',
              null,
              null,
              null,
              '2026-12-30',
              '20:00',
              '22:00',
              '온라인',
              '2026-12-29 14:59:00.000000',
              'PUBLISHED'
            ),
            (
              '00000000-0000-0000-0000-000000000997',
              '00000000-0000-0000-0000-000000000001',
              997,
              '997회차 · 멤버 공개 아카이브 테스트 책',
              '멤버 공개 아카이브 테스트 책',
              '멤버 공개 아카이브 테스트 저자',
              null,
              null,
              null,
              '2026-12-29',
              '20:00',
              '22:00',
              '온라인',
              '2026-12-28 14:59:00.000000',
              'PUBLISHED'
            ),
            (
              '00000000-0000-0000-0000-000000000996',
              '00000000-0000-0000-0000-000000000001',
              996,
              '996회차 · 전체 공개 아카이브 테스트 책',
              '전체 공개 아카이브 테스트 책',
              '전체 공개 아카이브 테스트 저자',
              null,
              null,
              null,
              '2026-12-28',
              '20:00',
              '22:00',
              '온라인',
              '2026-12-27 14:59:00.000000',
              'PUBLISHED'
            );
        """

        private const val INSERT_ARCHIVE_PUBLICATION_VISIBILITY_PUBLICATIONS_SQL = """
            insert into public_session_publications (
              id,
              club_id,
              session_id,
              public_summary,
              is_public,
              visibility,
              published_at
            )
            values
            (
              '00000000-0000-0000-0000-000000001998',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000998',
              '호스트 전용 아카이브 테스트 요약입니다.',
              false,
              'HOST_ONLY',
              null
            ),
            (
              '00000000-0000-0000-0000-000000001997',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000997',
              '멤버 공개 아카이브 테스트 요약입니다.',
              false,
              'MEMBER',
              null
            ),
            (
              '00000000-0000-0000-0000-000000001996',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000996',
              '전체 공개 아카이브 테스트 요약입니다.',
              true,
              'PUBLIC',
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
