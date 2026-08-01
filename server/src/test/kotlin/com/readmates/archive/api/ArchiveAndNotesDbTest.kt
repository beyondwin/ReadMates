package com.readmates.archive.api

import com.jayway.jsonpath.JsonPath
import com.readmates.archive.application.port.`in`.GetMyPageSummaryUseCase
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import com.readmates.support.QueryCounter
import com.readmates.support.QueryCountingDataSourcePostProcessor
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.emptyOrNullString
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasItems
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
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
@Tag("integration")
class ArchiveAndNotesDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val getMyPageSummaryUseCase: GetMyPageSummaryUseCase,
) : ReadmatesMySqlIntegrationTestSupport() {
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
        mockMvc
            .get("/api/archive/sessions") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(7) }
                jsonPath("$.items[0].sessionNumber") { value(7) }
                jsonPath("$.items[0].bookTitle") { value("괴테는 모든 것을 말했다") }
                jsonPath("$.items[0].bookImageUrl") {
                    value("https://image.aladin.co.kr/product/37676/59/cover500/s612137162_1.jpg")
                }
                jsonPath("$.items[0].state") { value("PUBLISHED") }
                jsonPath("$.items[6].sessionNumber") { value(1) }
                jsonPath("$.items[6].bookTitle") { value("팩트풀니스") }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_SAMPLE_CLUB_ARCHIVE_ISOLATION_SQL,
            INSERT_SAMPLE_CLUB_MEMBER5_MEMBERSHIP_SQL,
            INSERT_SAMPLE_CLUB_ARCHIVE_SESSION_SQL,
            INSERT_SAMPLE_CLUB_ARCHIVE_PARTICIPANT_SQL,
            INSERT_SAMPLE_CLUB_ARCHIVE_PUBLICATION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_SAMPLE_CLUB_ARCHIVE_ISOLATION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `archive sessions are scoped by requested club slug for the same member`() {
        mockMvc
            .get("/api/archive/sessions") {
                header("X-Readmates-Club-Slug", "reading-sai")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(7) }
                jsonPath("$.items[*].bookTitle") { value(hasItem("가난한 찰리의 연감")) }
                jsonPath("$.items[*].bookTitle") { value(not(hasItem("샘플 클럽 아카이브 테스트 책"))) }
            }

        mockMvc
            .get("/api/archive/sessions") {
                header("X-Readmates-Club-Slug", "sample-book-club")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(1) }
                jsonPath("$.items[0].sessionId") { value("00000000-0000-0000-0000-000000009181") }
                jsonPath("$.items[0].bookTitle") { value("샘플 클럽 아카이브 테스트 책") }
                jsonPath("$.items[*].bookTitle") { value(not(hasItem("가난한 찰리의 연감"))) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_ACTOR_MATRIX_SQL,
            INSERT_VISIBILITY_ACTOR_MATRIX_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_ACTOR_MATRIX_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `member archive visibility matrix distinguishes non attendee attendee host and cross club actors`() {
        val publicSessionId = "00000000-0000-0000-0000-0000000092b1"
        val memberSessionId = "00000000-0000-0000-0000-0000000092b2"
        val hostOnlySessionId = "00000000-0000-0000-0000-0000000092b3"
        val matrixSessionIds = listOf(publicSessionId, memberSessionId, hostOnlySessionId)
        val actorCases =
            listOf(
                VisibilityActorCase("member4@example.com", "active non-attendee member", isAttendee = false),
                VisibilityActorCase("member5@example.com", "active attendee", isAttendee = true),
                VisibilityActorCase("host@example.com", "active host", isAttendee = false),
            )

        assertVisibilityActorFixtures(actorCases, matrixSessionIds)

        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$publicSessionId")
            .andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(publicSessionId) }
            }
        listOf(memberSessionId, hostOnlySessionId).forEach { deniedSessionId ->
            mockMvc
                .get("/api/public/clubs/reading-sai/sessions/$deniedSessionId")
                .andExpect {
                    status { isNotFound() }
                }
        }

        actorCases.forEach { actor ->
            assertArchiveVisibilityContract(actor, publicSessionId, memberSessionId, hostOnlySessionId)
        }

        mockMvc
            .get("/api/host/sessions/$hostOnlySessionId") {
                header("X-Readmates-Club-Slug", "reading-sai")
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(hostOnlySessionId) }
                jsonPath("$.visibility") { value("HOST_ONLY") }
            }

        listOf(publicSessionId, memberSessionId, hostOnlySessionId).forEach { otherClubSessionId ->
            mockMvc
                .get("/api/archive/sessions/$otherClubSessionId") {
                    header("X-Readmates-Club-Slug", "sample-book-club")
                    with(user("member5@example.com"))
                }.andExpect {
                    status { isNotFound() }
                }
        }
    }

    private fun assertVisibilityActorFixtures(
        actors: List<VisibilityActorCase>,
        sessionIds: List<String>,
    ) {
        actors.forEach { actor ->
            val participantRows = visibilityMatrixParticipantRows(actor.email, sessionIds)
            if (actor.isAttendee) {
                assertEquals(
                    sessionIds,
                    participantRows.map { it["session_id"] },
                    "${actor.description} fixture must attend every visibility-matrix session",
                )
                participantRows.forEach { participant ->
                    assertEquals("GOING", participant["rsvp_status"], "${actor.description} RSVP fixture")
                    assertEquals(
                        "ATTENDED",
                        participant["attendance_status"],
                        "${actor.description} attendance fixture",
                    )
                    assertEquals(
                        "ACTIVE",
                        participant["participation_status"],
                        "${actor.description} participation fixture",
                    )
                }
            } else {
                assertEquals(
                    emptyList<Map<String, Any?>>(),
                    participantRows,
                    "${actor.description} fixture must not have visibility-matrix participation",
                )
            }
        }
    }

    private fun assertArchiveVisibilityContract(
        actor: VisibilityActorCase,
        publicSessionId: String,
        memberSessionId: String,
        hostOnlySessionId: String,
    ) {
        listOf(
            publicSessionId to "PUBLIC",
            memberSessionId to "MEMBER",
        ).forEach { (visibleSessionId, visibility) ->
            val resultActions =
                mockMvc
                    .get("/api/archive/sessions/$visibleSessionId") {
                        header("X-Readmates-Club-Slug", "reading-sai")
                        with(user(actor.email))
                    }
            assertEquals(
                200,
                resultActions.andReturn().response.status,
                "${actor.description} must receive the current $visibility visibility contract",
            )
            resultActions.andExpect {
                jsonPath("$.sessionId") { value(visibleSessionId) }
            }
        }

        val hostOnlyResult =
            mockMvc
                .get("/api/archive/sessions/$hostOnlySessionId") {
                    header("X-Readmates-Club-Slug", "reading-sai")
                    with(user(actor.email))
                }
        assertEquals(
            404,
            hostOnlyResult.andReturn().response.status,
            "${actor.description} must not receive host-only archive visibility",
        )
    }

    private fun visibilityMatrixParticipantRows(
        email: String,
        sessionIds: List<String>,
    ): List<Map<String, Any?>> =
        jdbcTemplate.queryForList(
            """
            select
              session_participants.session_id,
              session_participants.rsvp_status,
              session_participants.attendance_status,
              session_participants.participation_status
            from session_participants
            join memberships on memberships.id = session_participants.membership_id
            join users on users.id = memberships.user_id
            where users.email = ?
              and session_participants.session_id in (?, ?, ?)
            order by session_participants.session_id
            """.trimIndent(),
            email,
            sessionIds[0],
            sessionIds[1],
            sessionIds[2],
        )

    private data class VisibilityActorCase(
        val email: String,
        val description: String,
        val isAttendee: Boolean,
    )

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

        mockMvc
            .get("/api/archive/sessions") {
                cookie(cookie)
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[*].sessionNumber") { value(hasItems(997, 6)) }
                jsonPath("$.items[*].sessionNumber") { value(not(hasItem(998))) }
                jsonPath("$.items[?(@.sessionNumber == 997)].state") { value(hasItem("CLOSED")) }
                jsonPath("$.items[*].sessionNumber") { value(not(hasItem(999))) }
                jsonPath("$.items[?(@.sessionNumber == 6)].feedbackDocument.available") { value(hasItem(true)) }
                jsonPath("$.items[?(@.sessionNumber == 6)].feedbackDocument.readable") { value(hasItem(false)) }
                jsonPath("$.items[?(@.sessionNumber == 6)].feedbackDocument.lockedReason") {
                    value(hasItem("ACTIVE_MEMBERSHIP_REQUIRED"))
                }
            }

        mockMvc
            .get("/api/archive/sessions/00000000-0000-0000-0000-000000009992") {
                cookie(cookie)
            }.andExpect {
                status { isNotFound() }
            }

        mockMvc
            .get("/api/archive/sessions/00000000-0000-0000-0000-000000009993") {
                cookie(cookie)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionNumber") { value(997) }
                jsonPath("$.state") { value("CLOSED") }
                jsonPath("$.attendance") { value(0) }
                jsonPath("$.total") { value(0) }
            }

        mockMvc
            .get("/api/archive/sessions/00000000-0000-0000-0000-000000000301") {
                cookie(cookie)
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionNumber") { value(1) }
                jsonPath("$.state") { value("PUBLISHED") }
            }

        mockMvc
            .get("/api/archive/sessions/00000000-0000-0000-0000-000000009991") {
                cookie(cookie)
            }.andExpect {
                status { isNotFound() }
            }

        mockMvc
            .get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
                cookie(cookie)
            }.andExpect {
                status { isOk() }
                jsonPath("$.myAttendanceStatus") { value("ATTENDED") }
                jsonPath("$.feedbackDocument.available") { value(true) }
                jsonPath("$.feedbackDocument.readable") { value(false) }
            }

        mockMvc
            .get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
                cookie(cookie)
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_MY_ARCHIVE_LONG_REVIEW_SQL,
            INSERT_MY_ARCHIVE_LONG_REVIEW_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_MY_ARCHIVE_LONG_REVIEW_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `personal journey keeps whole-summary metadata exact across limit one cursor pages`() {
        mockMvc
            .get("/api/archive/me/journey") {
                param("limit", "1")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(1) }
                jsonPath("$.items[0].sessionId") { value("00000000-0000-0000-0000-000000000307") }
                jsonPath("$.items[0].readingProgress") { value(null) }
                jsonPath("$.summary.attendedSessionCount") { value(4) }
                jsonPath("$.summary.completedReadingCount") { value(4) }
                jsonPath("$.summary.questionCount") { value(9) }
                jsonPath("$.summary.reviewCount") { value(1) }
                jsonPath("$.summary.readableFeedbackDocumentCount") { value(7) }
                jsonPath("$.nextCursor") { exists() }
            }

        assertThat(collectJourneySessionIds())
            .containsExactly(
                "00000000-0000-0000-0000-000000000307",
                "00000000-0000-0000-0000-000000000306",
                "00000000-0000-0000-0000-000000000305",
                "00000000-0000-0000-0000-000000000304",
                "00000000-0000-0000-0000-000000000303",
                "00000000-0000-0000-0000-000000000302",
                "00000000-0000-0000-0000-000000000301",
            ).doesNotHaveDuplicates()
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_MY_ARCHIVE_LONG_REVIEW_SQL,
            INSERT_MY_ARCHIVE_LONG_REVIEW_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_MY_ARCHIVE_LONG_REVIEW_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `personal journey exposes only metadata and excludes private archive content`() {
        val fullResponse =
            mockMvc
                .get("/api/archive/me/journey") {
                    param("limit", "12")
                    with(user("member5@example.com"))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(7) }
                    jsonPath("$.items[*].feedbackDocument.title") { doesNotExist() }
                    jsonPath("$.items[*].feedbackDocument.uploadedAt") { doesNotExist() }
                    jsonPath("$.items[*].feedbackDocument.content") { doesNotExist() }
                    jsonPath("$.items[*].questionText") { doesNotExist() }
                    jsonPath("$.items[*].reviewBody") { doesNotExist() }
                    jsonPath("$.items[*].memberName") { doesNotExist() }
                    jsonPath("$.items[*].email") { doesNotExist() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(fullResponse)
            .doesNotContain(
                MY_ARCHIVE_LONG_REVIEW_TEXT,
                "삶에서 진짜 실패란 무엇일까요?",
                "이 회차는 책의 핵심 개념인 소득 4단계",
                "김호스트",
                "host@example.com",
            )
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_ACTOR_MATRIX_SQL,
            INSERT_VISIBILITY_ACTOR_MATRIX_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_VISIBILITY_ACTOR_MATRIX_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `personal journey is club scoped and includes closed and published member-visible activity only`() {
        mockMvc
            .get("/api/archive/me/journey") {
                param("limit", "100")
                header("X-Readmates-Club-Slug", "reading-sai")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[*].sessionId") {
                    value(
                        hasItems(
                            "00000000-0000-0000-0000-0000000092b1",
                            "00000000-0000-0000-0000-0000000092b2",
                            "00000000-0000-0000-0000-000000000306",
                        ),
                    )
                }
                jsonPath("$.items[*].sessionId") {
                    value(
                        not(
                            hasItems(
                                "00000000-0000-0000-0000-0000000092b3",
                                "00000000-0000-0000-0000-0000000092bb",
                            ),
                        ),
                    )
                }
            }

        mockMvc
            .get("/api/archive/me/journey") {
                param("limit", "100")
                header("X-Readmates-Club-Slug", "sample-book-club")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[*].sessionId") { value(hasItem("00000000-0000-0000-0000-0000000092bb")) }
                jsonPath("$.items[*].sessionId") {
                    value(
                        not(
                            hasItems(
                                "00000000-0000-0000-0000-0000000092b1",
                                "00000000-0000-0000-0000-0000000092b2",
                                "00000000-0000-0000-0000-0000000092b3",
                            ),
                        ),
                    )
                }
            }
    }

    private fun collectJourneySessionIds(): List<String> {
        val collectedSessionIds = mutableListOf<String>()
        var cursor: String? = null
        var pageCount = 0
        do {
            val response =
                mockMvc
                    .get("/api/archive/me/journey") {
                        param("limit", "1")
                        cursor?.let { param("cursor", it) }
                        with(user("member5@example.com"))
                    }.andExpect {
                        status { isOk() }
                        jsonPath("$.items.length()") { value(1) }
                    }.andReturn()
                    .response
                    .contentAsString
            collectedSessionIds += JsonPath.read<List<String>>(response, "$.items[*].sessionId")
            cursor = JsonPath.read<String?>(response, "$.nextCursor")
            pageCount += 1
            assertThat(pageCount).isLessThanOrEqualTo(7)
        } while (cursor != null)
        assertNull(cursor)
        return collectedSessionIds
    }

    @Test
    fun `personal journey follows member browsing access and keeps non-active feedback locked`() {
        listOf("member5@example.com", "host@example.com").forEach { activeEmail ->
            mockMvc
                .get("/api/archive/me/journey") {
                    with(user(activeEmail))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(7) }
                    jsonPath("$.items[*].feedbackDocument.readable") { value(everyItem(equalTo(true))) }
                    jsonPath("$.summary.readableFeedbackDocumentCount") { value(7) }
                }
        }

        listOf(MembershipStatus.VIEWER, MembershipStatus.SUSPENDED).forEach { status ->
            val cookie =
                membershipSessionCookie(
                    email = "journey.${status.name.lowercase()}.${UUID.randomUUID()}@example.com",
                    status = status,
                )
            mockMvc
                .get("/api/archive/me/journey") {
                    cookie(cookie)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(7) }
                    jsonPath("$.items[*].feedbackDocument.available") { value(everyItem(equalTo(true))) }
                    jsonPath("$.items[*].feedbackDocument.readable") { value(everyItem(equalTo(false))) }
                    jsonPath("$.items[*].feedbackDocument.lockedReason") {
                        value(everyItem(equalTo("ACTIVE_MEMBERSHIP_REQUIRED")))
                    }
                    jsonPath("$.summary.readableFeedbackDocumentCount") { value(0) }
                }
        }

        listOf(MembershipStatus.INVITED, MembershipStatus.LEFT, MembershipStatus.INACTIVE).forEach { status ->
            val cookie =
                membershipSessionCookie(
                    email = "journey.${status.name.lowercase()}.${UUID.randomUUID()}@example.com",
                    status = status,
                )
            mockMvc
                .get("/api/archive/me/journey") {
                    header("X-Readmates-Club-Slug", "reading-sai")
                    cookie(cookie)
                }.andExpect {
                    status { isUnauthorized() }
                }
        }
    }

    @Test
    fun `notes feed includes seeded prepared questions`() {
        mockMvc
            .get("/api/notes/feed") {
                param("limit", "120")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(greaterThan(0)) }
                jsonPath("$.items[0].kind") { value(not(emptyOrNullString())) }
                jsonPath("$.items[0].text") { value(not(emptyOrNullString())) }
                jsonPath("$.items[*].kind") {
                    value(hasItems("QUESTION", "ONE_LINE_REVIEW", "HIGHLIGHT"))
                }
                jsonPath("$.items[*].text") {
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
        mockMvc
            .get("/api/notes/feed") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].bookTitle") { exists() }
                jsonPath("$.items[0].date") { exists() }
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
        mockMvc
            .get("/api/notes/sessions") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(7) }
                jsonPath("$.items[0].sessionId") { value("00000000-0000-0000-0000-000000000307") }
                jsonPath("$.items[0].sessionNumber") { value(7) }
                jsonPath("$.items[0].bookTitle") { value("괴테는 모든 것을 말했다") }
                jsonPath("$.items[0].date") { value("2026-05-14") }
                jsonPath("$.items[0].questionCount") { value(0) }
                jsonPath("$.items[0].oneLinerCount") { value(0) }
                jsonPath("$.items[0].highlightCount") { value(0) }
                jsonPath(removedJsonPath("$.items[0].", "check", "inCount")) { doesNotExist() }
                jsonPath("$.items[0].totalCount") { value(0) }
                jsonPath("$.items[?(@.sessionNumber == 6)].questionCount") { value(hasItem(6)) }
                jsonPath("$.items[?(@.sessionNumber == 6)].oneLinerCount") { value(hasItem(3)) }
                jsonPath("$.items[?(@.sessionNumber == 6)].highlightCount") { value(hasItem(3)) }
                jsonPath("$.items[?(@.sessionNumber == 6)].totalCount") { value(hasItem(12)) }
                jsonPath("$.items[6].sessionNumber") { value(1) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_HOST_ONLY_PUBLISHED_NOTE_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_HOST_ONLY_PUBLISHED_NOTE_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `notes surfaces exclude host only published records`() {
        insertHostOnlyPublishedSessionWithOneLine(number = 90)

        mockMvc
            .get("/api/notes/sessions") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[*].sessionNumber") { value(not(hasItem(90))) }
            }

        mockMvc
            .get("/api/notes/feed") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[*].sessionNumber") { value(not(hasItem(90))) }
                jsonPath("$.items[*].text") { value(not(hasItem(HOST_ONLY_PUBLISHED_NOTE_TEXT))) }
            }

        mockMvc
            .get("/api/notes/feed") {
                param("sessionId", HOST_ONLY_PUBLISHED_NOTE_SESSION_ID)
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(0) }
                jsonPath("$.items[*].text") { value(not(hasItem(HOST_ONLY_PUBLISHED_NOTE_TEXT))) }
            }
    }

    @Test
    fun `closed public session appears in archive but not notes until published`() {
        val sessionId = insertClosedPublicSessionWithQuestion(number = 91)

        try {
            mockMvc
                .get("/api/archive/sessions") {
                    with(user("member1@example.com"))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].sessionNumber") { value(hasItem(91)) }
                }

            mockMvc
                .get("/api/notes/sessions") {
                    with(user("member1@example.com"))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].sessionNumber") { value(not(hasItem(91))) }
                }

            jdbcTemplate.update(
                """
                update sessions
                set state = 'PUBLISHED'
                where id = ?
                """.trimIndent(),
                sessionId,
            )

            mockMvc
                .get("/api/notes/sessions") {
                    with(user("member1@example.com"))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].sessionNumber") { value(hasItem(91)) }
                }
        } finally {
            cleanupClosedPublicSessionWithQuestion(sessionId)
        }
    }

    private fun insertHostOnlyPublishedSessionWithOneLine(number: Int) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator,
              book_link, book_image_url, session_date, start_time, end_time,
              location_label, meeting_url, meeting_passcode, question_deadline_at,
              state, visibility
            )
            values (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, '테스트 저자',
              null, null, null, '2026-09-16', '20:00:00', '22:00:00',
              '온라인', null, null, '2026-09-15 14:59:00.000000', 'CLOSED', 'HOST_ONLY')
            """.trimIndent(),
            HOST_ONLY_PUBLISHED_NOTE_SESSION_ID,
            number,
            "${number}회차 · 호스트 전용",
            "호스트 전용 책 $number",
        )
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            values (?, '00000000-0000-0000-0000-000000000001', ?, '00000000-0000-0000-0000-000000000202',
              'GOING', 'ATTENDED', 'ACTIVE')
            """.trimIndent(),
            HOST_ONLY_PUBLISHED_NOTE_PARTICIPANT_ID,
            HOST_ONLY_PUBLISHED_NOTE_SESSION_ID,
        )
        jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            values (?, '00000000-0000-0000-0000-000000000001', ?, '00000000-0000-0000-0000-000000000202',
              ?, 'PUBLIC')
            """.trimIndent(),
            HOST_ONLY_PUBLISHED_NOTE_REVIEW_ID,
            HOST_ONLY_PUBLISHED_NOTE_SESSION_ID,
            HOST_ONLY_PUBLISHED_NOTE_TEXT,
        )
    }

    private fun insertClosedPublicSessionWithQuestion(number: Int): String {
        val sessionId = "00000000-0000-0000-0000-000000009091"
        cleanupClosedPublicSessionWithQuestion(sessionId)
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator,
              book_link, book_image_url, session_date, start_time, end_time,
              location_label, meeting_url, meeting_passcode, question_deadline_at,
              state, visibility
            )
            values (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, '테스트 저자',
              null, null, null, '2026-10-21', '20:00:00', '22:00:00',
              '온라인', null, null, '2026-10-20 14:59:00.000000', 'CLOSED', 'PUBLIC')
            """.trimIndent(),
            sessionId,
            number,
            "${number}회차 · 닫힌 공개 테스트",
            "닫힌 공개 테스트 책",
        )
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            values ('00000000-0000-0000-0000-000000009191', '00000000-0000-0000-0000-000000000001', ?,
              '00000000-0000-0000-0000-000000000202', 'GOING', 'ATTENDED', 'ACTIVE')
            """.trimIndent(),
            sessionId,
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values ('00000000-0000-0000-0000-000000009291', '00000000-0000-0000-0000-000000000001', ?,
              '닫힌 공개 테스트 요약입니다.', true, 'PUBLIC', utc_timestamp(6))
            """.trimIndent(),
            sessionId,
        )
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            values ('00000000-0000-0000-0000-000000009391', '00000000-0000-0000-0000-000000000001', ?,
              '00000000-0000-0000-0000-000000000202', 1, '닫힌 공개 테스트 질문입니다.', null)
            """.trimIndent(),
            sessionId,
        )
        return sessionId
    }

    private fun cleanupClosedPublicSessionWithQuestion(sessionId: String) {
        jdbcTemplate.update("delete from questions where session_id = ?", sessionId)
        jdbcTemplate.update("delete from session_participants where session_id = ?", sessionId)
        jdbcTemplate.update("delete from public_session_publications where session_id = ?", sessionId)
        jdbcTemplate.update("delete from sessions where id = ?", sessionId)
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_NOTE_FEED_LONG_REVIEWS_SQL,
            INSERT_NOTE_FEED_LONG_REVIEWS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_NOTE_FEED_LONG_REVIEWS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `notes sessions and feed include public long reviews only`() {
        mockMvc
            .get("/api/notes/sessions") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[?(@.sessionNumber == 6)].longReviewCount") { value(hasItem(1)) }
                jsonPath("$.items[?(@.sessionNumber == 6)].totalCount") { value(hasItem(13)) }
            }

        mockMvc
            .get("/api/notes/feed") {
                param("sessionId", "00000000-0000-0000-0000-000000000306")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(13) }
                jsonPath("$.items[*].kind") { value(hasItem("LONG_REVIEW")) }
                jsonPath("$.items[*].text") { value(hasItem(PUBLIC_NOTE_FEED_LONG_REVIEW_TEXT)) }
                jsonPath("$.items[*].text") { value(not(hasItem(PRIVATE_NOTE_FEED_LONG_REVIEW_TEXT))) }
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
        mockMvc
            .get("/api/notes/sessions") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[?(@.sessionNumber == 6)].questionCount") { value(hasItem(4)) }
                jsonPath("$.items[?(@.sessionNumber == 6)].oneLinerCount") { value(hasItem(2)) }
                jsonPath("$.items[?(@.sessionNumber == 6)].highlightCount") { value(hasItem(2)) }
                jsonPath(removedJsonPath("$.items[?(@.sessionNumber == 6)].", "check", "inCount")) {
                    value(empty<Any>())
                }
                jsonPath("$.items[?(@.sessionNumber == 6)].totalCount") { value(hasItem(8)) }
            }

        mockMvc
            .get("/api/notes/feed") {
                param("sessionId", "00000000-0000-0000-0000-000000000306")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(8) }
                jsonPath("$.items[*].text") {
                    value(not(hasItem("찰리는 왜 전기 애호가가 되었을까? 책 제목도 전기의 형태이고, 작중 몇차례 언급된다. 전기가 다른 형태의 문학과 달리 뛰어난 점은 무엇일까?")))
                }
                jsonPath("$.items[*].text") { value(not(hasItem("전기와 연감 형식이 왜 반복해서 등장하는지 계속 묻게 됐다."))) }
                jsonPath("$.items[*].text") { value(not(hasItem("왜곡된 인센티브와 보상 구조는 투자뿐 아니라 일상 조직에서도 판단을 흔들 수 있었다."))) }
                jsonPath("$.items[*].text") { value(not(hasItem("전기의 효용과 정의의 주장을 중심으로 질문을 정리했습니다."))) }
                jsonPath("$.items[*].text") { value(hasItem("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.")) }
            }
    }

    @Test
    fun `notes feed can be filtered to a published session in the same club`() {
        mockMvc
            .get("/api/notes/feed") {
                param("sessionId", "00000000-0000-0000-0000-000000000306")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(12) }
                jsonPath("$.items[*].sessionId") { value(everyItem(equalTo("00000000-0000-0000-0000-000000000306"))) }
                jsonPath("$.items[*].kind") {
                    value(hasItems("QUESTION", "ONE_LINE_REVIEW", "HIGHLIGHT"))
                }
                jsonPath("$.items[*].kind") {
                    value(not(hasItem("CHECKIN")))
                }
                jsonPath("$.items[*].text") {
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
    fun `notes feed applies cursor page limit to whole feed and session feed`() {
        mockMvc
            .get("/api/notes/feed") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(60) }
                jsonPath("$.nextCursor") { exists() }
            }

        mockMvc
            .get("/api/notes/feed") {
                param("sessionId", "00000000-0000-0000-0000-000000000306")
                param("limit", "120")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(120) }
                jsonPath("$.nextCursor") { exists() }
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
            mockMvc
                .get("/api/notes/feed") {
                    param("sessionId", sessionId)
                    with(user("member5@example.com"))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(0) }
                }
        }
    }

    @Test
    fun `notes feed uses seeded highlight authors`() {
        mockMvc
            .get("/api/notes/feed") {
                param("limit", "120")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[?(@.kind == 'HIGHLIGHT')].authorName") { value(hasItems("멤버5", "멤버2", "호스트")) }
                jsonPath("$.items[?(@.kind == 'HIGHLIGHT')].authorShortName") { value(hasItems("멤버5", "멤버2", "호스트")) }
            }
    }

    @Test
    @Sql(
        statements = [
            RENAME_MEMBER5_DISPLAY_NAME_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            RESET_MEMBER5_DISPLAY_NAME_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `archive detail and notes feed author names use the latest member display name`() {
        mockMvc
            .get("/api/notes/feed") {
                param("sessionId", "00000000-0000-0000-0000-000000000306")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[?(@.kind == 'QUESTION')].authorName") { value(hasItem("새멤버5")) }
                jsonPath("$.items[?(@.kind == 'ONE_LINE_REVIEW')].authorName") { value(hasItem("새멤버5")) }
                jsonPath("$.items[?(@.kind == 'HIGHLIGHT')].authorName") { value(hasItem("새멤버5")) }
                jsonPath("$.items[*].authorName") { value(not(hasItem("이멤버5"))) }
                jsonPath("$.items[*].avatarKey") { value(hasItem("penguin-beret-book")) }
            }

        mockMvc
            .get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.publicHighlights[*].authorName") { value(hasItem("새멤버5")) }
                jsonPath("$.clubQuestions[*].authorName") { value(hasItem("새멤버5")) }
                jsonPath("$.clubOneLiners[*].authorName") { value(hasItem("새멤버5")) }
                jsonPath("$.publicOneLiners[*].authorName") { value(hasItem("새멤버5")) }
                jsonPath("$.myQuestions[*].authorName") { value(hasItem("새멤버5")) }
                jsonPath("$.publicHighlights[*].authorName") { value(not(hasItem("이멤버5"))) }
                jsonPath("$.clubQuestions[*].authorName") { value(not(hasItem("이멤버5"))) }
                jsonPath("$.clubOneLiners[*].authorName") { value(not(hasItem("이멤버5"))) }
                jsonPath("$.publicOneLiners[*].authorName") { value(not(hasItem("이멤버5"))) }
                jsonPath("$.myQuestions[*].authorName") { value(not(hasItem("이멤버5"))) }
                jsonPath("$.publicHighlights[*].avatarKey") { value(hasItem("penguin-beret-book")) }
                jsonPath("$.clubQuestions[*].avatarKey") { value(hasItem("penguin-beret-book")) }
                jsonPath("$.clubOneLiners[*].avatarKey") { value(hasItem("penguin-beret-book")) }
                jsonPath("$.publicOneLiners[*].avatarKey") { value(hasItem("penguin-beret-book")) }
                jsonPath("$.myQuestions[*].avatarKey") { value(hasItem("penguin-beret-book")) }
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
        mockMvc
            .get("/api/archive/sessions/00000000-0000-0000-0000-000000000301") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("PUBLISHED") }
                jsonPath("$.clubQuestions[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.clubQuestions[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.clubQuestions[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.clubQuestions[*].authorShortName") { value(not(hasItem("멤버1"))) }
                jsonPath("$.clubQuestions[?(@.authorName == '탈퇴한 멤버')].avatarKey") { value(hasItem("hedgehog-green-book")) }
                jsonPath("$.clubQuestions[*].avatarKey") { value(not(hasItem("deer-brown-book"))) }
                jsonPath(removedJsonPath("$.", "club", "Checkins")) { doesNotExist() }
                jsonPath("$.clubOneLiners[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.clubOneLiners[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.clubOneLiners[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.clubOneLiners[*].authorShortName") { value(not(hasItem("멤버1"))) }
                jsonPath("$.clubOneLiners[?(@.authorName == '탈퇴한 멤버')].avatarKey") { value(hasItem("hedgehog-green-book")) }
                jsonPath("$.clubOneLiners[*].avatarKey") { value(not(hasItem("deer-brown-book"))) }
                jsonPath("$.publicOneLiners[*].authorName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.publicOneLiners[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.publicOneLiners[*].authorShortName") { value(hasItem("탈퇴한 멤버")) }
                jsonPath("$.publicOneLiners[*].authorShortName") { value(not(hasItem("멤버1"))) }
                jsonPath("$.publicOneLiners[?(@.authorName == '탈퇴한 멤버')].avatarKey") { value(hasItem("hedgehog-green-book")) }
                jsonPath("$.publicOneLiners[*].avatarKey") { value(not(hasItem("deer-brown-book"))) }
            }

        mockMvc
            .get("/api/notes/feed") {
                param("sessionId", "00000000-0000-0000-0000-000000000301")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[?(@.authorName == '탈퇴한 멤버')].kind") {
                    value(hasItems("QUESTION", "ONE_LINE_REVIEW", "HIGHLIGHT"))
                }
                jsonPath("$.items[*].kind") {
                    value(not(hasItem("CHECKIN")))
                }
                jsonPath("$.items[*].authorName") { value(not(hasItem("안멤버1"))) }
                jsonPath("$.items[*].authorShortName") { value(not(hasItem("멤버1"))) }
                jsonPath("$.items[?(@.authorName == '탈퇴한 멤버')].avatarKey") { value(hasItems("hedgehog-green-book")) }
                jsonPath("$.items[*].avatarKey") { value(not(hasItem("deer-brown-book"))) }
            }
    }

    @Test
    fun `my archive questions returns only current member questions`() {
        mockMvc
            .get("/api/archive/me/questions") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].sessionNumber") { exists() }
                jsonPath("$.items[0].bookTitle") { exists() }
                jsonPath("$.items[0].text") { exists() }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_MY_ARCHIVE_LONG_REVIEW_SQL,
            INSERT_MY_ARCHIVE_LONG_REVIEW_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_MY_ARCHIVE_LONG_REVIEW_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `my archive reviews returns current member long reviews and excludes one-liners`() {
        mockMvc
            .get("/api/archive/me/reviews") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[*].kind") { value(not(hasItem("ONE_LINE_REVIEW"))) }
                jsonPath("$.items[0].kind") { value("LONG_REVIEW") }
                jsonPath("$.items[0].bookTitle") { exists() }
                jsonPath("$.items[0].text") { value(MY_ARCHIVE_LONG_REVIEW_TEXT) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_LAST_SESSION_FIRST_FEED_SQL,
            INSERT_LAST_SESSION_FIRST_FEED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_LAST_SESSION_FIRST_FEED_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `notes feed returns last session records before newer older-session records`() {
        mockMvc
            .get("/api/notes/feed") {
                param("limit", "1")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(1) }
                jsonPath("$.items[0].sessionNumber") { value(7) }
                jsonPath("$.items[0].text") { value(not(NEWER_OLDER_SESSION_FEED_QUESTION_TEXT)) }
            }

        mockMvc
            .get("/api/notes/feed") {
                param("limit", "120")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[*].text") { value(hasItem(LAST_SESSION_FEED_QUESTION_TEXT)) }
                jsonPath("$.items[*].text") { value(hasItem(NEWER_OLDER_SESSION_FEED_QUESTION_TEXT)) }
            }
    }

    @Test
    fun `my page returns the current seeded member profile and reading rhythm`() {
        mockMvc
            .get("/api/app/me") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.displayName") { value("멤버5") }
                jsonPath("$.accountName") { value("이멤버5") }
                jsonPath("$.avatarKey") { value("penguin-beret-book") }
                jsonPath("$.profileImageUrl") { doesNotExist() }
                jsonPath("$.shortName") { doesNotExist() }
                jsonPath("$.email") { value("member5@example.com") }
                jsonPath("$.role") { value("MEMBER") }
                jsonPath("$.membershipStatus") { value("ACTIVE") }
                jsonPath("$.clubName") { value("읽는사이") }
                jsonPath("$.sessionCount") { value(4) }
                jsonPath("$.totalSessionCount") { value(7) }
                jsonPath("$.recentAttendances.length()") { value(6) }
                jsonPath("$.recentAttendances[*].sessionNumber") { value(equalTo(listOf(1, 2, 3, 4, 5, 6))) }
                jsonPath("$.recentAttendances[*].attendanceStatus") {
                    value(equalTo(listOf("ATTENDED", "ATTENDED", "ATTENDED", "ABSENT", "ABSENT", "ATTENDED")))
                }
                jsonPath("$.recentAttendances[*].attended") {
                    value(equalTo(listOf(true, true, true, false, false, true)))
                }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_MY_PAGE_PARTICIPATION_TIMELINE_SQL,
            INSERT_MY_PAGE_PARTICIPATION_TIMELINE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [CLEANUP_MY_PAGE_PARTICIPATION_TIMELINE_SQL],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `my page recent attendance includes only active participation and preserves unknown`() {
        mockMvc
            .get("/api/app/me") {
                header("X-Readmates-Club-Slug", "sample-book-club")
                with(user("midjoin-member@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.recentAttendances.length()") { value(2) }
                jsonPath("$.recentAttendances[0].sessionNumber") { value(1202) }
                jsonPath("$.recentAttendances[0].attendanceStatus") { value("ATTENDED") }
                jsonPath("$.recentAttendances[0].attended") { value(true) }
                jsonPath("$.recentAttendances[0].readingProgress") { value(100) }
                jsonPath("$.recentAttendances[1].sessionNumber") { value(1203) }
                jsonPath("$.recentAttendances[1].attendanceStatus") { value("UNKNOWN") }
                jsonPath("$.recentAttendances[1].attended") { value(false) }
                jsonPath("$.recentAttendances[1].readingProgress") { value(40) }
                jsonPath("$.recentAttendances[*].sessionNumber") { value(not(hasItems(1201, 1204))) }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_SAMPLE_CLUB_ARCHIVE_ISOLATION_SQL,
            CLEANUP_MY_PAGE_CURRENT_SESSION_SELECTION_SQL,
            INSERT_SAMPLE_CLUB_MEMBER5_MEMBERSHIP_SQL,
            INSERT_VIEWER_OPEN_SESSION_SQL,
            INSERT_MY_PAGE_NEWEST_CURRENT_CLUB_OPEN_SESSION_SQL,
            INSERT_MY_PAGE_OTHER_CLUB_OPEN_SESSION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_MY_PAGE_CURRENT_SESSION_SELECTION_SQL,
            CLEANUP_SAMPLE_CLUB_ARCHIVE_ISOLATION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `my page chooses the latest open session in the current club within its fixed query budget`() {
        mockMvc
            .get("/api/app/me") {
                header("X-Readmates-Club-Slug", "reading-sai")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.currentSessionId") { value("00000000-0000-0000-0000-000000009994") }
            }

        QueryCounter.reset()
        val primaryClub =
            getMyPageSummaryUseCase.getMyPageSummary(
                CurrentMember(
                    userId = UUID.fromString("00000000-0000-0000-0000-000000000106"),
                    membershipId = UUID.fromString("00000000-0000-0000-0000-000000000206"),
                    clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
                    clubSlug = "reading-sai",
                    email = "member5@example.com",
                    displayName = "멤버5",
                    accountName = "이멤버5",
                    role = MembershipRole.MEMBER,
                ),
            )

        assertThat(primaryClub.currentSessionId).isEqualTo("00000000-0000-0000-0000-000000009994")
        assertThat(QueryCounter.count()).isEqualTo(2)

        QueryCounter.reset()
        val otherClub =
            getMyPageSummaryUseCase.getMyPageSummary(
                CurrentMember(
                    userId = UUID.fromString("00000000-0000-0000-0000-000000000106"),
                    membershipId = UUID.fromString("00000000-0000-0000-0000-000000009182"),
                    clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
                    clubSlug = "sample-book-club",
                    email = "member5@example.com",
                    displayName = "샘플멤버5",
                    accountName = "이멤버5",
                    role = MembershipRole.MEMBER,
                ),
            )

        assertThat(otherClub.currentSessionId).isEqualTo("00000000-0000-0000-0000-000000009995")
        assertThat(QueryCounter.count()).isEqualTo(2)
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_MY_PAGE_READING_COMPLETION_SQL,
            INSERT_MY_PAGE_READING_COMPLETION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_MY_PAGE_READING_COMPLETION_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `my page reports honest reading completion from reading checkins`() {
        mockMvc
            .get("/api/app/me") {
                header("X-Readmates-Club-Slug", "sample-book-club")
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.totalSessionCount") { value(2) }
                jsonPath("$.completedReadingCount") { value(1) }
                jsonPath("$.recentAttendances.length()") { value(2) }
                jsonPath("$.recentAttendances[0].sessionNumber") { value(1) }
                jsonPath("$.recentAttendances[0].attended") { value(true) }
                jsonPath("$.recentAttendances[0].readingProgress") { value(100) }
                jsonPath("$.recentAttendances[1].sessionNumber") { value(2) }
                jsonPath("$.recentAttendances[1].attended") { value(false) }
                jsonPath("$.recentAttendances[1].readingProgress") { value(40) }
            }
    }

    @Test
    fun `public club endpoint resolves by slug`() {
        mockMvc
            .get("/api/public/clubs/reading-sai")
            .andExpect {
                status { isOk() }
                jsonPath("$.clubName") { exists() }
            }
    }

    @Test
    fun `public club endpoint returns not found for unknown slug`() {
        mockMvc
            .get("/api/public/clubs/missing-club")
            .andExpect {
                status { isNotFound() }
            }
    }

    @Test
    fun `public session endpoint resolves by slug and rejects a session from another club`() {
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/00000000-0000-0000-0000-000000000306")
            .andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000000306") }
            }

        mockMvc
            .get("/api/public/clubs/sample-book-club/sessions/00000000-0000-0000-0000-000000000306")
            .andExpect {
                status { isNotFound() }
            }
    }

    companion object {
        private fun removedJsonPath(vararg parts: String) = parts.joinToString(separator = "")

        private const val CLEANUP_VISIBILITY_ACTOR_MATRIX_SQL = """
            delete from public_session_publications
            where session_id in (
              '00000000-0000-0000-0000-0000000092b1',
              '00000000-0000-0000-0000-0000000092b2',
              '00000000-0000-0000-0000-0000000092b3',
              '00000000-0000-0000-0000-0000000092bb'
            );
            delete from session_participants
            where session_id in (
              '00000000-0000-0000-0000-0000000092b1',
              '00000000-0000-0000-0000-0000000092b2',
              '00000000-0000-0000-0000-0000000092b3',
              '00000000-0000-0000-0000-0000000092bb'
            );
            delete from sessions
            where id in (
              '00000000-0000-0000-0000-0000000092b1',
              '00000000-0000-0000-0000-0000000092b2',
              '00000000-0000-0000-0000-0000000092b3',
              '00000000-0000-0000-0000-0000000092bb'
            );
            delete from memberships
            where id = '00000000-0000-0000-0000-0000000092b9';
        """

        private const val INSERT_VISIBILITY_ACTOR_MATRIX_SQL = """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            select
              '00000000-0000-0000-0000-0000000092b9',
              '00000000-0000-0000-0000-000000000002',
              users.id,
              'MEMBER',
              'ACTIVE',
              '2026-01-01 00:00:00.000000',
              '다른클럽멤버5',
              'hedgehog-glasses-book'
            from users
            where users.email = 'member5@example.com';
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label,
              question_deadline_at, state, visibility
            )
            values
              (
                '00000000-0000-0000-0000-0000000092b1',
                '00000000-0000-0000-0000-000000000001',
                921, '921회차 · 공개 actor matrix', '공개 actor matrix 책', '검증 저자',
                '2026-12-21', '20:00:00', '22:00:00', '온라인',
                '2026-12-20 14:59:00.000000', 'PUBLISHED', 'PUBLIC'
              ),
              (
                '00000000-0000-0000-0000-0000000092b2',
                '00000000-0000-0000-0000-000000000001',
                922, '922회차 · 멤버 actor matrix', '멤버 actor matrix 책', '검증 저자',
                '2026-12-22', '20:00:00', '22:00:00', '온라인',
                '2026-12-21 14:59:00.000000', 'CLOSED', 'MEMBER'
              ),
              (
                '00000000-0000-0000-0000-0000000092b3',
                '00000000-0000-0000-0000-000000000001',
                923, '923회차 · 호스트 actor matrix', '호스트 actor matrix 책', '검증 저자',
                '2026-12-23', '20:00:00', '22:00:00', '온라인',
                '2026-12-22 14:59:00.000000', 'CLOSED', 'HOST_ONLY'
              ),
              (
                '00000000-0000-0000-0000-0000000092bb',
                '00000000-0000-0000-0000-000000000002',
                924, '924회차 · 다른 클럽 actor matrix', '다른 클럽 actor matrix 책', '검증 저자',
                '2026-12-24', '20:00:00', '22:00:00', '온라인',
                '2026-12-23 14:59:00.000000', 'PUBLISHED', 'PUBLIC'
              );
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values
              (
                '00000000-0000-0000-0000-0000000092b4',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-0000000092b1',
                '공개 actor matrix 요약입니다.', true, 'PUBLIC', '2026-12-24 00:00:00.000000'
              ),
              (
                '00000000-0000-0000-0000-0000000092b5',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-0000000092b2',
                '멤버 actor matrix 요약입니다.', false, 'MEMBER', null
              ),
              (
                '00000000-0000-0000-0000-0000000092b6',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-0000000092b3',
                '호스트 actor matrix 요약입니다.', false, 'HOST_ONLY', null
              );
            insert into session_participants (
              id, club_id, session_id, membership_id,
              rsvp_status, attendance_status, participation_status
            )
            values
              (
                '00000000-0000-0000-0000-0000000092b7',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-0000000092b1',
                '00000000-0000-0000-0000-000000000206',
                'GOING', 'ATTENDED', 'ACTIVE'
              ),
              (
                '00000000-0000-0000-0000-0000000092b8',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-0000000092b2',
                '00000000-0000-0000-0000-000000000206',
                'GOING', 'ATTENDED', 'ACTIVE'
              ),
              (
                '00000000-0000-0000-0000-0000000092ba',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-0000000092b3',
                '00000000-0000-0000-0000-000000000206',
                'GOING', 'ATTENDED', 'ACTIVE'
              ),
              (
                '00000000-0000-0000-0000-0000000092bc',
                '00000000-0000-0000-0000-000000000002',
                '00000000-0000-0000-0000-0000000092bb',
                '00000000-0000-0000-0000-0000000092b9',
                'GOING', 'ATTENDED', 'ACTIVE'
              );
        """

        private const val CLEANUP_MY_PAGE_READING_COMPLETION_SQL = """
            delete from reading_checkins
            where membership_id = '00000000-0000-0000-0000-0000000092a0';
            delete from session_participants
            where membership_id = '00000000-0000-0000-0000-0000000092a0';
            delete from sessions
            where id in (
              '00000000-0000-0000-0000-0000000092a1',
              '00000000-0000-0000-0000-0000000092a2'
            );
            delete from memberships
            where id = '00000000-0000-0000-0000-0000000092a0';
        """

        private const val CLEANUP_MY_PAGE_PARTICIPATION_TIMELINE_SQL = """
            delete from reading_checkins
            where session_id in (
              '00000000-0000-0000-0000-0000000093a1',
              '00000000-0000-0000-0000-0000000093a2',
              '00000000-0000-0000-0000-0000000093a3',
              '00000000-0000-0000-0000-0000000093a4',
              '00000000-0000-0000-0000-0000000093a5',
              '00000000-0000-0000-0000-0000000093b1'
            );
            delete from session_participants
            where session_id in (
              '00000000-0000-0000-0000-0000000093a1',
              '00000000-0000-0000-0000-0000000093a2',
              '00000000-0000-0000-0000-0000000093a3',
              '00000000-0000-0000-0000-0000000093a4',
              '00000000-0000-0000-0000-0000000093a5',
              '00000000-0000-0000-0000-0000000093b1'
            );
            delete from sessions
            where id in (
              '00000000-0000-0000-0000-0000000093a1',
              '00000000-0000-0000-0000-0000000093a2',
              '00000000-0000-0000-0000-0000000093a3',
              '00000000-0000-0000-0000-0000000093a4',
              '00000000-0000-0000-0000-0000000093a5',
              '00000000-0000-0000-0000-0000000093b1'
            );
            delete from memberships
            where id in (
              '00000000-0000-0000-0000-0000000093a0',
              '00000000-0000-0000-0000-0000000093a6',
              '00000000-0000-0000-0000-0000000093a8'
            );
            delete from users
            where id in (
              '00000000-0000-0000-0000-0000000093a7',
              '00000000-0000-0000-0000-0000000093a9'
            );
        """

        private const val INSERT_MY_PAGE_PARTICIPATION_TIMELINE_SQL = """
            insert into users (id, email, name, short_name, auth_provider)
            values
              ('00000000-0000-0000-0000-0000000093a9', 'midjoin-member@example.com', '중간 참여 멤버', '중간멤버', 'PASSWORD'),
              ('00000000-0000-0000-0000-0000000093a7', 'other-timeline-member@example.com', '다른 참여 멤버', '다른멤버', 'PASSWORD');
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values
              ('00000000-0000-0000-0000-0000000093a0', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000093a9', 'MEMBER', 'ACTIVE', '2026-01-01 00:00:00.000000', '중간멤버', 'hedgehog-green-book'),
              ('00000000-0000-0000-0000-0000000093a6', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000093a9', 'MEMBER', 'ACTIVE', '2026-01-01 00:00:00.000000', '다른클럽중간멤버', 'fennec-heart-mug'),
              ('00000000-0000-0000-0000-0000000093a8', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000093a7', 'MEMBER', 'ACTIVE', '2026-01-01 00:00:00.000000', '다른샘플멤버', 'hedgehog-glasses-book');
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label,
              question_deadline_at, state, visibility
            )
            values
              ('00000000-0000-0000-0000-0000000093a1', '00000000-0000-0000-0000-000000000002', 1201, '1201회차 · 참여 전', '참여 전 책', '검증 저자', '2026-12-01', '20:00:00', '22:00:00', '온라인', '2026-11-30 14:59:00.000000', 'PUBLISHED', 'PUBLIC'),
              ('00000000-0000-0000-0000-0000000093a2', '00000000-0000-0000-0000-000000000002', 1202, '1202회차 · 출석', '출석 책', '검증 저자', '2026-12-02', '20:00:00', '22:00:00', '온라인', '2026-12-01 14:59:00.000000', 'PUBLISHED', 'PUBLIC'),
              ('00000000-0000-0000-0000-0000000093a3', '00000000-0000-0000-0000-000000000002', 1203, '1203회차 · 미확정', '미확정 책', '검증 저자', '2026-12-03', '20:00:00', '22:00:00', '온라인', '2026-12-02 14:59:00.000000', 'PUBLISHED', 'PUBLIC'),
              ('00000000-0000-0000-0000-0000000093a4', '00000000-0000-0000-0000-000000000002', 1204, '1204회차 · 제거됨', '제거된 책', '검증 저자', '2026-12-04', '20:00:00', '22:00:00', '온라인', '2026-12-03 14:59:00.000000', 'PUBLISHED', 'PUBLIC'),
              ('00000000-0000-0000-0000-0000000093a5', '00000000-0000-0000-0000-000000000002', 1205, '1205회차 · 다른 멤버', '다른 멤버 책', '검증 저자', '2026-12-05', '20:00:00', '22:00:00', '온라인', '2026-12-04 14:59:00.000000', 'PUBLISHED', 'PUBLIC'),
              ('00000000-0000-0000-0000-0000000093b1', '00000000-0000-0000-0000-000000000001', 1206, '1206회차 · 다른 클럽', '다른 클럽 책', '검증 저자', '2026-12-06', '20:00:00', '22:00:00', '온라인', '2026-12-05 14:59:00.000000', 'PUBLISHED', 'PUBLIC');
            insert into session_participants (
              id, club_id, session_id, membership_id,
              rsvp_status, attendance_status, participation_status
            )
            values
              ('00000000-0000-0000-0000-0000000093b2', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000093a2', '00000000-0000-0000-0000-0000000093a0', 'GOING', 'ATTENDED', 'ACTIVE'),
              ('00000000-0000-0000-0000-0000000093b3', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000093a3', '00000000-0000-0000-0000-0000000093a0', 'GOING', 'UNKNOWN', 'ACTIVE'),
              ('00000000-0000-0000-0000-0000000093b4', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000093a4', '00000000-0000-0000-0000-0000000093a0', 'GOING', 'ATTENDED', 'REMOVED'),
              ('00000000-0000-0000-0000-0000000093b5', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000093a5', '00000000-0000-0000-0000-0000000093a8', 'GOING', 'ATTENDED', 'ACTIVE'),
              ('00000000-0000-0000-0000-0000000093b6', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000093b1', '00000000-0000-0000-0000-0000000093a6', 'GOING', 'ATTENDED', 'ACTIVE');
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
            values
              ('00000000-0000-0000-0000-0000000093b7', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000093a2', '00000000-0000-0000-0000-0000000093a0', 100),
              ('00000000-0000-0000-0000-0000000093b8', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000093a3', '00000000-0000-0000-0000-0000000093a0', 40);
        """

        private const val INSERT_MY_PAGE_READING_COMPLETION_SQL = """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            select
              '00000000-0000-0000-0000-0000000092a0',
              clubs.id,
              users.id,
              'MEMBER',
              'ACTIVE',
              '2026-01-01 00:00:00.000000',
              '완독멤버5',
              'hedgehog-green-book'
            from clubs
            join users on users.email = 'member5@example.com'
            where clubs.slug = 'sample-book-club';
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              book_translator, book_link, book_image_url, session_date,
              start_time, end_time, location_label, meeting_url,
              meeting_passcode, question_deadline_at, state, visibility
            )
            values
              (
                '00000000-0000-0000-0000-0000000092a1',
                '00000000-0000-0000-0000-000000000002',
                1, '1회차 · 완독 집계 검증 책', '완독 집계 검증 책 1', '검증 저자',
                null, null, null, '2026-11-01', '20:00:00', '22:00:00',
                '온라인', null, null, '2026-10-31 14:59:00.000000',
                'PUBLISHED', 'PUBLIC'
              ),
              (
                '00000000-0000-0000-0000-0000000092a2',
                '00000000-0000-0000-0000-000000000002',
                2, '2회차 · 완독 집계 검증 책', '완독 집계 검증 책 2', '검증 저자',
                null, null, null, '2026-12-01', '20:00:00', '22:00:00',
                '온라인', null, null, '2026-11-30 14:59:00.000000',
                'PUBLISHED', 'PUBLIC'
              );
            insert into session_participants (
              id, club_id, session_id, membership_id,
              rsvp_status, attendance_status, participation_status
            )
            values
              (
                '00000000-0000-0000-0000-0000000092a3',
                '00000000-0000-0000-0000-000000000002',
                '00000000-0000-0000-0000-0000000092a1',
                '00000000-0000-0000-0000-0000000092a0',
                'GOING', 'ATTENDED', 'ACTIVE'
              ),
              (
                '00000000-0000-0000-0000-0000000092a6',
                '00000000-0000-0000-0000-000000000002',
                '00000000-0000-0000-0000-0000000092a2',
                '00000000-0000-0000-0000-0000000092a0',
                'GOING', 'UNKNOWN', 'ACTIVE'
              );
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
            values
              (
                '00000000-0000-0000-0000-0000000092a4',
                '00000000-0000-0000-0000-000000000002',
                '00000000-0000-0000-0000-0000000092a1',
                '00000000-0000-0000-0000-0000000092a0',
                100
              ),
              (
                '00000000-0000-0000-0000-0000000092a5',
                '00000000-0000-0000-0000-000000000002',
                '00000000-0000-0000-0000-0000000092a2',
                '00000000-0000-0000-0000-0000000092a0',
                40
              );
        """

        private const val CLEANUP_SAMPLE_CLUB_ARCHIVE_ISOLATION_SQL = """
            delete from public_session_publications
            where session_id = '00000000-0000-0000-0000-000000009181';
            delete from session_participants
            where session_id = '00000000-0000-0000-0000-000000009181'
               or membership_id = '00000000-0000-0000-0000-000000009182';
            delete from sessions
            where id = '00000000-0000-0000-0000-000000009181';
            delete from memberships
            where id = '00000000-0000-0000-0000-000000009182';
        """

        private const val CLEANUP_MY_PAGE_CURRENT_SESSION_SELECTION_SQL = """
            delete from sessions
            where id in (
              '00000000-0000-0000-0000-000000009992',
              '00000000-0000-0000-0000-000000009994',
              '00000000-0000-0000-0000-000000009995'
            );
        """

        private const val INSERT_MY_PAGE_NEWEST_CURRENT_CLUB_OPEN_SESSION_SQL = """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              book_translator, book_link, book_image_url, session_date,
              start_time, end_time, location_label, meeting_url,
              meeting_passcode, question_deadline_at, state, visibility
            )
            values (
              '00000000-0000-0000-0000-000000009994',
              '00000000-0000-0000-0000-000000000001',
              1001, '1001회차 · 최신 진행 세션', '최신 진행 책', '테스트 저자',
              null, null, null, '2030-05-01', '19:00:00', '21:00:00',
              '온라인', null, null, '2030-04-30 14:59:00.000000', 'OPEN', 'PUBLIC'
            );
        """

        private const val INSERT_MY_PAGE_OTHER_CLUB_OPEN_SESSION_SQL = """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              book_translator, book_link, book_image_url, session_date,
              start_time, end_time, location_label, meeting_url,
              meeting_passcode, question_deadline_at, state, visibility
            )
            values (
              '00000000-0000-0000-0000-000000009995',
              '00000000-0000-0000-0000-000000000002',
              2000, '2000회차 · 다른 클럽 진행 세션', '다른 클럽 진행 책', '테스트 저자',
              null, null, null, '2030-06-01', '19:00:00', '21:00:00',
              '온라인', null, null, '2030-05-31 14:59:00.000000', 'OPEN', 'PUBLIC'
            );
        """

        private const val INSERT_SAMPLE_CLUB_MEMBER5_MEMBERSHIP_SQL = """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            select
              '00000000-0000-0000-0000-000000009182',
              clubs.id,
              users.id,
              'MEMBER',
              'ACTIVE',
              '2026-01-01 00:00:00.000000',
              '샘플멤버5',
              'hedgehog-green-book'
            from clubs
            join users on users.email = 'member5@example.com'
            where clubs.slug = 'sample-book-club';
        """

        private const val INSERT_SAMPLE_CLUB_ARCHIVE_SESSION_SQL = """
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
              state,
              visibility
            )
            values (
              '00000000-0000-0000-0000-000000009181',
              '00000000-0000-0000-0000-000000000002',
              1,
              '1회차 · 샘플 클럽 아카이브 테스트 책',
              '샘플 클럽 아카이브 테스트 책',
              '샘플 클럽 테스트 저자',
              null,
              null,
              null,
              '2026-10-10',
              '20:00:00',
              '22:00:00',
              '온라인',
              null,
              null,
              '2026-10-09 14:59:00.000000',
              'PUBLISHED',
              'PUBLIC'
            );
        """

        private const val INSERT_SAMPLE_CLUB_ARCHIVE_PARTICIPANT_SQL = """
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
              '00000000-0000-0000-0000-000000009183',
              '00000000-0000-0000-0000-000000000002',
              '00000000-0000-0000-0000-000000009181',
              '00000000-0000-0000-0000-000000009182',
              'GOING',
              'ATTENDED',
              'ACTIVE'
            );
        """

        private const val INSERT_SAMPLE_CLUB_ARCHIVE_PUBLICATION_SQL = """
            insert into public_session_publications (
              id,
              club_id,
              session_id,
              public_summary,
              is_public,
              visibility,
              published_at
            )
            values (
              '00000000-0000-0000-0000-000000009184',
              '00000000-0000-0000-0000-000000000002',
              '00000000-0000-0000-0000-000000009181',
              '샘플 클럽 공개 기록은 샘플 클럽 멤버 아카이브에만 노출됩니다.',
              true,
              'PUBLIC',
              '2026-10-11 00:00:00.000000'
            );
        """

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
              state,
              visibility
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
              'DRAFT',
              'MEMBER'
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
              state,
              visibility
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
              'OPEN',
              'PUBLIC'
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
              state,
              visibility
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
              'CLOSED',
              'MEMBER'
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

        private const val RENAME_MEMBER5_DISPLAY_NAME_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.short_name = '새멤버5'
            where users.email = 'member5@example.com'
              and memberships.club_id = '00000000-0000-0000-0000-000000000001';
        """
        private const val RESET_MEMBER5_DISPLAY_NAME_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.short_name = '멤버5'
            where users.email = 'member5@example.com'
              and memberships.club_id = '00000000-0000-0000-0000-000000000001';
        """

        private const val LAST_SESSION_FEED_QUESTION_TEXT = "마지막 회차 기록이 클럽 흐름에서 먼저 보여야 합니다."
        private const val NEWER_OLDER_SESSION_FEED_QUESTION_TEXT = "더 나중에 작성된 오래된 회차 기록은 뒤에 보여야 합니다."
        private const val CLEANUP_LAST_SESSION_FIRST_FEED_SQL = """
            delete from questions
            where id in (
              '00000000-0000-0000-0000-000000008001',
              '00000000-0000-0000-0000-000000008002'
            );
            delete from session_participants
            where id = '00000000-0000-0000-0000-000000008003';
        """
        private const val INSERT_LAST_SESSION_FIRST_FEED_SQL = """
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
              '$NEWER_OLDER_SESSION_FEED_QUESTION_TEXT',
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

            insert into session_participants (
              id,
              club_id,
              session_id,
              membership_id,
              rsvp_status,
              attendance_status,
              participation_status
            )
            select
              '00000000-0000-0000-0000-000000008003',
              sessions.club_id,
              sessions.id,
              memberships.id,
              'GOING',
              'UNKNOWN',
              'ACTIVE'
            from sessions
            join users on users.email = 'member5@example.com'
            join memberships on memberships.club_id = sessions.club_id
              and memberships.user_id = users.id
            where sessions.club_id = '00000000-0000-0000-0000-000000000001'
              and sessions.number = 7
              and not exists (
                select 1
                from session_participants existing
                where existing.club_id = sessions.club_id
                  and existing.session_id = sessions.id
                  and existing.membership_id = memberships.id
              );

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
              '00000000-0000-0000-0000-000000008002',
              clubs.id,
              sessions.id,
              memberships.id,
              1,
              '$LAST_SESSION_FEED_QUESTION_TEXT',
              null,
              '2029-01-01 00:00:00.000000',
              '2029-01-01 00:00:00.000000'
            from clubs
            join sessions on sessions.club_id = clubs.id
              and sessions.number = 7
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

        private const val CLEANUP_HOST_ONLY_PUBLISHED_NOTE_SESSION_SQL = """
            delete from session_participants
            where id = '00000000-0000-0000-0000-000000009092';
            delete from one_line_reviews
            where id = '00000000-0000-0000-0000-000000009091';
            delete from sessions
            where id = '00000000-0000-0000-0000-000000009090';
        """
        private const val HOST_ONLY_PUBLISHED_NOTE_SESSION_ID = "00000000-0000-0000-0000-000000009090"
        private const val HOST_ONLY_PUBLISHED_NOTE_REVIEW_ID = "00000000-0000-0000-0000-000000009091"
        private const val HOST_ONLY_PUBLISHED_NOTE_PARTICIPANT_ID = "00000000-0000-0000-0000-000000009092"
        private const val HOST_ONLY_PUBLISHED_NOTE_TEXT = "호스트 전용 기록은 클럽 노트에 나오면 안 됩니다."

        private const val PUBLIC_NOTE_FEED_LONG_REVIEW_TEXT = "공개 서평은 클럽 노트에서 함께 읽을 수 있습니다."
        private const val PRIVATE_NOTE_FEED_LONG_REVIEW_TEXT = "비공개 서평은 클럽 노트에서 제외됩니다."
        private const val MY_ARCHIVE_LONG_REVIEW_TEXT = "아카이브 내 서평은 장문 서평 입력폼에서 저장한 글입니다."
        private const val CLEANUP_MY_ARCHIVE_LONG_REVIEW_SQL = """
            delete from long_reviews
            where id = '00000000-0000-0000-0000-000000008301';
        """
        private const val INSERT_MY_ARCHIVE_LONG_REVIEW_SQL = """
            insert into long_reviews (
              id,
              club_id,
              session_id,
              membership_id,
              body,
              visibility,
              created_at,
              updated_at
            )
            select
              '00000000-0000-0000-0000-000000008301',
              sessions.club_id,
              sessions.id,
              memberships.id,
              '$MY_ARCHIVE_LONG_REVIEW_TEXT',
              'PRIVATE',
              '2030-01-05 00:00:00.000000',
              '2030-01-05 00:00:00.000000'
            from sessions
            join users on users.email = 'member5@example.com'
            join memberships on memberships.club_id = sessions.club_id
              and memberships.user_id = users.id
            where sessions.id = '00000000-0000-0000-0000-000000000306';
        """
        private const val CLEANUP_NOTE_FEED_LONG_REVIEWS_SQL = """
            delete from long_reviews
            where id in (
              '00000000-0000-0000-0000-000000008201',
              '00000000-0000-0000-0000-000000008202'
            );
        """
        private const val INSERT_NOTE_FEED_LONG_REVIEWS_SQL = """
            insert into long_reviews (
              id,
              club_id,
              session_id,
              membership_id,
              body,
              visibility,
              created_at,
              updated_at
            )
            select
              '00000000-0000-0000-0000-000000008201',
              sessions.club_id,
              sessions.id,
              memberships.id,
              '$PUBLIC_NOTE_FEED_LONG_REVIEW_TEXT',
              'PUBLIC',
              '2030-01-03 00:00:00.000000',
              '2030-01-03 00:00:00.000000'
            from sessions
            join users on users.email = 'member3@example.com'
            join memberships on memberships.club_id = sessions.club_id
              and memberships.user_id = users.id
            where sessions.id = '00000000-0000-0000-0000-000000000306'

            union all

            select
              '00000000-0000-0000-0000-000000008202',
              sessions.club_id,
              sessions.id,
              memberships.id,
              '$PRIVATE_NOTE_FEED_LONG_REVIEW_TEXT',
              'PRIVATE',
              '2030-01-04 00:00:00.000000',
              '2030-01-04 00:00:00.000000'
            from sessions
            join users on users.email = 'member4@example.com'
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
            where id = '00000000-0000-0000-0000-000000000900';
        """
        private const val INSERT_HIDDEN_OTHER_CLUB_SESSION_SQL = """
            insert into clubs (id, slug, name, tagline, about)
            values (
              '00000000-0000-0000-0000-000000000900',
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

            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (
              '00000000-0000-0000-0000-000000009072',
              '00000000-0000-0000-0000-000000000900',
              '00000000-0000-0000-0000-000000009071',
              'MEMBER',
              'ACTIVE',
              '2029-01-01 00:00:00.000000',
              '다른',
              'hedgehog-green-book'
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
              state,
              visibility
            )
            values (
              '00000000-0000-0000-0000-000000009073',
              '00000000-0000-0000-0000-000000000900',
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
              'PUBLISHED',
              'MEMBER'
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
              '00000000-0000-0000-0000-000000000900',
              '00000000-0000-0000-0000-000000009073',
              '00000000-0000-0000-0000-000000009072',
              1,
              '다른 클럽 질문은 현재 멤버에게 노출되지 않습니다.',
              null,
              '2030-03-01 00:00:00.000000',
              '2030-03-01 00:00:00.000000'
            );
        """
    }

    @TestConfiguration
    class QueryCountingConfig {
        @Bean
        fun queryCountingDataSourcePostProcessor(): BeanPostProcessor = QueryCountingDataSourcePostProcessor()
    }

    private fun viewerSessionCookie(email: String): Cookie = membershipSessionCookie(email, MembershipStatus.VIEWER)

    private fun membershipSessionCookie(
        email: String,
        status: MembershipStatus,
        role: MembershipRole = MembershipRole.MEMBER,
    ): Cookie {
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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, null, ?, 'hedgehog-green-book')
            """.trimIndent(),
            membershipId,
            userId,
            role.name,
            status.name,
            "Journey-${userId.takeLast(8)}",
        )
        createdMembershipIds += membershipId
        val issuedSession =
            authSessionService.issueSession(
                userId = userId,
                userAgent = "ArchiveAndNotesDbTest",
                ipAddress = "127.0.0.1",
            )
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun insertViewerSessionParticipant(
        membershipId: String,
        sessionId: String,
    ) {
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

    private fun deleteWhereIn(
        tableName: String,
        columnName: String,
        values: Set<String>,
    ) {
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
