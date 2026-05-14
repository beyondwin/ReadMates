package com.readmates.shared.security

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.mock.env.MockEnvironment
import ch.qos.logback.classic.Logger as LogbackLogger

class ClientIpHashingPropertiesTest {
    private lateinit var logAppender: ListAppender<ILoggingEvent>
    private lateinit var logger: LogbackLogger

    @BeforeEach
    fun setUpLogCapture() {
        logger = LoggerFactory.getLogger(ClientIpHashingProperties::class.java) as LogbackLogger
        logAppender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(logAppender)
    }

    @AfterEach
    fun tearDownLogCapture() {
        logger.detachAppender(logAppender)
        logAppender.stop()
    }

    @Test
    fun `production profile with blank secret throws with env var hint`() {
        val env =
            MockEnvironment().apply {
                setActiveProfiles("production")
            }
        val props = ClientIpHashingProperties(baseSecret = "", allowEmptySecret = false)

        val ex =
            assertThrows(IllegalStateException::class.java) {
                props.validate(env)
            }
        assertTrue(
            ex.message?.contains("READMATES_IP_HASH_BASE_SECRET") == true,
            "Expected message to contain READMATES_IP_HASH_BASE_SECRET but was: ${ex.message}",
        )
    }

    @Test
    fun `unset profile (production-like) with blank secret throws`() {
        val env = MockEnvironment() // no active profiles set → production-like
        val props = ClientIpHashingProperties(baseSecret = "", allowEmptySecret = false)

        val ex =
            assertThrows(IllegalStateException::class.java) {
                props.validate(env)
            }
        assertTrue(
            ex.message?.contains("READMATES_IP_HASH_BASE_SECRET") == true,
            "Expected message to contain READMATES_IP_HASH_BASE_SECRET but was: ${ex.message}",
        )
    }

    @Test
    fun `production profile with allowEmptySecret=true and blank secret still throws`() {
        val env =
            MockEnvironment().apply {
                setActiveProfiles("production")
            }
        val props = ClientIpHashingProperties(baseSecret = "", allowEmptySecret = true)

        val ex =
            assertThrows(IllegalStateException::class.java) {
                props.validate(env)
            }
        assertTrue(
            ex.message?.contains("READMATES_IP_HASH_BASE_SECRET") == true,
            "Expected message to contain READMATES_IP_HASH_BASE_SECRET but was: ${ex.message}",
        )
    }

    @Test
    fun `non-production profile with blank secret and allowEmptySecret=false throws`() {
        val env =
            MockEnvironment().apply {
                setActiveProfiles("dev")
            }
        val props = ClientIpHashingProperties(baseSecret = "", allowEmptySecret = false)

        val ex =
            assertThrows(IllegalStateException::class.java) {
                props.validate(env)
            }
        assertTrue(
            ex.message?.contains("readmates.security.ip-hash.allow-empty-secret") == true,
            "Expected message to mention allow-empty-secret but was: ${ex.message}",
        )
    }

    @Test
    fun `test profile with allowEmptySecret=true and blank secret does not throw and emits single warn`() {
        val env =
            MockEnvironment().apply {
                setActiveProfiles("test")
            }
        val props = ClientIpHashingProperties(baseSecret = "", allowEmptySecret = true)

        assertDoesNotThrow {
            props.validate(env)
        }

        val warnLogs =
            logAppender.list.filter { event ->
                event.level == Level.WARN &&
                    "readmates.security.ip-hash.allow-empty-secret" in event.formattedMessage
            }
        assertTrue(
            warnLogs.size == 1,
            "Expected exactly 1 WARN log containing 'readmates.security.ip-hash.allow-empty-secret' " +
                "but found ${warnLogs.size}. Logs: ${logAppender.list.map { it.formattedMessage }}",
        )
    }

    @Test
    fun `non-blank secret with production profile does not throw and emits no warn`() {
        val env =
            MockEnvironment().apply {
                setActiveProfiles("production")
            }
        val props = ClientIpHashingProperties(baseSecret = "real-secret-value", allowEmptySecret = false)

        assertDoesNotThrow {
            props.validate(env)
        }

        val warnLogs =
            logAppender.list.filter { event ->
                event.level == Level.WARN &&
                    "readmates.security.ip-hash.allow-empty-secret" in event.formattedMessage
            }
        assertTrue(
            warnLogs.isEmpty(),
            "Expected no WARN logs but found: ${warnLogs.map { it.formattedMessage }}",
        )
    }

    @Test
    fun `non-blank secret with test profile does not throw and emits no warn`() {
        val env =
            MockEnvironment().apply {
                setActiveProfiles("test")
            }
        val props = ClientIpHashingProperties(baseSecret = "real-secret-value", allowEmptySecret = false)

        assertDoesNotThrow {
            props.validate(env)
        }

        val warnLogs =
            logAppender.list.filter { event ->
                event.level == Level.WARN &&
                    "readmates.security.ip-hash.allow-empty-secret" in event.formattedMessage
            }
        assertTrue(
            warnLogs.isEmpty(),
            "Expected no WARN logs but found: ${warnLogs.map { it.formattedMessage }}",
        )
    }
}
