package com.readmates.archive.api

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
                jsonPath("$.clubQuestions.length()") { value(greaterThan(0)) }
                jsonPath("$.clubQuestions[*].priority") { value(hasItems(1, 2)) }
                jsonPath("$.clubQuestions[*].text") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.clubQuestions[0].draftThought") { value(null) }
                jsonPath("$.clubQuestions[*].authorName") { value(hasItem("김호스트")) }
                jsonPath("$.clubQuestions[*].authorShortName") { value(hasItem("호스트")) }
                jsonPath("$.clubCheckins.length()") { value(greaterThan(0)) }
                jsonPath("$.clubCheckins[*].authorName") { value(hasItem("김호스트")) }
                jsonPath("$.clubCheckins[*].authorShortName") { value(hasItem("호스트")) }
                jsonPath("$.clubCheckins[*].readingProgress") { value(hasItem(100)) }
                jsonPath("$.clubCheckins[*].note") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.publicOneLiners.length()") { value(greaterThan(0)) }
                jsonPath("$.publicOneLiners[*].authorName") { value(hasItem("김호스트")) }
                jsonPath("$.publicOneLiners[*].authorShortName") { value(hasItem("호스트")) }
                jsonPath("$.publicOneLiners[*].text") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.myQuestions.length()") { value(greaterThan(0)) }
                jsonPath("$.myQuestions[*].priority") { value(hasItems(1, 2)) }
                jsonPath("$.myQuestions[*].text") { value(everyItem(not(emptyOrNullString()))) }
                jsonPath("$.myQuestions[0].draftThought") { value(null) }
                jsonPath("$.myQuestions[*].authorName") { value(hasItem("이멤버5")) }
                jsonPath("$.myQuestions[*].authorShortName") { value(hasItem("멤버5")) }
                jsonPath("$.myCheckin.authorName") { value("이멤버5") }
                jsonPath("$.myCheckin.authorShortName") { value("멤버5") }
                jsonPath("$.myCheckin.readingProgress") { value(100) }
                jsonPath("$.myCheckin.note") { value(not(emptyOrNullString())) }
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
    fun `archive session detail returns not found for same club unpublished session`() {
        mockMvc.perform(
            requestGet("/api/archive/sessions/00000000-0000-0000-0000-000000000906")
                .with(user("member5@example.com")),
        )
            .andExpect(status().isNotFound)
            .andExpect(handler().handlerType(ArchiveController::class.java))
    }

    companion object {
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

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
