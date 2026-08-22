package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.ClubLifecycleState
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminDomainStatus
import com.readmates.club.application.model.PublicVisibility
import com.readmates.shared.adminmutation.application.model.DigestKeyUnavailableException
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Component
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID

const val ADMIN_CLUB_REGISTRY_CURSOR_PURPOSE = "readmates:admin-club-cursor:v1"

@Component
class PlatformAdminClubRegistryCursorSigner(
    private val properties: AdminCommandIdentityProperties,
    private val clock: Clock,
) {
    fun issue(
        filter: PlatformAdminClubListCursorFilter,
        lastNormalizedName: String,
        lastClubId: UUID,
    ): String {
        val now = clock.instant()
        return encode(
            PlatformAdminClubListCursorClaims(
                schemaVersion = SCHEMA_VERSION,
                filter = filter,
                lastNormalizedName = lastNormalizedName,
                lastClubId = lastClubId,
                issuedAt = now,
                expiresAt = now.plus(CURSOR_TTL),
                keyVersion = properties.currentKeyVersion,
            ),
        )
    }

    fun encode(claims: PlatformAdminClubListCursorClaims): String {
        val key =
            properties.keyBytes(claims.keyVersion)
                ?: throw DigestKeyUnavailableException()
        val payload = encodePayload(claims)
        val mac =
            RequestIdentityHmac.hmac(
                key,
                payload,
                ADMIN_CLUB_REGISTRY_CURSOR_PURPOSE,
            )
        return "${claims.keyVersion}.${encoder.encodeToString(payload)}.${encoder.encodeToString(mac)}"
    }

    fun verify(
        rawCursor: String,
        expected: PlatformAdminClubListCursorFilter,
    ): PlatformAdminClubListCursorClaims {
        val claims = decode(rawCursor)
        val now = clock.instant()
        val expired = now.isAfter(claims.expiresAt) || claims.issuedAt.isAfter(claims.expiresAt)
        if (claims.schemaVersion != SCHEMA_VERSION || expired || claims.filter != expected) {
            throw invalidCursor()
        }
        return claims
    }

    fun decode(rawCursor: String): PlatformAdminClubListCursorClaims =
        runCatching { decodeChecked(rawCursor) }.getOrElse { throw invalidCursor() }

    private fun decodeChecked(rawCursor: String): PlatformAdminClubListCursorClaims {
        val parts = rawCursor.split('.', limit = ENVELOPE_PARTS)
        require(parts.size == ENVELOPE_PARTS)
        val keyVersion = requireNotNull(parts[0].toIntOrNull())
        val payload = decoder.decode(parts[1])
        val mac = decoder.decode(parts[2])
        val key = requireNotNull(properties.keyBytes(keyVersion))
        val expectedMac =
            RequestIdentityHmac.hmac(
                key,
                payload,
                ADMIN_CLUB_REGISTRY_CURSOR_PURPOSE,
            )
        require(RequestIdentityHmac.equal(expectedMac, mac))
        val claims = parsePayload(payload)
        require(claims.keyVersion == keyVersion)
        return claims
    }

    private fun encodePayload(claims: PlatformAdminClubListCursorClaims): ByteArray {
        val writer = CanonicalWriter()
        writer.writeRaw(MAGIC)
        writer.writeInt(claims.schemaVersion)
        writer.writeInt(claims.keyVersion)
        writer.writeOptionalString(claims.filter.search)
        writer.writeOptionalString(claims.filter.lifecycle?.name)
        writer.writeOptionalString(claims.filter.visibility?.name)
        writer.writeOptionalString(claims.filter.domainStatus?.name)
        writer.writeOptionalString(claims.filter.onboardingState?.name)
        writer.writeString(claims.lastNormalizedName)
        writer.writeString(claims.lastClubId.toString())
        writer.writeLong(claims.issuedAt.toEpochMilli())
        writer.writeLong(claims.expiresAt.toEpochMilli())
        return writer.toByteArray()
    }

    private fun parsePayload(payload: ByteArray): PlatformAdminClubListCursorClaims =
        runCatching {
            val reader = CanonicalReader(payload)
            require(reader.readRaw(MAGIC.size).contentEquals(MAGIC))
            val schemaVersion = reader.readInt()
            val keyVersion = reader.readInt()
            val search = reader.readOptionalString()
            val lifecycle = reader.readOptionalString()?.let(ClubLifecycleState::valueOf)
            val visibility = reader.readOptionalString()?.let(PublicVisibility::valueOf)
            val domainStatus = reader.readOptionalString()?.let(PlatformAdminDomainStatus::valueOf)
            val onboardingState = reader.readOptionalString()?.let(FirstHostOnboardingState::valueOf)
            val lastNormalizedName = reader.readString()
            val lastClubId = UUID.fromString(reader.readString())
            val issuedAt = Instant.ofEpochMilli(reader.readLong())
            val expiresAt = Instant.ofEpochMilli(reader.readLong())
            require(reader.exhausted())
            PlatformAdminClubListCursorClaims(
                schemaVersion = schemaVersion,
                filter =
                    PlatformAdminClubListCursorFilter(
                        search = search,
                        lifecycle = lifecycle,
                        visibility = visibility,
                        domainStatus = domainStatus,
                        onboardingState = onboardingState,
                    ),
                lastNormalizedName = lastNormalizedName,
                lastClubId = lastClubId,
                issuedAt = issuedAt,
                expiresAt = expiresAt,
                keyVersion = keyVersion,
            )
        }.getOrElse { throw invalidCursor() }

    private fun invalidCursor(): PlatformAdminException =
        PlatformAdminException(PlatformAdminError.INVALID_CURSOR, "Invalid club registry cursor")

    private class CanonicalWriter {
        private val buffer = ByteArrayOutputStream()

        fun writeString(value: String) {
            val bytes = value.toByteArray(StandardCharsets.UTF_8)
            writeInt(bytes.size)
            writeRaw(bytes)
        }

        fun writeOptionalString(value: String?) {
            if (value == null) {
                writeInt(NULL_STRING)
            } else {
                writeString(value)
            }
        }

        fun writeInt(value: Int) {
            writeRaw(
                ByteBuffer
                    .allocate(Int.SIZE_BYTES)
                    .order(ByteOrder.BIG_ENDIAN)
                    .putInt(value)
                    .array(),
            )
        }

        fun writeLong(value: Long) {
            writeRaw(
                ByteBuffer
                    .allocate(Long.SIZE_BYTES)
                    .order(ByteOrder.BIG_ENDIAN)
                    .putLong(value)
                    .array(),
            )
        }

        fun writeRaw(bytes: ByteArray) {
            buffer.write(bytes)
        }

        fun toByteArray(): ByteArray = buffer.toByteArray()
    }

    private class CanonicalReader(
        private val payload: ByteArray,
    ) {
        private var offset = 0

        fun readRaw(size: Int): ByteArray {
            requireRemaining(size)
            val bytes = payload.copyOfRange(offset, offset + size)
            offset += size
            return bytes
        }

        fun readInt(): Int {
            val bytes = readRaw(Int.SIZE_BYTES)
            return ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN).int
        }

        fun readLong(): Long {
            val bytes = readRaw(Long.SIZE_BYTES)
            return ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN).long
        }

        fun readString(): String {
            val size = readInt()
            if (size < 0 || size > MAX_STRING_BYTES) {
                throw IllegalArgumentException("invalid string length")
            }
            return String(readRaw(size), StandardCharsets.UTF_8)
        }

        fun readOptionalString(): String? {
            val size = readInt()
            if (size == NULL_STRING) {
                return null
            }
            if (size < 0 || size > MAX_STRING_BYTES) {
                throw IllegalArgumentException("invalid string length")
            }
            return String(readRaw(size), StandardCharsets.UTF_8)
        }

        fun exhausted(): Boolean = offset == payload.size

        private fun requireRemaining(size: Int) {
            if (size < 0 || offset + size > payload.size) {
                throw IllegalArgumentException("cursor payload truncated")
            }
        }
    }

    private companion object {
        private val MAGIC = "RCL1".toByteArray(StandardCharsets.UTF_8)
        private val encoder = Base64.getUrlEncoder().withoutPadding()
        private val decoder = Base64.getUrlDecoder()
        private val CURSOR_TTL = Duration.ofHours(1)
        private const val SCHEMA_VERSION = 1
        private const val ENVELOPE_PARTS = 3
        private const val NULL_STRING = -1
        private const val MAX_STRING_BYTES = 512
    }
}

data class PlatformAdminClubListCursorFilter(
    val search: String?,
    val lifecycle: ClubLifecycleState?,
    val visibility: PublicVisibility?,
    val domainStatus: PlatformAdminDomainStatus?,
    val onboardingState: FirstHostOnboardingState?,
)

data class PlatformAdminClubListCursorClaims(
    val schemaVersion: Int,
    val filter: PlatformAdminClubListCursorFilter,
    val lastNormalizedName: String,
    val lastClubId: UUID,
    val issuedAt: Instant,
    val expiresAt: Instant,
    val keyVersion: Int,
)
