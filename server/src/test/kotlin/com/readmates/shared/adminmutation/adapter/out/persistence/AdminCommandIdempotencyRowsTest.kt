package com.readmates.shared.adminmutation.adapter.out.persistence

import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class AdminCommandIdempotencyRowsTest {
    @Test
    fun `alias match compares both idempotency key and request hmac`() {
        val digest =
            AdminCommandDigest(
                schemaVersion = "club-create:v1",
                digestKeyVersion = 7,
                idempotencyKeyHmac = ByteArray(32) { 1 },
                requestHmac = ByteArray(32) { 2 },
            )
        val row =
            AdminCommandAliasRow(
                claimId = UUID.randomUUID(),
                digestKeyVersion = digest.digestKeyVersion,
                idempotencyKeyHmac = digest.idempotencyKeyHmac.copyOf(),
                requestHmac = digest.requestHmac.copyOf(),
            )

        assertThat(row.matches(digest)).isTrue()
        assertThat(row.copy(idempotencyKeyHmac = digest.idempotencyKeyHmac.flipped()).matches(digest)).isFalse()
        assertThat(row.copy(requestHmac = digest.requestHmac.flipped()).matches(digest)).isFalse()
        assertThat(
            row
                .copy(
                    idempotencyKeyHmac = digest.idempotencyKeyHmac.flipped(),
                    requestHmac = digest.requestHmac.flipped(),
                ).matches(digest),
        ).isFalse()
    }
}

private fun ByteArray.flipped(): ByteArray =
    copyOf().also { copy ->
        copy[0] = (copy[0].toInt() xor 1).toByte()
    }
