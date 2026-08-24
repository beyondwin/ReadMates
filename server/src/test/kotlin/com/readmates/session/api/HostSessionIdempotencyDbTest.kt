package com.readmates.session.api

import com.readmates.session.application.port.`in`.PurgeExpiredHostSessionTrashUseCase
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_IDEMPOTENCY_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_IDEMPOTENCY_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionIdempotencyDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val purgeExpiredHostSessionTrash: PurgeExpiredHostSessionTrashUseCase,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val jsonMapper =
        tools.jackson.databind.json.JsonMapper
            .builder()
            .findAndAddModules()
            .build()

    @Test
    fun `envelope rejects missing extra and wrong-domain expected revisions`() {
        val created = createDraft("envelope-validate", "key-create-valid-01")
        val sessionId = created.first
        mockMvc
            .post("/api/host/sessions") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-create-extra-01",
                        """{"sessionRevision":0}""",
                        sessionCommand("extra-create"),
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-save-missing-01", "{}", sessionCommand("missing-rev"))
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-save-extra-01",
                        """{"sessionRevision":0,"exposureRevision":0}""",
                        sessionCommand("extra-rev"),
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-open-extra-01", """{"sessionRevision":0,"publicationRevision":0}""", "{}")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-close-missing-01", """{"sessionRevision":0}""", "{}")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-close-extra-01",
                        """{"sessionRevision":0,"participantSetRevision":0,"attendanceSnapshotId":"att:","publicationRevision":0}""",
                        "{}",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-att-extra-01",
                        """{"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0}],"sessionRevision":0}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-access-extra-01",
                        """{"exposureRevision":0,"sessionRevision":0}""",
                        """{"accessScope":"GUEST_READABLE"}""",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-pub-extra-01",
                        """{"publicationRevision":0,"sessionRevision":0}""",
                        """{"publicSummary":"요약","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .delete("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-trash-extra-01", """{"sessionRevision":0,"exposureRevision":1}""", "{}")
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `same create key returns one session publication version and no public content`() {
        val key = "key-create-dup-0001"
        val first =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = envelope(key, "{}", sessionCommand("중복 생성"))
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        val sessionId = jsonMapper.readTree(first).get("sessionId").asString()
        val second =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = envelope(key, "{}", sessionCommand("중복 생성"))
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        assertThat(jsonMapper.readTree(second).get("sessionId").asString()).isEqualTo(sessionId)
        assertThat(countSessions("title = '중복 생성'")).isEqualTo(1)
        assertThat(publicationVersionCount(sessionId)).isEqualTo(1)
        assertThat(publicContentCount(sessionId)).isZero()
        assertThat(receiptCount(sessionId)).isEqualTo(1)
        assertThat(auditCount(sessionId)).isZero()
        val reconciled =
            mockMvc
                .get("/api/host/mutations/SESSION_CREATE/create/$key") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        assertThat(reconciled.get("status").asString()).isEqualTo("COMMITTED")
        assertThat(reconciled.get("receipt").get("resourceId").asString()).isEqualTo(sessionId)
        assertThat(reconciled.get("receipt").get("notificationDecision").asString()).isEqualTo("NOT_SENT")
    }

    @Test
    fun `not executed reconciliation returns club scoped authoritative mutation state`() {
        val sessionId = createDraft("미실행 조회", "key-current-create-01").first
        open(sessionId, revision = 0, key = "key-current-open-01")
        jdbcTemplate.update(
            """
            update session_participants
            set attendance_revision = 5
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            sessionId,
            HOST_MEMBERSHIP_ID,
        )

        mockMvc
            .get("/api/host/mutations/SESSION_CLOSE/$sessionId/key-never-ran-0001") { withHost() }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("NOT_EXECUTED") }
                jsonPath("$.receipt") { doesNotExist() }
                jsonPath("$.current.sessionId") { value(sessionId) }
                jsonPath("$.current.versions.sessionRevision") { value(1) }
                jsonPath("$.current.versions.participantSetRevision") { value(1) }
                jsonPath("$.attendanceVersions[?(@.membershipId == '$HOST_MEMBERSHIP_ID')].attendanceRevision") {
                    value(org.hamcrest.Matchers.hasItem(5))
                }
                jsonPath("$.attendanceSnapshotId") { exists() }
            }
    }

    @Test
    fun `same key different payload conflicts and writes nothing extra`() {
        val key = "key-create-conflict-01"
        mockMvc
            .post("/api/host/sessions") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(key, "{}", sessionCommand("원본 생성"))
            }.andExpect { status { isCreated() } }
        mockMvc
            .post("/api/host/sessions") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(key, "{}", sessionCommand("다른 생성"))
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }
        assertThat(countSessions("title = '원본 생성'")).isEqualTo(1)
        assertThat(countSessions("title = '다른 생성'")).isZero()
    }

    @Test
    fun `duplicate basic save attendance and close keep one side effect`() {
        val created = createDraft("중복 저장", "key-basic-orig-0001")
        val sessionId = created.first
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-basic-dup-0001", """{"sessionRevision":0}""", sessionCommand("한번만 저장"))
            }.andExpect { status { isOk() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-basic-dup-0001", """{"sessionRevision":0}""", sessionCommand("한번만 저장"))
            }.andExpect { status { isOk() } }
        assertThat(sessionRevision(sessionId)).isEqualTo(1)
        assertThat(auditCount(sessionId, "BASIC_INFO_UPDATED")).isEqualTo(1)

        open(sessionId, 1, "key-open-dup-0001")
        open(sessionId, 1, "key-open-dup-0001")
        assertThat(findState(sessionId)).isEqualTo("OPEN")

        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-att-dup-0001",
                        """{"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0}]}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-att-dup-0001",
                        """{"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0}]}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isOk() } }
        assertThat(attendanceAuditCount(sessionId)).isEqualTo(1)

        val snapshot = attendanceSnapshotId(sessionId)
        val setRevision = participantSetRevision(sessionId)
        val sessionRev = sessionRevision(sessionId)
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-close-dup-0001",
                        """{"sessionRevision":$sessionRev,"participantSetRevision":$setRevision,"attendanceSnapshotId":"$snapshot"}""",
                        "{}",
                    )
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-close-dup-0001",
                        """{"sessionRevision":$sessionRev,"participantSetRevision":$setRevision,"attendanceSnapshotId":"$snapshot"}""",
                        "{}",
                    )
            }.andExpect { status { isOk() } }
        assertThat(findState(sessionId)).isEqualTo("CLOSED")
        assertThat(lifecycleCount(sessionId, "CLOSED")).isEqualTo(1)
    }

    @Test
    fun `envelope rejects reverse restore bulk attendance access publication and publish vector fields`() {
        val sessionId = createDraft("vector-validate", "key-create-vector-01").first
        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-rev-extra-01", """{"sessionRevision":0,"exposureRevision":0}""", "{}")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/restore") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-restore-extra-01", """{"sessionRevision":0,"publicationRevision":0}""", "{}")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-publish-missing-01", """{"sessionRevision":0}""", "{}")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-publish-extra-01",
                        """{"sessionRevision":0,"liveRecordRevision":0,"exposureRevision":0,"publicationRevision":0,"participantSetRevision":0}""",
                        "{}",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-corr-missing-01", """{"sessionRevision":0}""", "{}")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-corr-extra-01",
                        """{"sessionRevision":0,"recordDraftRevision":1,"liveRecordRevision":1,"exposureRevision":0,"publicationRevision":0,"participantSetRevision":0}""",
                        "{}",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-bulk-missing-set-01",
                        """{"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0},{"membershipId":"$MEMBER_MEMBERSHIP_ID","attendanceRevision":0}]}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0},{"membershipId":"$MEMBER_MEMBERSHIP_ID","attendanceStatus":"ABSENT","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `attendance expected rows disagreeing with command entries are rejected`() {
        val sessionId = createDraft("출석 불일치", "key-att-mis-orig-01").first
        open(sessionId, 0, "key-att-mis-open-01")
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-att-mis-01",
                        """{"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0}]}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":9}]}""",
                    )
            }.andExpect { status { isBadRequest() } }
        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
    }

    @Test
    fun `history restore replay returns the audit change id and kind`() {
        val sessionId = createDraft("복원 원본", "key-hist-create-01").first
        val first =
            mockMvc
                .patch("/api/host/sessions/$sessionId") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = envelope("key-hist-save-01", """{"sessionRevision":0}""", sessionCommand("복원 대상"))
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        val changeId = first.get("changeReceipt").get("changeId").asString()
        val preview =
            mockMvc
                .get("/api/host/sessions/$sessionId/changes/$changeId/restore-preview") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        val hash = preview.get("expectedCurrentHash").asString()
        val restoreBody =
            envelope(
                "key-hist-restore-01",
                """{"sessionRevision":${sessionRevision(sessionId)}}""",
                """{"expectedCurrentHash":"$hash","expectedSessionRevision":${sessionRevision(sessionId)}}""",
            )
        val restored =
            mockMvc
                .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = restoreBody
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        val replayed =
            mockMvc
                .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = restoreBody
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        assertThat(restored.get("kind").asString()).isEqualTo("BASIC_INFO")
        assertThat(restored.get("undoAvailable").booleanValue()).isTrue()
        assertThat(replayed.get("changeId").asString()).isEqualTo(restored.get("changeId").asString())
        assertThat(replayed.get("kind").asString()).isEqualTo("BASIC_INFO")
        assertThat(replayed.get("undoAvailable").booleanValue()).isTrue()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from host_session_change_audit where session_id = ? and restored_from_change_id = ?",
                Int::class.java,
                sessionId,
                changeId,
            ),
        ).isEqualTo(1)
        assertThat(replayed.get("changeId").asString()).isNotEqualTo(replayed.path("receiptId").asString())
    }

    @Test
    fun `access and publication envelope cas increments revisions`() {
        val sessionId = createDraft("노출 개정", "key-exp-create-01").first
        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-exp-dup-01",
                        """{"exposureRevision":0}""",
                        """{"accessScope":"GUEST_READABLE"}""",
                    )
            }.andExpect { status { isOk() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-exp-dup-01",
                        """{"exposureRevision":0}""",
                        """{"accessScope":"GUEST_READABLE"}""",
                    )
            }.andExpect { status { isOk() } }
        assertThat(exposureRevision(sessionId)).isEqualTo(1)
        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-exp-dup-01",
                        """{"exposureRevision":1}""",
                        """{"accessScope":"GUEST_READABLE"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }
        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-exp-stale-01",
                        """{"exposureRevision":0}""",
                        """{"accessScope":"HOST_ONLY"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-pub-dup-01",
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"공개 요약","siteVisibility":"HIDDEN","visibility":"MEMBER"}""",
                    )
            }.andExpect { status { isOk() } }
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-pub-dup-01",
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"공개 요약","siteVisibility":"HIDDEN","visibility":"MEMBER"}""",
                    )
            }.andExpect { status { isOk() } }
        assertThat(publicationRevision(sessionId)).isEqualTo(1)
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-pub-dup-01",
                        """{"publicationRevision":1}""",
                        """{"publicSummary":"공개 요약","siteVisibility":"HIDDEN","visibility":"MEMBER"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-pub-stale-01",
                        """{"publicationRevision":0}""",
                        """{"publicSummary":"다른 요약","siteVisibility":"HIDDEN","visibility":"MEMBER"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }
    }

    @Test
    fun `reverse trash restore bulk attendance and publish replay once`() {
        val sessionId = createDraft("범위 재시도", "key-scope-create-01").first
        open(sessionId, 0, "key-scope-open-01")
        val setRevision = participantSetRevision(sessionId)
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-bulk-dup-01",
                        """{"participantSetRevision":$setRevision,"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0},{"membershipId":"$MEMBER_MEMBERSHIP_ID","attendanceRevision":0}]}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0},{"membershipId":"$MEMBER_MEMBERSHIP_ID","attendanceStatus":"ABSENT","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-bulk-dup-01",
                        """{"participantSetRevision":$setRevision,"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0},{"membershipId":"$MEMBER_MEMBERSHIP_ID","attendanceRevision":0}]}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0},{"membershipId":"$MEMBER_MEMBERSHIP_ID","attendanceStatus":"ABSENT","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isOk() } }
        assertThat(attendanceAuditCount(sessionId)).isEqualTo(1)

        val snapshot = attendanceSnapshotId(sessionId)
        close(sessionId, sessionRevision(sessionId), setRevision, snapshot, "key-scope-close-01")
        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-reopen-dup-01", """{"sessionRevision":${sessionRevision(sessionId)}}""", "{}")
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-reopen-dup-01", """{"sessionRevision":${sessionRevision(sessionId)}}""", "{}")
            }.andExpect { status { isOk() } }
        assertThat(findState(sessionId)).isEqualTo("OPEN")
        assertThat(lifecycleCount(sessionId, "REOPENED")).isEqualTo(1)

        close(
            sessionId,
            sessionRevision(sessionId),
            participantSetRevision(sessionId),
            attendanceSnapshotId(sessionId),
            "key-scope-close-02",
        )
        preparePublication(sessionId)
        val publishExpected = publishVectorJson(sessionId)
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-publish-dup-01", publishExpected, "{}")
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-publish-dup-01", publishExpected, "{}")
            }.andExpect { status { isOk() } }
        assertThat(findState(sessionId)).isEqualTo("PUBLISHED")
        assertThat(lifecycleCount(sessionId, "PUBLISHED")).isEqualTo(1)

        insertRecordDraft(sessionId)
        val correctionExpected = correctionVectorJson(sessionId)
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-corr-dup-01", correctionExpected, "{}")
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-corr-dup-01", correctionExpected, "{}")
            }.andExpect { status { isOk() } }
        assertThat(receiptCount(sessionId)).isGreaterThanOrEqualTo(1)

        val trashable = createDraft("휴지통 복원", "key-trash-rest-create-01").first
        mockMvc
            .delete("/api/host/sessions/$trashable") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-trash-rest-01", """{"sessionRevision":0}""", "{}")
            }.andExpect { status { isOk() } }
        val trashedReconcile =
            mockMvc
                .get("/api/host/mutations/SESSION_TRASH/$trashable/key-trash-rest-01") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        assertThat(trashedReconcile.get("status").asString()).isEqualTo("COMMITTED")
        assertThat(trashedReconcile.get("current").get("state").asString()).isEqualTo("DRAFT")
        assertThat(trashedReconcile.get("current").get("title").asString()).isEqualTo("휴지통 복원")
        assertThat(trashedReconcile.toString()).doesNotContain("\"DELETED\"")
        val trashedRevision = sessionRevision(trashable)
        mockMvc
            .post("/api/host/sessions/$trashable/restore") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-restore-dup-01", """{"sessionRevision":$trashedRevision}""", "{}")
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$trashable/restore") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-restore-dup-01", """{"sessionRevision":$trashedRevision}""", "{}")
            }.andExpect { status { isOk() } }
        assertThat(findState(trashable)).isEqualTo("DRAFT")
        assertThat(lifecycleCount(trashable, "RESTORED")).isEqualTo(1)
    }

    @Test
    fun `hard delete keeps redacted receipt and unauthorized lookup hides detail`() {
        val created =
            createDraft(
                "삭제 영수증",
                "key-trash-orig-0001",
                meetingUrl = "https://meet.example.com/private-room",
                meetingPasscode = "secret-pass",
            )
        val sessionId = created.first
        mockMvc
            .delete("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-trash-dup-0001", """{"sessionRevision":0}""", "{}")
            }.andExpect { status { isOk() } }
        jdbcTemplate.update(
            "update sessions set purge_after = timestampadd(day, -1, utc_timestamp(6)) where id = ?",
            sessionId,
        )
        assertThat(purgeExpiredHostSessionTrash.purgeExpired(50)).isGreaterThanOrEqualTo(1)
        assertThat(countSessions("id = '$sessionId'")).isZero()
        val bytes =
            jdbcTemplate.queryForObject(
                "select count(*) from host_session_mutation_receipts where resource_id = ?",
                Int::class.java,
                sessionId,
            ) ?: 0
        assertThat(bytes).isGreaterThanOrEqualTo(1)
        val reconciled =
            mockMvc
                .get("/api/host/mutations/SESSION_TRASH/$sessionId/key-trash-dup-0001") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        assertThat(reconciled.get("status").asString()).isEqualTo("COMMITTED")
        assertThat(reconciled.get("receipt").get("resourceId").asString()).isEqualTo(sessionId)
        assertThat(reconciled.toString()).doesNotContain("meet.example.com")
        assertThat(reconciled.toString()).doesNotContain("secret-pass")
        assertThat(reconciled.get("current").isNull).isTrue()
        mockMvc
            .get("/api/host/mutations/SESSION_TRASH/$sessionId/key-trash-dup-0001") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isForbidden() }
            }.andExpect {
                jsonPath("$.receipt") { doesNotExist() }
            }
        mockMvc
            .get("/api/host/mutations/SESSION_CREATE/create/missing-key-01") { withHost() }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.status") { value("NOT_EXECUTED") } }
            .andExpect { jsonPath("$.receipt") { doesNotExist() } }
    }

    private fun createDraft(
        title: String,
        key: String,
        meetingUrl: String? = null,
        meetingPasscode: String? = null,
    ): Pair<String, String> {
        val body =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = envelope(key, "{}", sessionCommand(title, meetingUrl, meetingPasscode))
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        return jsonMapper.readTree(body).get("sessionId").asString() to key
    }

    private fun open(
        sessionId: String,
        revision: Long,
        key: String,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(key, """{"sessionRevision":$revision}""", "{}")
            }.andExpect { status { isOk() } }
    }

    private fun envelope(
        key: String,
        expected: String,
        command: String,
    ) = """{"idempotencyKey":"$key","expected":$expected,"command":$command}"""

    private fun sessionCommand(
        title: String,
        meetingUrl: String? = null,
        meetingPasscode: String? = null,
    ): String {
        val meetingFields =
            buildString {
                if (meetingUrl != null) append(""","meetingUrl":"$meetingUrl"""")
                if (meetingPasscode != null) append(""","meetingPasscode":"$meetingPasscode"""")
            }
        return """
            {
              "title": "$title",
              "bookTitle": "영수증 책",
              "bookAuthor": "영수증 저자",
              "date": "2026-09-04",
              "locationLabel": "온라인"
              $meetingFields
            }
            """.trimIndent()
    }

    private fun close(
        sessionId: String,
        sessionRev: Long,
        setRevision: Long,
        snapshot: String,
        key: String,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        key,
                        """{"sessionRevision":$sessionRev,"participantSetRevision":$setRevision,"attendanceSnapshotId":"$snapshot"}""",
                        "{}",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun insertRecordDraft(sessionId: String) {
        val hostDisplayName =
            jdbcTemplate.queryForObject(
                "select name from users where email = 'host@example.com'",
                String::class.java,
            ) ?: error("missing host")
        val snapshot =
            jsonMapper.createObjectNode().apply {
                put("visibility", "MEMBER")
                put("publicationSummary", "교정 발행 회귀 요약")
                putArray("highlights").addObject().apply {
                    put("membershipId", HOST_MEMBERSHIP_ID)
                    put("authorDisplayName", hostDisplayName)
                    put("text", "교정 발행 회귀 하이라이트")
                }
                putArray("oneLineReviews").addObject().apply {
                    put("membershipId", HOST_MEMBERSHIP_ID)
                    put("authorDisplayName", hostDisplayName)
                    put("text", "교정 발행 회귀 한줄평")
                }
                putObject("feedbackDocument").apply {
                    put("fileName", "correction-regression.md")
                    put("title", "교정 발행 회귀 피드백")
                    put("markdown", correctionFeedbackMarkdown())
                }
            }
        val body =
            jsonMapper.createObjectNode().apply {
                putNull("expectedDraftRevision")
                set("snapshot", snapshot)
            }
        mockMvc
            .patch("/api/host/sessions/$sessionId/record-draft") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = body.toString()
            }.andExpect { status { isOk() } }
    }

    private fun correctionFeedbackMarkdown() =
        """
        <!-- readmates-feedback:v1 -->

        # 독서모임 1차 피드백

        범위 재시도 · 2026.09.04

        ## 메타

        - 책: 범위 재시도

        ## 관찰자 노트

        교정 발행 원자성 회귀를 확인합니다.

        ## 참여자별 피드백

        ### 01. Host

        역할: 호스트

        #### 참여 스타일

        안정적입니다.

        #### 실질 기여

        - 회귀 경로를 확인했습니다.

        #### 문제점과 자기모순

        ##### 1. 범위

        - 핵심: 범위를 유지합니다.
        - 근거: 단일 원자성 경로입니다.
        - 해석: 동일 계약을 유지합니다.

        #### 실천 과제

        1. 원자성 검증을 유지합니다.

        #### 드러난 한 문장

        > 교정 발행은 한 번만 반영됩니다.

        맥락: 회귀 테스트

        주석: 공개 데이터가 아닌 테스트 fixture입니다.
        """.trimIndent()

    private fun preparePublication(sessionId: String) {
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-prep-pub-${sessionId.take(8)}",
                        """{"publicationRevision":${publicationRevision(sessionId)}}""",
                        """{"publicSummary":"발행 요약","siteVisibility":"HIDDEN","visibility":"MEMBER"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun publishVectorJson(sessionId: String): String {
        val versions = versions(sessionId)
        return """
            {"sessionRevision":${versions.session},"liveRecordRevision":${versions.live},
            "exposureRevision":${versions.exposure},"publicationRevision":${versions.publication}}
            """.trimIndent().replace("\n", "")
    }

    private fun correctionVectorJson(sessionId: String): String {
        val versions = versions(sessionId)
        val draft = versions.draft ?: 1
        return """
            {"sessionRevision":${versions.session},"recordDraftRevision":$draft,
            "liveRecordRevision":${versions.live},"exposureRevision":${versions.exposure},
            "publicationRevision":${versions.publication}}
            """.trimIndent().replace("\n", "")
    }

    private data class Versions(
        val session: Long,
        val exposure: Long,
        val live: Long,
        val publication: Long,
        val draft: Long?,
    )

    private fun versions(sessionId: String): Versions =
        Versions(
            session = sessionRevision(sessionId),
            exposure = exposureRevision(sessionId),
            live = liveRecordRevision(sessionId),
            publication = publicationRevision(sessionId),
            draft = recordDraftRevision(sessionId),
        )

    private fun sessionRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select session_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing revision")

    private fun participantSetRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select participant_set_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing set revision")

    private fun exposureRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select exposure_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing exposure revision")

    private fun publicationRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select coalesce(publication_revision, 0) from session_publication_versions where session_id = ?",
            Long::class.java,
            sessionId,
        ) ?: 0

    private fun liveRecordRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select coalesce(max(version), 0) from session_record_revisions where session_id = ?",
            Long::class.java,
            sessionId,
        ) ?: 0

    private fun recordDraftRevision(sessionId: String): Long? =
        jdbcTemplate
            .query(
                "select draft_revision from session_record_drafts where session_id = ?",
                { rs, _ -> rs.getLong("draft_revision") },
                sessionId,
            ).firstOrNull()

    private fun attendanceStatus(
        sessionId: String,
        membershipId: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select attendance_status from session_participants
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
            membershipId,
        ) ?: error("missing attendance")

    private fun attendanceSnapshotId(sessionId: String): String {
        val rows =
            jdbcTemplate.query(
                """
                select membership_id, attendance_revision
                from session_participants
                where session_id = ? and participation_status = 'ACTIVE'
                order by membership_id
                """.trimIndent(),
                { rs, _ -> "${rs.getString("membership_id")}:${rs.getLong("attendance_revision")}" },
                sessionId,
            )
        return "att:${rows.joinToString(",")}"
    }

    private fun findState(sessionId: String): String =
        jdbcTemplate.queryForObject(
            "select state from sessions where id = ?",
            String::class.java,
            sessionId,
        ) ?: error("missing state")

    private fun countSessions(where: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from sessions where club_id = '$CLUB_ID' and number > 7 and $where",
            Int::class.java,
        ) ?: 0

    private fun publicationVersionCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from session_publication_versions where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun publicContentCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*) from public_session_publications
            where session_id = ? and trim(public_summary) <> ''
            """.trimIndent(),
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun receiptCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_mutation_receipts where resource_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun auditCount(
        sessionId: String,
        action: String? = null,
    ): Int {
        val sql =
            if (action == null) {
                "select count(*) from host_session_change_audit where session_id = ?"
            } else {
                "select count(*) from host_session_change_audit where session_id = ? and action_type = ?"
            }
        return if (action == null) {
            jdbcTemplate.queryForObject(sql, Int::class.java, sessionId) ?: 0
        } else {
            jdbcTemplate.queryForObject(sql, Int::class.java, sessionId, action) ?: 0
        }
    }

    private fun attendanceAuditCount(sessionId: String): Int = auditCount(sessionId, "ATTENDANCE_UPDATED")

    private fun lifecycleCount(
        sessionId: String,
        action: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_lifecycle_audit where session_id = ? and action_type = ?",
            Int::class.java,
            sessionId,
            action,
        ) ?: 0

    private fun MockHttpServletRequestDsl.withHost() {
        with(user("host@example.com"))
        with(csrf())
    }

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
        const val MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000202"
    }
}

private const val CLEANUP_IDEMPOTENCY_SQL = """
    delete from session_record_apply_receipts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_record_drafts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from host_session_mutation_receipts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and resource_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from mutation_idempotency_keys
    where club_id = '00000000-0000-0000-0000-000000000001'
      and actor_membership_id = '00000000-0000-0000-0000-000000000201';
    delete from host_session_change_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from host_session_lifecycle_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_feedback_documents
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from highlights
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from one_line_reviews
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_record_revisions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_participants
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_publication_versions
    where session_id in (
      select id from sessions
      where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
    );
    delete from public_session_publications
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001' and number > 7;
"""
