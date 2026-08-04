@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.operations.adapter.`in`.web

import com.readmates.admin.operations.application.AdminOperationError
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationAssigneeFilter
import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationCaseCounts
import com.readmates.admin.operations.application.model.AdminOperationCaseEvent
import com.readmates.admin.operations.application.model.AdminOperationCaseFilter
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.`in`.AcknowledgeAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.AdminOperationCaseDetail
import com.readmates.admin.operations.application.port.`in`.AdminOperationCasePage
import com.readmates.admin.operations.application.port.`in`.AdminOperationCaseView
import com.readmates.admin.operations.application.port.`in`.AdminOperationMutationCommand
import com.readmates.admin.operations.application.port.`in`.GetAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.ListAdminOperationCasesUseCase
import com.readmates.admin.operations.application.port.`in`.ResolveAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCommand
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.time.OffsetDateTime
import java.util.UUID

class PlatformAdminOperationsControllerTest {
    private val useCases = FakeAdminOperationUseCases()
    private val admin =
        CurrentPlatformAdmin(
            userId = ADMIN_ID,
            email = "private-admin@example.test",
            role = PlatformAdminRole.OWNER,
        )
    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        mockMvc =
            MockMvcBuilders
                .standaloneSetup(
                    PlatformAdminOperationsController(
                        listUseCase = useCases,
                        getUseCase = useCases,
                        acknowledgeUseCase = useCases,
                        snoozeUseCase = useCases,
                        resolveUseCase = useCases,
                    ),
                ).setControllerAdvice(AdminOperationErrorHandler())
                .setCustomArgumentResolvers(StubCurrentPlatformAdminResolver(admin))
                .build()
    }

    @Test
    fun `list parses allowlisted filters caps limit and returns safe schema projection`() {
        useCases.page = samplePage()

        val body =
            mockMvc
                .get(
                    "/api/admin/operations/cases" +
                        "?state=OPEN&state=ACKNOWLEDGED&severity=CRITICAL&source=AI_JOB&assignee=ME&limit=99",
                ).andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.operation_cases.v1") }
                    jsonPath("$.generatedAt") { value("2026-08-04T00:00:00Z") }
                    jsonPath("$.counts.open") { value(2) }
                    jsonPath("$.counts.critical") { value(1) }
                    jsonPath("$.counts.assignedToMe") { value(0) }
                    jsonPath("$.counts.snoozed") { value(1) }
                    jsonPath("$.sources[0].sourceType") { value("AI_JOB") }
                    jsonPath("$.sources[0].status") { value("AVAILABLE") }
                    jsonPath("$.items[0].id") { value(CASE_ID.toString()) }
                    jsonPath("$.items[0].sourceType") { value("AI_JOB") }
                    jsonPath("$.items[0].clubId") { value(CLUB_ID.toString()) }
                    jsonPath("$.items[0].summaryCode") { value("AI_JOB_STALE") }
                    jsonPath("$.items[0].allowedActions[0]") { value("ACKNOWLEDGE") }
                    jsonPath("$.items[0].assignedToMe") { value(false) }
                    jsonPath("$.items[0].version") { value(3) }
                    jsonPath("$.nextCursor") { value("next-safe-cursor") }
                    jsonPath("$.items[0].sourceKey") { doesNotExist() }
                    jsonPath("$.items[0].assigneeAdminId") { doesNotExist() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(useCases.lastFilter)
            .isEqualTo(
                AdminOperationCaseFilter(
                    states = setOf(AdminOperationCaseState.OPEN, AdminOperationCaseState.ACKNOWLEDGED),
                    severities = setOf(AdminOperationSeverity.CRITICAL),
                    sources = setOf(AdminOperationSourceType.AI_JOB),
                    assignee = AdminOperationAssigneeFilter.ME,
                ),
            )
        assertThat(useCases.lastPageRequest?.limit).isEqualTo(50)
        assertThat(useCases.lastPageRequest?.cursor).isEmpty()
        assertThat(body).doesNotContain(INTERNAL_SOURCE_SENTINEL)
        assertThat(body).doesNotContain("private-admin@example.test")
        assertThat(body).doesNotContain(OTHER_ADMIN_ID.toString())
    }

    @Test
    fun `list rejects malformed cursor with a safe typed error`() {
        mockMvc
            .get("/api/admin/operations/cases?cursor=not-a-canonical-cursor")
            .andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
                jsonPath("$.message") { value("페이지 정보를 다시 확인해 주세요.") }
                jsonPath("$.status") { value(400) }
            }

        assertThat(useCases.lastPageRequest).isNull()
    }

    @Test
    fun `list accepts a canonical operation case cursor`() {
        useCases.page = samplePage()
        val cursor =
            CursorCodec.encode(
                mapOf(
                    "severityRank" to "0",
                    "firstObservedAt" to "2026-08-04T00:00:00Z",
                    "id" to CASE_ID.toString(),
                ),
            )

        mockMvc
            .get("/api/admin/operations/cases?cursor=$cursor")
            .andExpect {
                status { isOk() }
            }

        assertThat(useCases.lastPageRequest?.cursor)
            .containsExactlyInAnyOrderEntriesOf(CursorCodec.decodeStrict(cursor))
    }

    @Test
    fun `list rejects unknown and blank filters with a safe typed error`() {
        listOf(
            "/api/admin/operations/cases?state=UNKNOWN",
            "/api/admin/operations/cases?severity=",
            "/api/admin/operations/cases?source=AI_JOB,UNKNOWN",
            "/api/admin/operations/cases?assignee=other-admin",
        ).forEach { requestPath ->
            mockMvc
                .get(requestPath)
                .andExpect {
                    status { isBadRequest() }
                    jsonPath("$.code") { value("INVALID_FILTER") }
                    jsonPath("$.message") { value("검색 조건을 다시 확인해 주세요.") }
                    jsonPath("$.status") { value(400) }
                }
        }
    }

    @Test
    fun `detail returns case and safe history without source key or actor id`() {
        useCases.detail =
            AdminOperationCaseDetail(
                case = sampleView(),
                history =
                    listOf(
                        AdminOperationCaseEvent(
                            id = EVENT_ID,
                            caseId = CASE_ID,
                            fromState = AdminOperationCaseState.OPEN,
                            toState = AdminOperationCaseState.ACKNOWLEDGED,
                            action = AdminOperationAction.ACKNOWLEDGE,
                            actorAdminId = OTHER_ADMIN_ID,
                            reasonCode = "OPERATOR_ACKNOWLEDGED",
                            occurredAt = OffsetDateTime.parse("2026-08-04T00:01:00Z"),
                            caseVersion = 3,
                        ),
                    ),
            )

        val body =
            mockMvc
                .get("/api/admin/operations/cases/$CASE_ID")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.operation_cases.v1") }
                    jsonPath("$.item.id") { value(CASE_ID.toString()) }
                    jsonPath("$.history[0].fromState") { value("OPEN") }
                    jsonPath("$.history[0].toState") { value("ACKNOWLEDGED") }
                    jsonPath("$.history[0].action") { value("ACKNOWLEDGE") }
                    jsonPath("$.history[0].reasonCode") { value("OPERATOR_ACKNOWLEDGED") }
                    jsonPath("$.history[0].caseVersion") { value(3) }
                    jsonPath("$.history[0].actorAdminId") { doesNotExist() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(useCases.lastCaseId).isEqualTo(CASE_ID)
        assertThat(body).doesNotContain(INTERNAL_SOURCE_SENTINEL)
        assertThat(body).doesNotContain(OTHER_ADMIN_ID.toString())
    }

    @Test
    fun `acknowledge requires expected version and returns safe case projection`() {
        arrangeMutationResult(sampleCase().copy(state = AdminOperationCaseState.ACKNOWLEDGED, version = 4))

        mockMvc
            .post("/api/admin/operations/cases/$CASE_ID/acknowledge") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":3}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.schema") { value("admin.operation_cases.v1") }
                jsonPath("$.state") { value("ACKNOWLEDGED") }
                jsonPath("$.version") { value(4) }
                jsonPath("$.allowedActions[0]") { value("ACKNOWLEDGE") }
                jsonPath("$.source.status") { value("AVAILABLE") }
                jsonPath("$.sourceKey") { doesNotExist() }
            }

        assertThat(useCases.lastAcknowledge)
            .isEqualTo(AdminOperationMutationCommand(CASE_ID, expectedVersion = 3))
    }

    @Test
    fun `resolve requires expected version and delegates exact case id`() {
        arrangeMutationResult(sampleCase().copy(state = AdminOperationCaseState.RESOLVED, version = 4))

        mockMvc
            .post("/api/admin/operations/cases/$CASE_ID/resolve") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":3}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("RESOLVED") }
            }

        assertThat(useCases.lastResolve)
            .isEqualTo(AdminOperationMutationCommand(CASE_ID, expectedVersion = 3))
    }

    @Test
    fun `snooze parses ISO offset time and rejects malformed or missing fields safely`() {
        arrangeMutationResult(
            sampleCase().copy(
                state = AdminOperationCaseState.SNOOZED,
                snoozedUntil = OffsetDateTime.parse("2026-08-05T09:30:00+09:00"),
                version = 4,
            ),
        )

        mockMvc
            .post("/api/admin/operations/cases/$CASE_ID/snooze") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":3,"snoozedUntil":"2026-08-05T09:30:00+09:00"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("SNOOZED") }
                jsonPath("$.snoozedUntil") { value("2026-08-05T09:30:00+09:00") }
            }

        assertThat(useCases.lastSnooze)
            .isEqualTo(
                SnoozeAdminOperationCommand(
                    CASE_ID,
                    expectedVersion = 3,
                    snoozedUntil = OffsetDateTime.parse("2026-08-05T09:30:00+09:00"),
                ),
            )

        mockMvc
            .post("/api/admin/operations/cases/$CASE_ID/snooze") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":3,"snoozedUntil":"tomorrow"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_SNOOZE_WINDOW") }
                jsonPath("$.message") { value("보류 시각을 다시 확인해 주세요.") }
                jsonPath("$.status") { value(400) }
            }

        mockMvc
            .post("/api/admin/operations/cases/$CASE_ID/acknowledge") {
                contentType = MediaType.APPLICATION_JSON
                content = "{}"
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
                jsonPath("$.status") { value(400) }
            }
    }

    @Test
    fun `mutations reject unknown JSON members before invoking use cases`() {
        mockMvc
            .post("/api/admin/operations/cases/$CASE_ID/acknowledge") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":3,"sourceKey":"$INTERNAL_SOURCE_SENTINEL"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
                jsonPath("$.status") { value(400) }
            }

        mockMvc
            .post("/api/admin/operations/cases/$CASE_ID/snooze") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"expectedVersion":3,"snoozedUntil":"2026-08-05T09:30:00+09:00","unexpected":true}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
                jsonPath("$.status") { value(400) }
            }

        mockMvc
            .post("/api/admin/operations/cases/$CASE_ID/acknowledge") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedVersion":"3"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
                jsonPath("$.status") { value(400) }
            }

        assertThat(useCases.lastAcknowledge).isNull()
        assertThat(useCases.lastSnooze).isNull()
    }

    @Test
    fun `typed application failures map to stable Korean API errors`() {
        val expected =
            listOf(
                AdminOperationError.CASE_VERSION_CONFLICT to
                    Triple(409, "CASE_VERSION_CONFLICT", "다른 운영자가 먼저 상태를 변경했습니다."),
                AdminOperationError.CASE_STILL_ACTIVE to
                    Triple(409, "CASE_STILL_ACTIVE", "운영 신호가 아직 활성 상태입니다."),
                AdminOperationError.CASE_SOURCE_UNAVAILABLE to
                    Triple(
                        503,
                        "CASE_SOURCE_UNAVAILABLE",
                        "운영 신호를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
                    ),
                AdminOperationError.CASE_NOT_FOUND to Triple(404, "CASE_NOT_FOUND", "요청한 운영 케이스를 찾을 수 없습니다."),
                AdminOperationError.PERMISSION_DENIED to Triple(403, "PERMISSION_DENIED", "이 작업을 수행할 권한이 없습니다."),
            )

        expected.forEach { (error, response) ->
            useCases.failure = error
            mockMvc
                .get("/api/admin/operations/cases/$CASE_ID")
                .andExpect {
                    status { isEqualTo(response.first) }
                    jsonPath("$.code") { value(response.second) }
                    jsonPath("$.message") { value(response.third) }
                    jsonPath("$.status") { value(response.first) }
                }
        }
    }

    private fun samplePage(): AdminOperationCasePage =
        AdminOperationCasePage(
            generatedAt = OffsetDateTime.parse("2026-08-04T00:00:00Z"),
            counts = AdminOperationCaseCounts(open = 2, critical = 1, assignedToMe = 0, snoozed = 1),
            sources = listOf(SOURCE_FRESHNESS),
            cases = CursorPage(items = listOf(sampleView()), nextCursor = "next-safe-cursor"),
        )

    private fun sampleView(): AdminOperationCaseView =
        AdminOperationCaseView(
            case = sampleCase(),
            allowedActions = setOf(AdminOperationAction.ACKNOWLEDGE, AdminOperationAction.SNOOZE),
            source = SOURCE_FRESHNESS,
        )

    private fun arrangeMutationResult(case: AdminOperationCase) {
        useCases.mutationResult = case
        useCases.detail =
            AdminOperationCaseDetail(
                case = sampleView().copy(case = case),
                history = emptyList(),
            )
    }

    private fun sampleCase(): AdminOperationCase =
        AdminOperationCase(
            id = CASE_ID,
            sourceType = AdminOperationSourceType.AI_JOB,
            sourceKey = INTERNAL_SOURCE_SENTINEL,
            clubId = CLUB_ID,
            state = AdminOperationCaseState.OPEN,
            severity = AdminOperationSeverity.CRITICAL,
            summaryCode = "AI_JOB_STALE",
            firstObservedAt = OffsetDateTime.parse("2026-08-03T22:00:00Z"),
            lastObservedAt = OffsetDateTime.parse("2026-08-03T23:59:00Z"),
            snoozedUntil = null,
            assigneeAdminId = OTHER_ADMIN_ID,
            resolvedAt = null,
            reopenCount = 1,
            version = 3,
            impactCount = 2,
            detailHref = "/admin/ai-ops/jobs/$CASE_ID",
        )

    private companion object {
        val ADMIN_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000a601")
        val OTHER_ADMIN_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000a602")
        val CASE_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000c601")
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000c602")
        val EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000e601")
        const val INTERNAL_SOURCE_SENTINEL = "AI_JOB:INTERNAL_SOURCE_SENTINEL"
        val SOURCE_FRESHNESS =
            AdminOperationSourceFreshness(
                sourceType = AdminOperationSourceType.AI_JOB,
                status = AdminOperationSourceStatus.AVAILABLE,
                generatedAt = OffsetDateTime.parse("2026-08-04T00:00:00Z"),
                lastSuccessfulAt = OffsetDateTime.parse("2026-08-04T00:00:00Z"),
                authoritative = true,
            )
    }
}

private class FakeAdminOperationUseCases :
    ListAdminOperationCasesUseCase,
    GetAdminOperationCaseUseCase,
    AcknowledgeAdminOperationCaseUseCase,
    SnoozeAdminOperationCaseUseCase,
    ResolveAdminOperationCaseUseCase {
    lateinit var page: AdminOperationCasePage
    lateinit var detail: AdminOperationCaseDetail
    lateinit var mutationResult: AdminOperationCase
    var failure: AdminOperationError? = null
    var lastFilter: AdminOperationCaseFilter? = null
    var lastPageRequest: PageRequest? = null
    var lastCaseId: UUID? = null
    var lastAcknowledge: AdminOperationMutationCommand? = null
    var lastSnooze: SnoozeAdminOperationCommand? = null
    var lastResolve: AdminOperationMutationCommand? = null

    override fun list(
        admin: CurrentPlatformAdmin,
        filter: AdminOperationCaseFilter,
        page: PageRequest,
    ): AdminOperationCasePage {
        failIfRequested()
        lastFilter = filter
        lastPageRequest = page
        return this.page
    }

    override fun get(
        admin: CurrentPlatformAdmin,
        caseId: UUID,
    ): AdminOperationCaseDetail {
        failIfRequested()
        lastCaseId = caseId
        return detail
    }

    override fun acknowledge(
        admin: CurrentPlatformAdmin,
        command: AdminOperationMutationCommand,
    ): AdminOperationCase {
        failIfRequested()
        lastAcknowledge = command
        return mutationResult
    }

    override fun snooze(
        admin: CurrentPlatformAdmin,
        command: SnoozeAdminOperationCommand,
    ): AdminOperationCase {
        failIfRequested()
        lastSnooze = command
        return mutationResult
    }

    override fun resolve(
        admin: CurrentPlatformAdmin,
        command: AdminOperationMutationCommand,
    ): AdminOperationCase {
        failIfRequested()
        lastResolve = command
        return mutationResult
    }

    private fun failIfRequested() {
        failure?.let { throw AdminOperationException(it) }
    }
}

private class StubCurrentPlatformAdminResolver(
    private val admin: CurrentPlatformAdmin,
) : HandlerMethodArgumentResolver {
    private val supportedType = CurrentPlatformAdmin::class.java

    override fun supportsParameter(parameter: MethodParameter): Boolean = parameter.parameterType == supportedType

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Any = admin
}
