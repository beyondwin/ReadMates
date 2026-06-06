package com.readmates.shared.security

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

class Sha256Test {
    @Test
    fun `hex of empty string matches the known SHA-256 vector`() {
        assertThat(Sha256.hex(""))
            .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    }

    @Test
    fun `hex of a string is byte-identical to the legacy percent-02x idiom`() {
        for (value in listOf("ReadMates", "a", "헥사고날::1.2.3", "user@example.com|FULL|0")) {
            assertThat(Sha256.hex(value)).isEqualTo(legacyHex(value))
        }
    }

    @Test
    fun `hex of bytes is byte-identical to the legacy percent-02x idiom`() {
        val bytes = byteArrayOf(0, 1, 15, 16, -1, -128, 127)
        assertThat(Sha256.hex(bytes))
            .isEqualTo(
                MessageDigest.getInstance("SHA-256").digest(bytes)
                    .joinToString("") { "%02x".format(it) },
            )
    }

    @Test
    fun `hex output is lowercase 64-char hex with no padding or separators`() {
        val out = Sha256.hex("anything")
        assertThat(out).hasSize(64)
        assertThat(out).matches("[0-9a-f]{64}")
    }

    private fun legacyHex(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
