@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.adapter.`in`.web

import com.readmates.hostworkspace.application.model.HostWorkSourceAvailability
import com.readmates.hostworkspace.application.model.HostWorkboxActor
import com.readmates.hostworkspace.application.model.HostWorkboxInvalidRequestException
import com.readmates.hostworkspace.application.model.HostWorkboxItemProjection
import com.readmates.hostworkspace.application.model.HostWorkboxPage
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import com.readmates.hostworkspace.application.model.HostWorkboxRequest
import com.readmates.hostworkspace.application.model.HostWorkboxState
import com.readmates.hostworkspace.application.port.`in`.GetHostWorkboxUseCase
import com.readmates.hostworkspace.application.port.`in`.ManageHostWorkboxDeferralUseCase
import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import com.readmates.shared.security.CurrentMember
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.OffsetDateTime

@RestController
@RequestMapping("/api/host/workbox")
class HostWorkboxController(
    private val getWorkbox: GetHostWorkboxUseCase,
    private val manageDeferral: ManageHostWorkboxDeferralUseCase,
    private val cursorCodec: HostWorkboxCursorCodec,
) {
    @GetMapping
    fun get(
        member: CurrentMember,
        @RequestParam(defaultValue = "NOW") state: String,
        @RequestParam(defaultValue = "20") limit: Int,
        @RequestParam(required = false) cursor: String?,
    ): HostWorkboxPageResponse {
        val parsedState =
            runCatching { HostWorkboxState.valueOf(state) }
                .getOrElse { throw HostWorkboxInvalidRequestException() }
        if (limit !in 1..MAX_LIMIT) throw HostWorkboxInvalidRequestException()
        val owner = HostWorkboxOwner(member.clubId, member.membershipId)
        val continuation =
            cursor?.takeIf(String::isNotBlank)?.let {
                cursorCodec.decode(it, owner, parsedState, filterFingerprint(parsedState))
            }
        val page =
            getWorkbox.get(
                HostWorkboxRequest(
                    HostWorkboxActor(owner, member.isHost),
                    parsedState,
                    limit,
                    continuation,
                ),
            )
        return page.toResponse(if (page.hasMore) cursorCodec.encode(owner, page) else null)
    }

    @PutMapping("/items/{urlEncodedWorkItemKey}/deferral")
    fun defer(
        member: CurrentMember,
        @PathVariable urlEncodedWorkItemKey: String,
        @RequestBody body: HostWorkboxDeferralRequest,
    ): HostWorkboxDeferralReceiptResponse {
        val key = key(urlEncodedWorkItemKey)
        val deferredUntil =
            runCatching { OffsetDateTime.parse(body.deferredUntil) }
                .getOrElse { throw HostWorkboxInvalidRequestException() }
        val actor =
            HostWorkboxActor(HostWorkboxOwner(member.clubId, member.membershipId), member.isHost)
        val receipt = manageDeferral.defer(actor, key, deferredUntil)
        return HostWorkboxDeferralReceiptResponse(receipt.key.value, receipt.deferredUntil)
    }

    @DeleteMapping("/items/{urlEncodedWorkItemKey}/deferral")
    fun remove(
        member: CurrentMember,
        @PathVariable urlEncodedWorkItemKey: String,
    ): ResponseEntity<Void> {
        val actor =
            HostWorkboxActor(HostWorkboxOwner(member.clubId, member.membershipId), member.isHost)
        manageDeferral.remove(actor, key(urlEncodedWorkItemKey))
        return ResponseEntity.noContent().build()
    }

    private fun key(raw: String): HostWorkItemKey =
        runCatching { HostWorkItemKey(URLDecoder.decode(raw, StandardCharsets.UTF_8)) }
            .getOrElse { throw HostWorkboxInvalidRequestException() }

    private companion object {
        const val MAX_LIMIT = 100
    }
}

data class HostWorkboxDeferralRequest(
    val deferredUntil: String,
)

data class HostWorkboxDeferralReceiptResponse(
    val key: String,
    val deferredUntil: OffsetDateTime,
)

data class HostWorkboxPageResponse(
    val state: HostWorkboxState,
    val evaluatedAt: OffsetDateTime,
    val sourceAvailability: List<HostWorkSourceAvailability>,
    val items: List<HostWorkboxItemResponse>,
    val nextCursor: String?,
)

data class HostWorkboxItemResponse(
    val key: String,
    val type: com.readmates.hostworkspace.application.model.HostWorkItemType,
    val state: HostWorkboxState,
    val title: String,
    val description: String,
    val count: Int,
    val dueAt: OffsetDateTime?,
    val deferredUntil: OffsetDateTime?,
    val resolvedAt: OffsetDateTime?,
    val destinationHref: String,
    val receiptSummary: HostWorkboxReceiptSummary?,
)

private fun HostWorkboxPage.toResponse(next: String?) =
    HostWorkboxPageResponse(
        state,
        evaluatedAt,
        sourceAvailability,
        items.map(HostWorkboxItemProjection::toResponse),
        next,
    )

private fun HostWorkboxItemProjection.toResponse() =
    HostWorkboxItemResponse(
        key.value,
        type,
        state,
        title,
        description,
        count,
        dueAt,
        deferredUntil,
        resolvedAt,
        destinationHref,
        receiptSummary,
    )

private fun filterFingerprint(state: HostWorkboxState): String =
    MessageDigest
        .getInstance("SHA-256")
        .digest("state=${state.name}".toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
