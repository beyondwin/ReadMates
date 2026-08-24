package com.readmates.admin.audit.application.service

import com.readmates.admin.audit.application.AdminAuditError
import com.readmates.admin.audit.application.AdminAuditException
import com.readmates.admin.audit.application.model.AdminAuditCursor
import com.readmates.admin.audit.application.model.AdminAuditCursorDraft
import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.config.AdminAuditCursorProperties
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Component
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.Locale
import java.util.UUID

const val ADMIN_AUDIT_CURSOR_PURPOSE = "readmates:platform-admin-audit-cursor:v1"

@Component
class AdminAuditCursorSigner(
    private val identityProperties: AdminCommandIdentityProperties,
    private val cursorProperties: AdminAuditCursorProperties,
    private val clock: Clock,
) {
    fun fingerprint(
        filter: AdminAuditFilter,
        sensitiveTarget: String?,
    ): ByteArray = fingerprint(filter, sensitiveTarget, identityProperties.currentKeyVersion)

    internal fun fingerprint(
        filter: AdminAuditFilter,
        sensitiveTarget: String?,
        keyVersion: Int,
    ): ByteArray {
        val key = identityProperties.keyBytes(keyVersion) ?: throw invalidCursor()
        return hmac(key, canonicalFilterBytes(filter, sensitiveTarget), FILTER_PURPOSE)
    }

    private fun canonicalFilterBytes(
        filter: AdminAuditFilter,
        sensitiveTarget: String?,
    ): ByteArray {
        val writer = CanonicalWriter()
        writer.writeString(filter.from.normalized())
        writer.writeString(filter.to.normalized())
        writer.writeNullable(filter.range?.name)
        writer.writeNullable(filter.clubId?.toString())
        writer.writeNullable(filter.actorRole?.name)
        writer.writeNullable(filter.sourceSlice?.name)
        writer.writeNullable(filter.actionCategory?.name)
        writer.writeNullable(filter.outcome?.name)
        writer.writeNullable(sensitiveTarget?.normalizeSensitive())
        return writer.bytes()
    }

    fun issue(draft: AdminAuditCursorDraft): String =
        encode(draft, identityProperties.currentKeyVersion, OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC))

    internal fun encode(
        draft: AdminAuditCursorDraft,
        keyVersion: Int = identityProperties.currentKeyVersion,
        issuedAt: OffsetDateTime = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC),
    ): String {
        val claims =
            AdminAuditCursor(
                schemaVersion = SCHEMA_VERSION,
                snapshotTo = draft.snapshotTo.utc(),
                from = draft.from.utc(),
                filterFingerprint = draft.filterFingerprint.copyOf(),
                excludedSources = draft.excludedSources,
                occurredAt = draft.after.occurredAt.utc(),
                sourceRank = draft.after.sourceRank,
                immutableSourceId = draft.after.immutableSourceId,
                keyVersion = keyVersion,
                issuedAt = issuedAt.utc(),
                expiresAt = issuedAt.plus(cursorProperties.cursorTtl).utc(),
            )
        val payload = encodePayload(claims)
        val key = identityProperties.keyBytes(keyVersion) ?: throw invalidCursor()
        val mac = hmac(key, payload, ADMIN_AUDIT_CURSOR_PURPOSE)
        return "$keyVersion.${encoder.encodeToString(payload)}.${encoder.encodeToString(mac)}"
    }

    fun verify(
        rawCursor: String,
        filter: AdminAuditFilter,
        sensitiveTarget: String?,
    ): AdminAuditCursor =
        runCatching { verifyChecked(rawCursor, canonicalFilterBytes(filter, sensitiveTarget), null) }
            .getOrElse { throw invalidCursor() }

    internal fun verify(
        rawCursor: String,
        expectedFilterFingerprint: ByteArray,
    ): AdminAuditCursor =
        runCatching { verifyChecked(rawCursor, null, expectedFilterFingerprint) }
            .getOrElse { throw invalidCursor() }

    private fun verifyChecked(
        rawCursor: String,
        canonicalFilterBytes: ByteArray?,
        pinnedExpectedFingerprint: ByteArray?,
    ): AdminAuditCursor {
        require(canonicalFilterBytes != null || pinnedExpectedFingerprint?.size == MAC_BYTES)
        val parts = rawCursor.split('.', limit = ENVELOPE_PARTS)
        require(parts.size == ENVELOPE_PARTS)
        val envelopeKeyVersion = requireNotNull(parts[0].toIntOrNull())
        require(
            envelopeKeyVersion == identityProperties.currentKeyVersion ||
                envelopeKeyVersion == identityProperties.previousKeyVersion,
        )
        val key = requireNotNull(identityProperties.keyBytes(envelopeKeyVersion))
        val payload = decoder.decode(parts[1])
        val providedMac = decoder.decode(parts[2])
        require(providedMac.size == MAC_BYTES)
        val expectedMac = hmac(key, payload, ADMIN_AUDIT_CURSOR_PURPOSE)
        require(RequestIdentityHmac.equal(expectedMac, providedMac))
        val claims = parsePayload(payload)
        val expectedFilterFingerprint =
            canonicalFilterBytes?.let { hmac(key, it, FILTER_PURPOSE) } ?: requireNotNull(pinnedExpectedFingerprint)
        val now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC)
        require(claims.schemaVersion == SCHEMA_VERSION)
        require(claims.keyVersion == envelopeKeyVersion)
        require(claims.filterFingerprint.size == MAC_BYTES)
        require(RequestIdentityHmac.equal(claims.filterFingerprint, expectedFilterFingerprint))
        require(claims.from.isBefore(claims.snapshotTo))
        require(!claims.issuedAt.isAfter(claims.expiresAt))
        require(now.isBefore(claims.expiresAt))
        require(!claims.occurredAt.isAfter(claims.snapshotTo))
        require(AdminAuditSourceType.entries.any { it.rank == claims.sourceRank })
        return claims
    }

    private fun encodePayload(claims: AdminAuditCursor): ByteArray {
        val writer = CanonicalWriter()
        writer.writeBytes(MAGIC)
        writer.writeInt(claims.schemaVersion)
        writer.writeInt(claims.keyVersion)
        writer.writeInstant(claims.issuedAt)
        writer.writeInstant(claims.expiresAt)
        writer.writeInstant(claims.snapshotTo)
        writer.writeInstant(claims.from)
        writer.writeBytes(claims.filterFingerprint)
        writer.writeStrings(claims.excludedSources.sortedBy { it.rank }.map { it.name })
        writer.writeInstant(claims.occurredAt)
        writer.writeInt(claims.sourceRank)
        writer.writeString(claims.immutableSourceId)
        return writer.bytes()
    }

    private fun parsePayload(payload: ByteArray): AdminAuditCursor {
        val reader = CanonicalReader(payload)
        require(reader.readBytes().contentEquals(MAGIC))
        val schemaVersion = reader.readInt()
        val keyVersion = reader.readInt()
        val issuedAt = reader.readInstant()
        val expiresAt = reader.readInstant()
        val snapshotTo = reader.readInstant()
        val from = reader.readInstant()
        val fingerprint = reader.readBytes()
        val excludedSourceNames = reader.readStrings()
        val excludedSources = excludedSourceNames.map(AdminAuditSourceType::valueOf).toSet()
        require(excludedSources.size == excludedSourceNames.size)
        require(excludedSources.size <= AdminAuditSourceType.entries.size)
        val occurredAt = reader.readInstant()
        val sourceRank = reader.readInt()
        val immutableSourceId = reader.readString()
        require(immutableSourceId.isNotBlank() && immutableSourceId.length <= MAX_SOURCE_ID_LENGTH)
        require(reader.exhausted())
        return AdminAuditCursor(
            schemaVersion,
            snapshotTo,
            from,
            fingerprint,
            excludedSources,
            occurredAt,
            sourceRank,
            immutableSourceId,
            keyVersion,
            issuedAt,
            expiresAt,
        )
    }
}

private class CanonicalWriter {
    private val output = ByteArrayOutputStream()

    fun writeBytes(value: ByteArray) {
        require(value.size <= MAX_FIELD_BYTES)
        output.write(
            ByteBuffer
                .allocate(Int.SIZE_BYTES)
                .order(ByteOrder.BIG_ENDIAN)
                .putInt(value.size)
                .array(),
        )
        output.write(value)
    }

    fun writeString(value: String) = writeBytes(value.toByteArray(StandardCharsets.UTF_8))

    fun writeNullable(value: String?) = writeString(value ?: NULL_VALUE)

    fun writeInt(value: Int) =
        writeBytes(
            ByteBuffer
                .allocate(Int.SIZE_BYTES)
                .order(ByteOrder.BIG_ENDIAN)
                .putInt(value)
                .array(),
        )

    fun writeInstant(value: OffsetDateTime) {
        val instant = value.toInstant()
        writeBytes(
            ByteBuffer
                .allocate(Long.SIZE_BYTES + Int.SIZE_BYTES)
                .order(ByteOrder.BIG_ENDIAN)
                .putLong(instant.epochSecond)
                .putInt(instant.nano)
                .array(),
        )
    }

    fun writeStrings(values: List<String>) {
        writeInt(values.size)
        values.forEach(::writeString)
    }

    fun bytes(): ByteArray = output.toByteArray()
}

private class CanonicalReader(
    payload: ByteArray,
) {
    private val input = ByteArrayInputStream(payload)

    fun readBytes(): ByteArray {
        val lengthBytes = input.readNBytes(Int.SIZE_BYTES)
        require(lengthBytes.size == Int.SIZE_BYTES)
        val length = ByteBuffer.wrap(lengthBytes).order(ByteOrder.BIG_ENDIAN).int
        require(length in 0..MAX_FIELD_BYTES)
        return input.readNBytes(length).also { require(it.size == length) }
    }

    fun readString(): String = readBytes().toString(StandardCharsets.UTF_8)

    fun readInt(): Int {
        val value = readBytes()
        require(value.size == Int.SIZE_BYTES)
        return ByteBuffer.wrap(value).order(ByteOrder.BIG_ENDIAN).int
    }

    fun readInstant(): OffsetDateTime {
        val value = readBytes()
        require(value.size == Long.SIZE_BYTES + Int.SIZE_BYTES)
        val buffer = ByteBuffer.wrap(value).order(ByteOrder.BIG_ENDIAN)
        return OffsetDateTime.ofInstant(Instant.ofEpochSecond(buffer.long, buffer.int.toLong()), ZoneOffset.UTC)
    }

    fun readStrings(): List<String> {
        val count = readInt()
        require(count in 0..AdminAuditSourceType.entries.size)
        return List(count) { readString() }
    }

    fun exhausted(): Boolean = input.available() == 0
}

private fun AdminAuditCursorSigner.invalidCursor(): AdminAuditException =
    AdminAuditException(AdminAuditError.INVALID_CURSOR, "Invalid audit cursor")

private fun hmac(
    key: ByteArray,
    bytes: ByteArray,
    purpose: String,
): ByteArray = RequestIdentityHmac.hmac(key, bytes, purpose)

private fun String.normalizeSensitive(): String =
    Normalizer
        .normalize(trim(), Normalizer.Form.NFC)
        .lowercase(Locale.ROOT)

private fun OffsetDateTime.normalized(): String = utc().toString()

private fun OffsetDateTime.utc(): OffsetDateTime = withOffsetSameInstant(ZoneOffset.UTC)

private val MAGIC = "RMAUDIT1".toByteArray(StandardCharsets.US_ASCII)
private const val SCHEMA_VERSION = 1
private const val ENVELOPE_PARTS = 3
private const val MAC_BYTES = 32
private const val MAX_FIELD_BYTES = 16 * 1024
private const val MAX_SOURCE_ID_LENGTH = 512
private const val NULL_VALUE = "\u0000"
private const val FILTER_PURPOSE = "$ADMIN_AUDIT_CURSOR_PURPOSE:filter"
private val encoder = Base64.getUrlEncoder().withoutPadding()
private val decoder = Base64.getUrlDecoder()
