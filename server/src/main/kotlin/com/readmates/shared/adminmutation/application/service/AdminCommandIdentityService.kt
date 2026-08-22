package com.readmates.shared.adminmutation.application.service

import com.readmates.shared.adminmutation.application.model.ADMIN_COMMAND_IDENTITY_PURPOSE
import com.readmates.shared.adminmutation.application.model.ADMIN_COMMAND_SYNTHETIC_TARGET_NEW_CLUB
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.DigestKeyUnavailableException
import com.readmates.shared.adminmutation.application.model.InvalidAdminCommandIdentityException
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.security.RequestIdentityHmac
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.util.UUID

@Service
class AdminCommandIdentityService(
    private val properties: AdminCommandIdentityProperties,
) {
    fun digest(
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
    ): AdminCommandDigest {
        val key = properties.currentKeyBytes() ?: throw DigestKeyUnavailableException()
        return compute(identity, request, key, properties.currentKeyVersion)
    }

    fun matches(
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
        digest: AdminCommandDigest,
    ): Boolean {
        val key = properties.keyBytes(digest.digestKeyVersion) ?: throw DigestKeyUnavailableException()
        val expected = compute(identity, request, key, digest.digestKeyVersion)
        val requestOk = RequestIdentityHmac.equal(expected.requestHmac, digest.requestHmac)
        val idempotencyOk = RequestIdentityHmac.equal(expected.idempotencyKeyHmac, digest.idempotencyKeyHmac)
        val schemaOk = expected.schemaVersion == digest.schemaVersion
        return requestOk and idempotencyOk and schemaOk
    }

    private fun compute(
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
        key: ByteArray,
        digestKeyVersion: Int,
    ): AdminCommandDigest {
        val canonicalIdentity = canonicalizeIdentity(identity)
        val schemaVersion = requireToken(nfc(request.schemaVersion), SCHEMA_VERSION)
        val fields = canonicalizeFields(request.canonicalFields())
        val digest =
            AdminCommandDigest(
                schemaVersion = schemaVersion,
                digestKeyVersion = digestKeyVersion,
                idempotencyKeyHmac =
                    RequestIdentityHmac.hmac(
                        key,
                        encodeIdempotencyKey(canonicalIdentity.idempotencyKey),
                        ADMIN_COMMAND_IDENTITY_PURPOSE,
                    ),
                requestHmac =
                    RequestIdentityHmac.hmac(
                        key,
                        encodeRequest(canonicalIdentity, schemaVersion, fields),
                        ADMIN_COMMAND_IDENTITY_PURPOSE,
                    ),
            )
        log.debug(
            "computed admin command digest schemaVersion={} digestKeyVersion={} " +
                "requestHmacSize={} idempotencyKeyHmacSize={}",
            digest.schemaVersion,
            digest.digestKeyVersion,
            digest.requestHmac.size,
            digest.idempotencyKeyHmac.size,
        )
        return digest
    }

    private fun canonicalizeIdentity(identity: PlatformAdminCommandIdentity): CanonicalIdentity =
        CanonicalIdentity(
            platformAdminUserId = identity.platformAdminUserId,
            commandType = requireToken(nfc(identity.commandType), COMMAND_TYPE),
            targetType = requireToken(nfc(identity.targetType), TARGET_TYPE),
            targetId = canonicalizeTargetId(identity.targetId),
            idempotencyKey = requireToken(nfc(identity.idempotencyKey), IDEMPOTENCY_KEY),
        )

    private fun canonicalizeTargetId(value: String): String {
        val normalized = nfc(value)
        if (normalized == ADMIN_COMMAND_SYNTHETIC_TARGET_NEW_CLUB) {
            return normalized
        }
        val uuid =
            runCatching { UUID.fromString(normalized) }.getOrNull()
                ?: throw InvalidAdminCommandIdentityException()
        if (uuid.toString() != normalized.lowercase()) {
            throw InvalidAdminCommandIdentityException()
        }
        return uuid.toString()
    }

    private fun canonicalizeFields(fields: List<Pair<String, String>>): List<Pair<String, String>> {
        val normalized =
            fields.map { field ->
                val name = nfc(field.first)
                if (name.isEmpty()) {
                    throw InvalidAdminCommandIdentityException()
                }
                name to nfc(field.second)
            }
        if (normalized.map { field -> field.first }.distinct().size != normalized.size) {
            throw InvalidAdminCommandIdentityException()
        }
        return normalized.sortedBy { field -> field.first }
    }

    private fun encodeRequest(
        identity: CanonicalIdentity,
        schemaVersion: String,
        fields: List<Pair<String, String>>,
    ): ByteArray {
        val writer = CanonicalWriter()
        writer.writeRaw(MAGIC)
        writer.writeString(REQUEST_KIND)
        writer.writeString(schemaVersion)
        writer.writeString(identity.platformAdminUserId.toString())
        writer.writeString(identity.commandType)
        writer.writeString(identity.targetType)
        writer.writeString(identity.targetId)
        writer.writeInt(fields.size)
        fields.forEach { field ->
            writer.writeString(field.first)
            writer.writeString(field.second)
        }
        return writer.toByteArray()
    }

    private fun encodeIdempotencyKey(idempotencyKey: String): ByteArray {
        val writer = CanonicalWriter()
        writer.writeRaw(MAGIC)
        writer.writeString(IDEMPOTENCY_KIND)
        writer.writeString(idempotencyKey)
        return writer.toByteArray()
    }

    private fun requireToken(
        value: String,
        pattern: Regex,
    ): String {
        if (!pattern.matches(value)) {
            throw InvalidAdminCommandIdentityException()
        }
        return value
    }

    private fun nfc(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFC)

    private data class CanonicalIdentity(
        val platformAdminUserId: UUID,
        val commandType: String,
        val targetType: String,
        val targetId: String,
        val idempotencyKey: String,
    )

    private class CanonicalWriter {
        private val buffer = ByteArrayOutputStream()

        fun writeString(value: String) {
            val bytes = value.toByteArray(StandardCharsets.UTF_8)
            writeInt(bytes.size)
            writeRaw(bytes)
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

        fun writeRaw(bytes: ByteArray) {
            buffer.write(bytes)
        }

        fun toByteArray(): ByteArray = buffer.toByteArray()
    }

    private companion object {
        private val log = LoggerFactory.getLogger(AdminCommandIdentityService::class.java)
        private val MAGIC = "RAI1".toByteArray(StandardCharsets.UTF_8)
        private const val REQUEST_KIND = "request"
        private const val IDEMPOTENCY_KIND = "idempotency-key"
        private val COMMAND_TYPE = Regex("^[A-Za-z0-9._:-]{1,96}$")
        private val TARGET_TYPE = Regex("^[A-Za-z0-9._:-]{1,64}$")
        private val SCHEMA_VERSION = Regex("^[A-Za-z0-9._:-]{1,64}$")
        private val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._-]{8,128}$")
    }
}
