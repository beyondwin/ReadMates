package com.readmates.admin.audit.application.service

import com.readmates.admin.audit.application.AdminAuditError
import com.readmates.admin.audit.application.AdminAuditException
import com.readmates.admin.audit.application.model.AdminAuditActionCategory
import com.readmates.admin.audit.application.model.AdminAuditActorRole
import com.readmates.admin.audit.application.model.AdminAuditCursorDraft
import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditOutcome
import com.readmates.admin.audit.application.model.AdminAuditSourceSlice
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.model.AdminAuditTuple
import com.readmates.admin.audit.config.AdminAuditCursorProperties
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID

class AdminAuditCursorSignerTest {
    @Test
    fun `issues with current key and verifies current and previous key`() {
        val signer = signer()
        val fingerprint = signer.fingerprint(filter(), null)

        val current = signer.issue(draft(fingerprint))
        val previousFingerprint = signer.fingerprint(filter(), null, keyVersion = 6)
        val previous = signer.encode(draft(previousFingerprint), keyVersion = 6, issuedAt = NOW.minusSeconds(30))

        assertThat(signer.verify(current, filter(), null).keyVersion).isEqualTo(7)
        assertThat(signer.verify(previous, filter(), null).keyVersion).isEqualTo(6)
    }

    @Test
    fun `rejects mutation expiry unknown key and filter mismatch`() {
        val signer = signer()
        val fingerprint = signer.fingerprint(filter(), "cafe\u0301@example.com")
        val token = signer.issue(draft(fingerprint))
        val parts = token.split('.').toMutableList()
        val payload = Base64.getUrlDecoder().decode(parts[1]).also { it[it.lastIndex] = (it.last() xor 1) }
        parts[1] = Base64.getUrlEncoder().withoutPadding().encodeToString(payload)

        assertInvalid { signer.verify(parts.joinToString("."), fingerprint) }
        assertInvalid { signer.verify(token, ByteArray(32) { 1 }) }
        assertInvalid { signer().verify("99.${parts[1]}.${parts[2]}", fingerprint) }
        val expired = signer.encode(draft(fingerprint), issuedAt = NOW.minus(Duration.ofHours(2)))
        assertInvalid { signer.verify(expired, fingerprint) }
    }

    @Test
    fun `normalizes NFC filters and never embeds sensitive target in cursor payload`() {
        val signer = signer()
        val decomposed = "cafe\u0301@example.com"
        val composed = "caf\u00e9@example.com"
        val left = signer.fingerprint(filter(), decomposed)
        val right = signer.fingerprint(filter(), composed)
        assertThat(left).containsExactly(*right)

        val token = signer.issue(draft(left))
        val payload = String(Base64.getUrlDecoder().decode(token.split('.')[1]), StandardCharsets.UTF_8)
        assertThat(payload).doesNotContain(decomposed, composed, MEMBER_ID.toString())
    }

    private fun signer(): AdminAuditCursorSigner =
        AdminAuditCursorSigner(
            identityProperties =
                AdminCommandIdentityProperties(
                    currentKey = "current-cursor-secret",
                    currentKeyVersion = 7,
                    previousKey = "previous-cursor-secret",
                    previousKeyVersion = 6,
                ),
            cursorProperties = AdminAuditCursorProperties(cursorTtl = Duration.ofHours(1)),
            clock = Clock.fixed(NOW.toInstant(), ZoneOffset.UTC),
        )

    private fun draft(fingerprint: ByteArray): AdminAuditCursorDraft =
        AdminAuditCursorDraft(
            snapshotTo = NOW,
            from = NOW.minusDays(7),
            filterFingerprint = fingerprint,
            excludedSources = setOf(AdminAuditSourceType.CLUB),
            after = AdminAuditTuple(NOW.minusSeconds(1), AdminAuditSourceType.PLATFORM.rank, EVENT_ID),
        )

    private fun filter(): AdminAuditFilter =
        AdminAuditFilter(
            from = NOW.minusDays(7),
            to = NOW,
            range = null,
            clubId = CLUB_ID,
            actorRole = AdminAuditActorRole.OWNER,
            sourceSlice = AdminAuditSourceSlice.S5,
            actionCategory = AdminAuditActionCategory.NOTIFICATION,
            outcome = AdminAuditOutcome.SUCCESS,
        )

    private fun assertInvalid(block: () -> Unit) {
        assertThatThrownBy(block)
            .isInstanceOfSatisfying(AdminAuditException::class.java) {
                assertThat(it.error).isEqualTo(AdminAuditError.INVALID_CURSOR)
            }
    }
}

private infix fun Byte.xor(other: Int): Byte = (toInt() xor other).toByte()

private val NOW: OffsetDateTime = OffsetDateTime.parse("2026-08-25T10:00:00Z")
private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val MEMBER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
private const val EVENT_ID = "00000000-0000-0000-0000-000000000003"
