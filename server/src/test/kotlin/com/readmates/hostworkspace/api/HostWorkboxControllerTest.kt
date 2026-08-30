package com.readmates.hostworkspace.api

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.hostworkspace.adapter.`in`.web.HostWorkboxController
import com.readmates.hostworkspace.adapter.`in`.web.HostWorkboxCursorCodec
import com.readmates.hostworkspace.adapter.`in`.web.HostWorkboxErrorHandler
import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailability
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailabilityState
import com.readmates.hostworkspace.application.model.HostWorkboxActor
import com.readmates.hostworkspace.application.model.HostWorkboxItemProjection
import com.readmates.hostworkspace.application.model.HostWorkboxPage
import com.readmates.hostworkspace.application.model.HostWorkboxRequest
import com.readmates.hostworkspace.application.model.HostWorkboxState
import com.readmates.hostworkspace.application.port.`in`.GetHostWorkboxUseCase
import com.readmates.hostworkspace.application.port.`in`.ManageHostWorkboxDeferralUseCase
import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxDeferral
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import com.readmates.shared.paging.HostListCursorSigningProperties
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostWorkboxControllerTest {
    private val useCase = RecordingWorkboxUseCase()
    private val codec =
        HostWorkboxCursorCodec(
            HostListCursorSigningProperties("workbox-key", 1),
            Clock.fixed(NOW, ZoneOffset.UTC),
        )
    private val mockMvc =
        MockMvcBuilders
            .standaloneSetup(HostWorkboxController(useCase, useCase, codec))
            .setControllerAdvice(HostWorkboxErrorHandler())
            .setCustomArgumentResolvers(currentMemberResolver)
            .build()

    @Test
    fun `get exposes exact item allowlist zero count typed availability and continuation`() {
        useCase.page = page(hasMore = true)
        val body =
            mockMvc
                .get("/api/host/workbox") {
                    param("state", "NOW")
                    param("limit", "1")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[0].count") { value(0) }
                    jsonPath("$.sourceAvailability[0].state") { value("AVAILABLE") }
                    jsonPath("$.nextCursor") { isNotEmpty() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body.lowercase())
            .doesNotContain(
                "email",
                "token",
                "userid",
                "providerbody",
                "pagehistory",
                "authsession",
            )
        assertThat(useCase.request!!.actor.owner).isEqualTo(OWNER)
        assertThat(useCase.request!!.state).isEqualTo(HostWorkboxState.NOW)
    }

    @Test
    fun `cursor continuation is bound and malformed state limit cursor and inactive authority are controlled`() {
        useCase.page = page(hasMore = true)
        val body =
            mockMvc
                .get("/api/host/workbox") {
                    param("state", "NOW")
                    param("limit", "1")
                }.andReturn()
                .response
                .contentAsString
        val cursor = Regex("\\\"nextCursor\\\":\\\"([^\\\"]+)\\\"").find(body)!!.groupValues[1]
        useCase.page = page(hasMore = false)
        mockMvc
            .get("/api/host/workbox") {
                param("state", "NOW")
                param("cursor", cursor)
            }.andExpect {
                status { isOk() }
                jsonPath("$.nextCursor") { doesNotExist() }
            }
        assertThat(useCase.request!!.continuation).isNotNull

        mockMvc
            .get("/api/host/workbox") { param("state", "OTHER") }
            .andExpect { status { isBadRequest() } }
        mockMvc
            .get("/api/host/workbox") { param("limit", "0") }
            .andExpect { status { isBadRequest() } }
        mockMvc
            .get("/api/host/workbox") { param("cursor", "broken") }
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("WORKBOX_RESTART_REQUIRED") }
            }
    }

    @Test
    fun `present blank cursors fail closed while absence starts the first page`() {
        useCase.page = page(hasMore = false)

        mockMvc.get("/api/host/workbox").andExpect { status { isOk() } }
        assertThat(useCase.request!!.continuation).isNull()

        listOf("", "   ", "\t").forEach { invalid ->
            mockMvc
                .get("/api/host/workbox") { param("cursor", invalid) }
                .andExpect {
                    status { isConflict() }
                    jsonPath("$.code") { value("WORKBOX_RESTART_REQUIRED") }
                }
        }
    }

    @Test
    fun `put and delete submit authoritative encoded key verbatim and reject malformed values`() {
        val encoded = "SCHEDULE_UNSEEN%3Asession-1%3Ar7"
        mockMvc
            .put("/api/host/workbox/items/$encoded/deferral") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"deferredUntil":"2026-08-31T09:00:00Z"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.key") { value("SCHEDULE_UNSEEN:session-1:r7") }
            }
        assertThat(useCase.deferredKey!!.value).isEqualTo("SCHEDULE_UNSEEN:session-1:r7")

        mockMvc.delete("/api/host/workbox/items/$encoded/deferral").andExpect {
            status { isNoContent() }
        }
        assertThat(useCase.removedKey!!.value).isEqualTo("SCHEDULE_UNSEEN:session-1:r7")

        mockMvc
            .put("/api/host/workbox/items/%20/deferral") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"deferredUntil":"not-time"}"""
            }.andExpect { status { isBadRequest() } }
    }

    private fun page(hasMore: Boolean) =
        HostWorkboxPage(
            UUID.fromString("90000000-0000-4000-8000-000000000001"),
            HostWorkboxState.NOW,
            "8e245492368b0d1ca7c14aadbfba67ca65131fe8ca4f3df14cdabe3da36fca46",
            1,
            OffsetDateTime.parse("2026-08-30T09:00:00Z"),
            OffsetDateTime.parse("2026-08-30T09:15:00Z"),
            listOf(
                HostWorkSourceAvailability(
                    HostWorkItemType.SCHEDULE_UNSEEN,
                    HostWorkSourceAvailabilityState.AVAILABLE,
                ),
            ),
            listOf(
                HostWorkboxItemProjection(
                    HostWorkItemKey("SCHEDULE_UNSEEN:session-1:r7"),
                    HostWorkItemType.SCHEDULE_UNSEEN,
                    HostWorkboxState.NOW,
                    "일정 확인",
                    "안전한 설명",
                    0,
                    null,
                    null,
                    null,
                    "/app/host/sessions/session-1/schedule-review",
                    null,
                ),
            ),
            0,
            hasMore,
        )
}

private class RecordingWorkboxUseCase :
    GetHostWorkboxUseCase,
    ManageHostWorkboxDeferralUseCase {
    lateinit var page: HostWorkboxPage
    var request: HostWorkboxRequest? = null
    var deferredKey: HostWorkItemKey? = null
    var removedKey: HostWorkItemKey? = null

    override fun get(request: HostWorkboxRequest): HostWorkboxPage {
        this.request = request
        return page
    }

    override fun defer(
        actor: HostWorkboxActor,
        key: HostWorkItemKey,
        deferredUntil: OffsetDateTime,
    ): HostWorkboxDeferral {
        deferredKey = key
        return HostWorkboxDeferral.restore(actor.owner, key, deferredUntil)
    }

    override fun remove(
        actor: HostWorkboxActor,
        key: HostWorkItemKey,
    ): Boolean {
        removedKey = key
        return true
    }
}

private val NOW = Instant.parse("2026-08-30T09:00:00Z")
private val OWNER =
    HostWorkboxOwner(
        UUID.fromString("00000000-0000-0000-0000-000000000001"),
        UUID.fromString("00000000-0000-0000-0000-000000000201"),
    )
private val HOST =
    CurrentMember(
        UUID.randomUUID(),
        OWNER.hostMembershipId,
        OWNER.clubId,
        "reading-sai",
        "host@example.com",
        "Host",
        "Host",
        MembershipRole.HOST,
        MembershipStatus.ACTIVE,
    )
private val currentMemberResolver =
    object : HandlerMethodArgumentResolver {
        override fun supportsParameter(parameter: MethodParameter): Boolean = parameter.parameterType == memberType

        override fun resolveArgument(
            _parameter: MethodParameter,
            _mavContainer: ModelAndViewContainer?,
            _webRequest: NativeWebRequest,
            _binderFactory: WebDataBinderFactory?,
        ): Any = HOST
    }

private val memberType = CurrentMember::class.java
