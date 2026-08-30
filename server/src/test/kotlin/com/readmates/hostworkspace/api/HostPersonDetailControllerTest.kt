package com.readmates.hostworkspace.api

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.hostworkspace.adapter.`in`.web.HostPersonApplicationErrorHandler
import com.readmates.hostworkspace.adapter.`in`.web.HostPersonCursorCodec
import com.readmates.hostworkspace.adapter.`in`.web.HostPersonDetailController
import com.readmates.hostworkspace.application.model.HostPersonAttendanceHistoryPage
import com.readmates.hostworkspace.application.model.HostPersonAttendanceItem
import com.readmates.hostworkspace.application.model.HostPersonAttendanceStatus
import com.readmates.hostworkspace.application.model.HostPersonAttendanceTuple
import com.readmates.hostworkspace.application.model.HostPersonDetail
import com.readmates.hostworkspace.application.model.HostPersonDetailAccessDeniedException
import com.readmates.hostworkspace.application.model.HostPersonDetailNotFoundException
import com.readmates.hostworkspace.application.model.HostPersonDetailRequest
import com.readmates.hostworkspace.application.model.HostPersonMembershipRole
import com.readmates.hostworkspace.application.model.HostPersonMembershipStatus
import com.readmates.hostworkspace.application.model.HostPersonRsvpStatus
import com.readmates.hostworkspace.application.model.HostPersonSchedule
import com.readmates.hostworkspace.application.port.`in`.GetHostPersonDetailUseCase
import com.readmates.shared.paging.HostListCursorSigner
import com.readmates.shared.paging.HostListCursorSigningProperties
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.time.Clock
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostPersonDetailControllerTest {
    private val useCase = RecordingHostPersonDetailUseCase()
    private val properties =
        HostListCursorSigningProperties(
            currentKey = "person-current-key",
            currentKeyVersion = 2,
            previousKey = "person-previous-key",
            previousKeyVersion = 1,
        )
    private val codec = HostPersonCursorCodec(properties, Clock.fixed(NOW, ZoneOffset.UTC))
    private val mockMvc =
        MockMvcBuilders
            .standaloneSetup(HostPersonDetailController(useCase, codec))
            .setControllerAdvice(HostPersonApplicationErrorHandler())
            .setCustomArgumentResolvers(currentMemberResolver)
            .build()

    @Test
    fun `serializes only the privacy allowlist and binds URL club host and person`() {
        useCase.response = detail(hasNext = true)

        val json =
            mockMvc
                .get("/api/host/people/$TARGET_ID") {
                    param("limit", "1")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.membershipId") { value(TARGET_ID.toString()) }
                    jsonPath("$.attendanceHistory.items[0].sessionNumber") { value(7) }
                    jsonPath("$.attendanceHistory.nextCursor") { isNotEmpty() }
                    jsonPath("$.currentSchedule.state") { value("OPEN") }
                    jsonPath("$.currentSchedule.scheduleRevision") { value(7) }
                    jsonPath("$.currentRsvp") { value("GOING") }
                }.andReturn()
                .response
                .contentAsString

        assertThat(json.lowercase()).doesNotContain(
            "userid",
            "email",
            "accountname",
            "authsession",
            "pagepath",
            "duration",
            "ipaddress",
            "useragent",
            "provider",
            "token",
        )
        assertThat(useCase.request!!.actor.clubId).isEqualTo(HOST.clubId)
        assertThat(useCase.request!!.actor.hostMembershipId).isEqualTo(HOST.membershipId)
        assertThat(useCase.request!!.targetMembershipId).isEqualTo(TARGET_ID)
        assertThat(useCase.request!!.limit).isEqualTo(1)
    }

    @Test
    fun `rejects malformed identifiers bounds tamper and cursor reuse across host person and purpose`() {
        useCase.response = detail(hasNext = true)
        val first =
            mockMvc
                .get("/api/host/people/$TARGET_ID")
                .andReturn()
                .response
                .contentAsString
        val cursor = Regex("\\\"nextCursor\\\":\\\"([^\\\"]+)\\\"").find(first)!!.groupValues[1]

        listOf("broken", mutate(cursor)).forEach { invalid ->
            mockMvc
                .get("/api/host/people/$TARGET_ID") {
                    param("attendanceCursor", invalid)
                }.andExpect { status { isBadRequest() } }
        }
        mockMvc
            .get("/api/host/people/not-a-uuid")
            .andExpect { status { isBadRequest() } }
        mockMvc
            .get("/api/host/people/$TARGET_ID") { param("limit", "101") }
            .andExpect { status { isBadRequest() } }

        val otherTarget = UUID.fromString("00000000-0000-0000-0000-000000000299")
        mockMvc
            .get("/api/host/people/$otherTarget") {
                param("attendanceCursor", cursor)
            }.andExpect { status { isBadRequest() } }

        val hostListCursor = HostListCursorSigner(properties).sign("{}")
        mockMvc
            .get("/api/host/people/$TARGET_ID") {
                param("attendanceCursor", hostListCursor)
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `accepts current and previous keys but rejects expired and retired keys`() {
        val anchor = codec.begin().copy(historyFingerprint = FINGERPRINT)
        val tuple = detail(true).attendanceHistory.next!!
        val current = codec.encode(HOST.clubId, HOST.membershipId, TARGET_ID, anchor, tuple)
        val previous = codec.encode(HOST.clubId, HOST.membershipId, TARGET_ID, anchor, tuple, keyVersion = 1)
        assertThat(codec.decode(current, HOST.clubId, HOST.membershipId, TARGET_ID).last).isEqualTo(tuple)
        assertThat(codec.decode(previous, HOST.clubId, HOST.membershipId, TARGET_ID).last).isEqualTo(tuple)
        assertThatThrownBy { codec.decode(current, UUID.randomUUID(), HOST.membershipId, TARGET_ID) }
            .isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { codec.decode(current, HOST.clubId, UUID.randomUUID(), TARGET_ID) }
            .isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { codec.decode(current, HOST.clubId, HOST.membershipId, UUID.randomUUID()) }
            .isInstanceOf(IllegalArgumentException::class.java)

        val retiredCodec =
            HostPersonCursorCodec(
                HostListCursorSigningProperties(currentKey = "retired-key", currentKeyVersion = 0),
                Clock.fixed(NOW, ZoneOffset.UTC),
            )
        val retired = retiredCodec.encode(HOST.clubId, HOST.membershipId, TARGET_ID, anchor, tuple)
        assertThatThrownBy { codec.decode(retired, HOST.clubId, HOST.membershipId, TARGET_ID) }
            .isInstanceOf(IllegalArgumentException::class.java)

        val expiredAnchor = anchor.copy(expiry = NOW.minusSeconds(1))
        val expired = codec.encode(HOST.clubId, HOST.membershipId, TARGET_ID, expiredAnchor, tuple)
        assertThatThrownBy { codec.decode(expired, HOST.clubId, HOST.membershipId, TARGET_ID) }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `continuation restores its anchor and the last page omits a cursor`() {
        val anchor = codec.begin().copy(historyFingerprint = FINGERPRINT)
        val cursor = codec.encode(HOST.clubId, HOST.membershipId, TARGET_ID, anchor, TUPLE)
        useCase.response = detail(hasNext = false)

        mockMvc
            .get("/api/host/people/$TARGET_ID") {
                param("attendanceCursor", cursor)
            }.andExpect {
                status { isOk() }
                jsonPath("$.attendanceHistory.nextCursor") { doesNotExist() }
            }

        assertThat(useCase.request!!.cursor.evaluatedAt).isEqualTo(anchor.evaluatedAt)
        assertThat(useCase.request!!.cursor.last).isEqualTo(TUPLE)
        assertThat(useCase.request!!.cursor.historyFingerprint).isEqualTo(FINGERPRINT)
    }

    @Test
    fun `authority loss and cross club missing target use controlled errors`() {
        useCase.failure = HostPersonDetailAccessDeniedException()
        mockMvc
            .get("/api/host/people/$TARGET_ID")
            .andExpect {
                status { isForbidden() }
                jsonPath("$.code") { value("PERMISSION_DENIED") }
            }

        useCase.failure = HostPersonDetailNotFoundException()
        mockMvc
            .get("/api/host/people/$TARGET_ID")
            .andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("RESOURCE_NOT_FOUND") }
            }
    }

    private fun detail(hasNext: Boolean) =
        HostPersonDetail(
            membershipId = TARGET_ID,
            displayName = "가람",
            avatarKey = "mushroom-green-book",
            status = HostPersonMembershipStatus.ACTIVE,
            role = HostPersonMembershipRole.MEMBER,
            lastClubAccessAt = Instant.parse("2026-08-30T01:00:00Z"),
            currentSchedule =
                HostPersonSchedule(
                    state = "OPEN",
                    scheduleRevision = 7,
                    scheduledAt = LocalDateTime.parse("2026-09-01T19:00:00"),
                ),
            currentRsvp = HostPersonRsvpStatus.GOING,
            attendanceHistory =
                HostPersonAttendanceHistoryPage(
                    items =
                        listOf(
                            HostPersonAttendanceItem(
                                sessionNumber = 7,
                                scheduledAt = LocalDateTime.parse("2026-08-29T19:00:00"),
                                attendanceStatus = HostPersonAttendanceStatus.ATTENDED,
                                tuple = TUPLE,
                            ),
                        ),
                    next = TUPLE.takeIf { hasNext },
                    historyFingerprint = FINGERPRINT,
                ),
        )

    private fun mutate(raw: String): String = raw.dropLast(1) + if (raw.last() == 'A') "B" else "A"
}

private class RecordingHostPersonDetailUseCase : GetHostPersonDetailUseCase {
    lateinit var response: HostPersonDetail
    var request: HostPersonDetailRequest? = null
    var failure: RuntimeException? = null

    override fun get(request: HostPersonDetailRequest): HostPersonDetail {
        this.request = request
        failure?.let { throw it }
        return response
    }
}

private val NOW = Instant.parse("2026-08-30T09:00:00Z")
private const val FINGERPRINT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
private val TARGET_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000202")
private val TUPLE =
    HostPersonAttendanceTuple(
        LocalDateTime.parse("2026-08-29T19:00:00"),
        7,
        UUID.fromString("00000000-0000-0000-0000-000000000307"),
    )
private val HOST =
    CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubSlug = "reading-sai",
        email = "host@example.com",
        displayName = "Host",
        accountName = "Host",
        role = MembershipRole.HOST,
        membershipStatus = MembershipStatus.ACTIVE,
    )

private val currentMemberResolver =
    object : HandlerMethodArgumentResolver {
        @Suppress("MaxLineLength")
        override fun supportsParameter(parameter: MethodParameter): Boolean = parameter.parameterType == CurrentMember::class.java

        override fun resolveArgument(
            _parameter: MethodParameter,
            _mavContainer: ModelAndViewContainer?,
            _webRequest: NativeWebRequest,
            _binderFactory: WebDataBinderFactory?,
        ): Any = HOST
    }
