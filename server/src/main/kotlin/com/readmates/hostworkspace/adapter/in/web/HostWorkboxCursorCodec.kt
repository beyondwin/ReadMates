@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.adapter.`in`.web

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkboxContinuation
import com.readmates.hostworkspace.application.model.HostWorkboxItemProjection
import com.readmates.hostworkspace.application.model.HostWorkboxPage
import com.readmates.hostworkspace.application.model.HostWorkboxState
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import com.readmates.shared.paging.HostListCursorSigningProperties
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.OffsetDateTime
import java.util.Base64
import java.util.UUID

class HostWorkboxCursorRestartException : IllegalArgumentException("Workbox cursor requires restart")

@Component
class HostWorkboxCursorCodec(
    private val properties: HostListCursorSigningProperties,
    private val clock: Clock = Clock.systemUTC(),
    private val objectMapper: ObjectMapper = ObjectMapper(),
) {
    fun encode(
        owner: HostWorkboxOwner,
        page: HostWorkboxPage,
        keyVersion: Int = properties.currentKeyVersion,
    ): String {
        val last = page.items.lastOrNull() ?: invalid()
        val ordinal = page.lastOrdinal ?: invalid()
        val key = key(keyVersion) ?: invalid()
        val payload = canonical(owner, page, ordinal, last, keyVersion)
        val bytes = payload.toByteArray(StandardCharsets.UTF_8)
        val encodedPayload = encoder.encodeToString(bytes)
        val encodedMac = encoder.encodeToString(RequestIdentityHmac.hmac(key, bytes, PURPOSE))
        return "$keyVersion.$encodedPayload.$encodedMac"
    }

    @Suppress("CyclomaticComplexMethod", "ThrowsCount", "LongMethod")
    fun decode(
        raw: String,
        owner: HostWorkboxOwner,
        state: HostWorkboxState,
        filterFingerprint: String,
    ): HostWorkboxContinuation {
        val parts = raw.split('.')
        if (parts.size != ENVELOPE_PARTS) invalid()
        val envelopeVersion = parts[0].toIntOrNull() ?: invalid()
        val payloadBytes = decodeCanonical(parts[1])
        val mac = decodeCanonical(parts[2])
        val key = key(envelopeVersion) ?: invalid()
        if (!RequestIdentityHmac.equal(mac, RequestIdentityHmac.hmac(key, payloadBytes, PURPOSE))) {
            invalid()
        }
        val payload = String(payloadBytes, StandardCharsets.UTF_8)
        val root = runCatching { objectMapper.readTree(payload) }.getOrElse { invalid() }
        if (root.propertyNames().toSet() != ROOT_KEYS) invalid()
        val last = root.get("last") ?: invalid()
        if (last.propertyNames().toSet() != LAST_KEYS) invalid()
        val claimsOwner =
            HostWorkboxOwner(
                uuid(root.get("clubId")?.asString()),
                uuid(root.get("hostMembershipId")?.asString()),
            )
        val claimsState =
            runCatching { HostWorkboxState.valueOf(root.get("state")?.asString() ?: "") }
                .getOrElse { invalid() }
        val claimsFilter =
            root.get("filterFingerprint")?.asString()?.takeIf(FINGERPRINT::matches) ?: invalid()
        val claimsVersion = root.get("keyVersion")?.asInt() ?: invalid()
        val claimsMatch =
            listOf(
                root.get("purpose")?.asString() == PURPOSE_CLAIM,
                root.get("version")?.asInt() == VERSION,
                claimsVersion == envelopeVersion,
                claimsOwner == owner,
                claimsState == state,
                claimsFilter == filterFingerprint,
            ).all { it }
        if (!claimsMatch) invalid()
        val snapshotId = uuid(root.get("snapshotId")?.asString())
        val schemaVersion = root.get("schemaVersion")?.asInt()?.takeIf { it > 0 } ?: invalid()
        val evaluatedAt = offset(root.get("evaluatedAt")?.asString())
        val expiry = offset(root.get("expiry")?.asString())
        if (!clock.instant().isBefore(expiry.toInstant())) invalid()
        val ordinal = last.get("ordinal")?.asInt()?.takeIf { it >= 0 } ?: invalid()
        val type =
            runCatching { HostWorkItemType.valueOf(last.get("type")?.asString() ?: "") }
                .getOrElse { invalid() }
        val dueAt =
            last
                .get("dueAt")
                ?.takeUnless { it.isNull }
                ?.asString()
                ?.let(::offset)
        val resourceId = last.get("resourceId")?.asString()?.takeIf(String::isNotBlank) ?: invalid()
        val generation =
            last.get("sourceGeneration")?.asString()?.takeIf(String::isNotBlank) ?: invalid()
        val priority = last.get("priority")?.asInt() ?: invalid()
        val page =
            HostWorkboxPage(
                snapshotId,
                state,
                claimsFilter,
                schemaVersion,
                evaluatedAt,
                expiry,
                emptyList(),
                listOf(lastProjection(type, resourceId, generation, dueAt)),
                ordinal,
                true,
            )
        if (
            canonical(owner, page, ordinal, page.items.single(), claimsVersion, priority) != payload
        ) {
            invalid()
        }
        return HostWorkboxContinuation(
            snapshotId,
            ordinal,
            claimsFilter,
            schemaVersion,
            evaluatedAt,
            expiry,
        )
    }

    private fun canonical(
        owner: HostWorkboxOwner,
        page: HostWorkboxPage,
        ordinal: Int,
        last: HostWorkboxItemProjection,
        keyVersion: Int,
        priority: Int = priority(last.type),
    ): String {
        val resourceId =
            last.key.value
                .substringAfter(':')
                .substringBeforeLast(':')
        val generation = last.key.value.substringAfterLast(':')
        val dueAt = last.dueAt?.let { "\"$it\"" } ?: "null"
        return "{\"clubId\":\"${owner.clubId}\",\"evaluatedAt\":\"${page.evaluatedAt}\"," +
            "\"expiry\":\"${page.expiresAt}\",\"filterFingerprint\":\"${page.filterFingerprint}\"," +
            "\"hostMembershipId\":\"${owner.hostMembershipId}\",\"keyVersion\":$keyVersion," +
            "\"last\":{\"dueAt\":$dueAt,\"ordinal\":$ordinal,\"priority\":$priority,\"resourceId\":\"$resourceId\"," +
            "\"sourceGeneration\":\"$generation\",\"type\":\"${last.type.name}\"},\"purpose\":\"$PURPOSE_CLAIM\"," +
            "\"schemaVersion\":${page.schemaVersion},\"snapshotId\":\"${page.snapshotId}\",\"state\":\"${page.state.name}\",\"version\":$VERSION}"
    }

    private fun lastProjection(
        type: HostWorkItemType,
        resourceId: String,
        generation: String,
        dueAt: OffsetDateTime?,
    ) = HostWorkboxItemProjection(
        com.readmates.hostworkspace.domain.HostWorkItemKey(
            "${type.name}:$resourceId:$generation",
        ),
        type,
        HostWorkboxState.NOW,
        "cursor",
        "cursor",
        0,
        dueAt,
        null,
        null,
        "/app/host/workbox",
        null,
    )

    private fun priority(type: HostWorkItemType): Int =
        when (type) {
            HostWorkItemType.MEMBER_APPROVAL -> MEMBER_APPROVAL_PRIORITY
            HostWorkItemType.SCHEDULE_UNSEEN -> SCHEDULE_UNSEEN_PRIORITY
            HostWorkItemType.RECORD_CLOSING -> RECORD_CLOSING_PRIORITY
            HostWorkItemType.INVITATION_EXPIRY -> INVITATION_EXPIRY_PRIORITY
            HostWorkItemType.NOTIFICATION_FAILURE -> NOTIFICATION_FAILURE_PRIORITY
        }

    private fun key(version: Int): ByteArray? =
        when (version) {
            properties.currentKeyVersion ->
                properties.currentKey.toByteArray(StandardCharsets.UTF_8)
            properties.previousKeyVersion ->
                properties.previousKey
                    .takeIf(String::isNotBlank)
                    ?.toByteArray(StandardCharsets.UTF_8)
            else -> null
        }

    private fun decodeCanonical(value: String): ByteArray =
        try {
            decoder.decode(value).also { if (encoder.encodeToString(it) != value) invalid() }
        } catch (_: IllegalArgumentException) {
            invalid()
        }

    private fun uuid(value: String?): UUID = runCatching { UUID.fromString(value) }.getOrElse { invalid() }

    private fun offset(value: String?): OffsetDateTime = runCatching { OffsetDateTime.parse(value) }.getOrElse { invalid() }

    private fun invalid(): Nothing = throw HostWorkboxCursorRestartException()

    private companion object {
        const val PURPOSE = "readmates:host-workbox-cursor:v1"
        const val PURPOSE_CLAIM = "host-workbox"
        const val VERSION = 1
        const val ENVELOPE_PARTS = 3
        const val MEMBER_APPROVAL_PRIORITY = 10
        const val SCHEDULE_UNSEEN_PRIORITY = 20
        const val RECORD_CLOSING_PRIORITY = 30
        const val INVITATION_EXPIRY_PRIORITY = 40
        const val NOTIFICATION_FAILURE_PRIORITY = 50
        val FINGERPRINT = Regex("[a-f0-9]{64}")
        val ROOT_KEYS =
            setOf(
                "clubId",
                "evaluatedAt",
                "expiry",
                "filterFingerprint",
                "hostMembershipId",
                "keyVersion",
                "last",
                "purpose",
                "schemaVersion",
                "snapshotId",
                "state",
                "version",
            )
        val LAST_KEYS =
            setOf("dueAt", "ordinal", "priority", "resourceId", "sourceGeneration", "type")
        val encoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
        val decoder: Base64.Decoder = Base64.getUrlDecoder()
    }
}
