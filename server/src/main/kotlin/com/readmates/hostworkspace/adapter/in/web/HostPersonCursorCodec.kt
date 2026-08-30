@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.adapter.`in`.web

import com.readmates.hostworkspace.application.model.HostPersonAttendanceTuple
import com.readmates.hostworkspace.application.model.HostPersonCursorAnchor
import com.readmates.hostworkspace.application.model.HostPersonInvalidCursorException
import com.readmates.shared.paging.HostListCursorSigningProperties
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Instant
import java.time.LocalDateTime
import java.util.Base64
import java.util.UUID

@Component
class HostPersonCursorCodec(
    private val properties: HostListCursorSigningProperties,
    private val clock: Clock = Clock.systemUTC(),
    private val objectMapper: ObjectMapper = ObjectMapper(),
) {
    fun begin(): HostPersonCursorAnchor {
        val now = clock.instant()
        return HostPersonCursorAnchor(now, now.plus(properties.ttl), null)
    }

    fun encode(
        clubId: UUID,
        hostMembershipId: UUID,
        targetMembershipId: UUID,
        anchor: HostPersonCursorAnchor,
        last: HostPersonAttendanceTuple,
        keyVersion: Int = properties.currentKeyVersion,
    ): String {
        val key = key(keyVersion) ?: invalid()
        val payload = canonical(clubId, hostMembershipId, targetMembershipId, anchor, last, keyVersion)
        val payloadPart = encoder.encodeToString(payload.toByteArray(StandardCharsets.UTF_8))
        val mac = RequestIdentityHmac.hmac(key, payload.toByteArray(StandardCharsets.UTF_8), PURPOSE)
        return "$keyVersion.$payloadPart.${encoder.encodeToString(mac)}"
    }

    @Suppress("CyclomaticComplexMethod", "ThrowsCount")
    fun decode(
        raw: String,
        clubId: UUID,
        hostMembershipId: UUID,
        targetMembershipId: UUID,
    ): HostPersonCursorAnchor {
        val parts = raw.split('.')
        if (parts.size != CURSOR_PART_COUNT) invalid()
        val envelopeVersion = parts[0].toIntOrNull() ?: invalid()
        val payloadBytes = decodeCanonical(parts[1])
        val providedMac = decodeCanonical(parts[2])
        val key = key(envelopeVersion) ?: invalid()
        val expectedMac = RequestIdentityHmac.hmac(key, payloadBytes, PURPOSE)
        if (!RequestIdentityHmac.equal(providedMac, expectedMac)) invalid()
        val payload = String(payloadBytes, StandardCharsets.UTF_8)
        val root = runCatching { objectMapper.readTree(payload) }.getOrElse { invalid() }
        if (root.propertyNames().toSet() != ROOT_KEYS) invalid()
        val lastNode = root.get("last") ?: invalid()
        if (lastNode.propertyNames().toSet() != LAST_KEYS) invalid()
        val claimsClub = uuid(root.get("clubId")?.asString())
        val claimsHost = uuid(root.get("hostMembershipId")?.asString())
        val claimsTarget = uuid(root.get("targetMembershipId")?.asString())
        val keyVersion = root.get("keyVersion")?.asInt() ?: invalid()
        if (root.get("purpose")?.asString() != PURPOSE_CLAIM ||
            root.get("version")?.asInt() != VERSION
        ) {
            invalid()
        }
        if (keyVersion != envelopeVersion ||
            claimsClub != clubId ||
            claimsHost != hostMembershipId ||
            claimsTarget != targetMembershipId
        ) {
            invalid()
        }
        val evaluatedAt = instant(root.get("evaluatedAt")?.asString())
        val expiry = instant(root.get("expiry")?.asString())
        if (!clock.instant().isBefore(expiry)) invalid()
        val last =
            HostPersonAttendanceTuple(
                scheduledAt = localDateTime(lastNode.get("scheduledAt")?.asString()),
                sessionNumber = lastNode.get("sessionNumber")?.asInt() ?: invalid(),
                sessionId = uuid(lastNode.get("sessionId")?.asString()),
            )
        val anchor = HostPersonCursorAnchor(evaluatedAt, expiry, last)
        if (canonical(clubId, hostMembershipId, targetMembershipId, anchor, last, keyVersion) != payload) {
            invalid()
        }
        return anchor
    }

    private fun canonical(
        clubId: UUID,
        hostMembershipId: UUID,
        targetMembershipId: UUID,
        anchor: HostPersonCursorAnchor,
        last: HostPersonAttendanceTuple,
        keyVersion: Int,
    ): String =
        "{\"clubId\":\"$clubId\",\"evaluatedAt\":\"${anchor.evaluatedAt}\",\"expiry\":\"${anchor.expiry}\"," +
            "\"hostMembershipId\":\"$hostMembershipId\",\"keyVersion\":$keyVersion," +
            "\"last\":{\"scheduledAt\":\"${last.scheduledAt}\"," +
            "\"sessionId\":\"${last.sessionId}\",\"sessionNumber\":${last.sessionNumber}}," +
            "\"purpose\":\"$PURPOSE_CLAIM\",\"targetMembershipId\":\"$targetMembershipId\",\"version\":$VERSION}"

    private fun key(version: Int): ByteArray? =
        when (version) {
            properties.currentKeyVersion -> properties.currentKey.toByteArray(StandardCharsets.UTF_8)
            properties.previousKeyVersion ->
                properties.previousKey
                    .takeIf(String::isNotBlank)
                    ?.toByteArray(StandardCharsets.UTF_8)
            else -> null
        }

    private fun decodeCanonical(value: String): ByteArray =
        try {
            decoder.decode(value).also { bytes -> if (encoder.encodeToString(bytes) != value) invalid() }
        } catch (_: IllegalArgumentException) {
            invalid()
        }

    private fun uuid(value: String?): UUID = runCatching { UUID.fromString(value) }.getOrElse { invalid() }

    private fun instant(value: String?): Instant = runCatching { Instant.parse(value) }.getOrElse { invalid() }

    @Suppress("MaxLineLength")
    private fun localDateTime(value: String?): LocalDateTime = runCatching { LocalDateTime.parse(value) }.getOrElse { invalid() }

    private fun invalid(): Nothing = throw HostPersonInvalidCursorException()

    private companion object {
        const val PURPOSE = "readmates:host-person-attendance-cursor:v1"
        const val PURPOSE_CLAIM = "host-person-attendance"
        const val VERSION = 1
        const val CURSOR_PART_COUNT = 3
        val ROOT_KEYS =
            setOf(
                "clubId",
                "evaluatedAt",
                "expiry",
                "hostMembershipId",
                "keyVersion",
                "last",
                "purpose",
                "targetMembershipId",
                "version",
            )
        val LAST_KEYS = setOf("scheduledAt", "sessionId", "sessionNumber")
        val encoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
        val decoder: Base64.Decoder = Base64.getUrlDecoder()
    }
}
