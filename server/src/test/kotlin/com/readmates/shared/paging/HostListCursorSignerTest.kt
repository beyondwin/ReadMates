package com.readmates.shared.paging

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.slf4j.LoggerFactory
import java.nio.charset.StandardCharsets
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class HostListCursorSignerTest {
    private val signer =
        HostListCursorSigner(
            HostListCursorSigningProperties(
                currentKey = CURRENT_KEY,
                currentKeyVersion = CURRENT_VERSION,
                previousKey = PREVIOUS_KEY,
                previousKeyVersion = PREVIOUS_VERSION,
                allowEmptySecret = true,
            ),
        )
    private lateinit var logAppender: ListAppender<ILoggingEvent>
    private lateinit var logger: Logger

    @BeforeEach
    fun captureLogs() {
        logger = LoggerFactory.getLogger(HostListCursorSigner::class.java) as Logger
        logAppender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(logAppender)
        logger.level = Level.DEBUG
    }

    @AfterEach
    fun detachLogs() {
        logger.detachAppender(logAppender)
        logAppender.stop()
    }

    @Test
    fun `signs and verifies canonical payload with current key`() {
        val encoded = signer.sign(PAYLOAD, CURRENT_VERSION)
        val verified = signer.verify(encoded)
        assertThat(verified.payload).isEqualTo(PAYLOAD)
        assertThat(verified.keyVersion).isEqualTo(CURRENT_VERSION)
        assertThat(verified.usedPreviousKey).isFalse()
        assertThat(encoded).startsWith("$CURRENT_VERSION.")
        assertThat(encoded.split('.')).hasSize(3)
    }

    @Test
    fun `accepts a valid previous-key cursor during rollout`() {
        val encoded = signWith(PREVIOUS_KEY, PREVIOUS_VERSION, PAYLOAD)
        val verified = signer.verify(encoded)
        assertThat(verified.payload).isEqualTo(PAYLOAD)
        assertThat(verified.keyVersion).isEqualTo(PREVIOUS_VERSION)
        assertThat(verified.usedPreviousKey).isTrue()
    }

    @Test
    fun `rejects every single payload field mutation and keeps logs free of payload or mac`() {
        val encoded = signer.sign(PAYLOAD, CURRENT_VERSION)
        payloadFields().forEach { (field, mutated) ->
            val rejected =
                assertThrows<InvalidHostListCursorException> {
                    signer.verify(reencode(encoded, mutated))
                }
            assertThat(rejected.message).isEqualTo("Invalid host list cursor")
            assertThat(field).isNotBlank()
        }
        assertNoSensitiveLogs()
    }

    @Test
    fun `rejects mac mutation unknown retired versions and wrong key without logging secrets`() {
        val encoded = signer.sign(PAYLOAD, CURRENT_VERSION)
        val parts = encoded.split('.')
        val mutatedMac = parts[2].toCharArray().also { it[0] = if (it[0] == 'a') 'b' else 'a' }.concatToString()
        val retired = signWith("retired-host-list-cursor-key", 9, PAYLOAD)
        val unknownVersion = "99.${parts[1]}.${parts[2]}"
        val wrongKey = signWith("other-host-list-cursor-key", CURRENT_VERSION, PAYLOAD)

        listOf(
            "${parts[0]}.${parts[1]}.$mutatedMac",
            retired,
            unknownVersion,
            wrongKey,
            "not-a-cursor",
            "",
        ).forEach { raw ->
            assertThrows<InvalidHostListCursorException> { signer.verify(raw) }
        }
        assertNoSensitiveLogs()
    }

    @Test
    fun `mac uses purpose separated utf8 payload bytes`() {
        val encoded = signer.sign(PAYLOAD, CURRENT_VERSION)
        val payloadPart = encoded.split('.')[1]
        val payloadBytes = Base64.getUrlDecoder().decode(payloadPart)
        assertThat(String(payloadBytes, StandardCharsets.UTF_8)).isEqualTo(PAYLOAD)
        val expectedMac = hmac(CURRENT_KEY, PURPOSE_PREFIX + PAYLOAD)
        assertThat(encoded.split('.')[2]).isEqualTo(expectedMac)
    }

    private fun payloadFields(): List<Pair<String, String>> =
        listOf(
            "orderingVersion" to PAYLOAD.replace("host-list-v1", "host-list-v0"),
            "clubId" to PAYLOAD.replace("00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"),
            "mode" to PAYLOAD.replace("\"meeting\"", "\"record\""),
            "states" to PAYLOAD.replace("DRAFT", "OPEN"),
            "fingerprint" to PAYLOAD.replace("abc123", "abc124"),
            "epoch" to PAYLOAD.replace("\"epoch\":3", "\"epoch\":4"),
            "evaluatedAt" to PAYLOAD.replace("2026-08-22T00:00:00Z", "2026-08-22T00:00:01Z"),
            "expiry" to PAYLOAD.replace("2026-08-23T00:00:00Z", "2026-08-23T00:00:01Z"),
            "keyVersion" to PAYLOAD.replace("\"keyVersion\":1", "\"keyVersion\":2"),
            "attentionRank" to PAYLOAD.replace("\"attentionRank\":0", "\"attentionRank\":1"),
            "meetingDate" to PAYLOAD.replace("2026-08-01", "2026-08-02"),
            "stateRank" to PAYLOAD.replace("\"stateRank\":0", "\"stateRank\":1"),
            "sessionNumber" to PAYLOAD.replace("\"sessionNumber\":8", "\"sessionNumber\":7"),
            "sessionId" to
                PAYLOAD.replace(
                    "00000000-0000-4000-8000-0000000000aa",
                    "00000000-0000-4000-8000-0000000000ab",
                ),
        )

    private fun reencode(
        original: String,
        mutatedPayload: String,
    ): String {
        val version = original.substringBefore('.')
        val mac = original.substringAfterLast('.')
        val payload =
            Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString(mutatedPayload.toByteArray(StandardCharsets.UTF_8))
        return "$version.$payload.$mac"
    }

    private fun signWith(
        key: String,
        version: Int,
        payload: String,
    ): String {
        val payloadPart =
            Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.toByteArray(StandardCharsets.UTF_8))
        return "$version.$payloadPart.${hmac(key, PURPOSE_PREFIX + payload)}"
    }

    private fun hmac(
        key: String,
        message: String,
    ): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "HmacSHA256"))
        return Base64
            .getUrlEncoder()
            .withoutPadding()
            .encodeToString(mac.doFinal(message.toByteArray(StandardCharsets.UTF_8)))
    }

    private fun assertNoSensitiveLogs() {
        val messages = logAppender.list.joinToString { it.formattedMessage + it.throwableProxy?.message.orEmpty() }
        assertThat(messages).doesNotContain(PAYLOAD, CURRENT_KEY, PREVIOUS_KEY)
        encodedFragments().forEach { fragment -> assertThat(messages).doesNotContain(fragment) }
    }

    private fun encodedFragments(): List<String> {
        val encoded = runCatching { signer.sign(PAYLOAD, CURRENT_VERSION) }.getOrNull() ?: return emptyList()
        return encoded.split('.').filter { it.length > 8 }
    }

    private companion object {
        const val CURRENT_KEY = "test-host-list-cursor-current-key"
        const val PREVIOUS_KEY = "test-host-list-cursor-previous-key"
        const val CURRENT_VERSION = 1
        const val PREVIOUS_VERSION = 0
        const val PURPOSE_PREFIX = "readmates:host-list:v1\u0000"
        const val PAYLOAD =
            """{"clubId":"00000000-0000-4000-8000-000000000001","epoch":3,"evaluatedAt":"2026-08-22T00:00:00Z",""" +
                """"expiry":"2026-08-23T00:00:00Z","fingerprint":"abc123","keyVersion":1,""" +
                """"last":{"attentionRank":0,"meetingDate":"2026-08-01",""" +
                """"sessionId":"00000000-0000-4000-8000-0000000000aa",""" +
                """"sessionNumber":8,"stateRank":0},"mode":"meeting","orderingVersion":"host-list-v1",""" +
                """"states":["DRAFT","OPEN"]}"""
    }
}
