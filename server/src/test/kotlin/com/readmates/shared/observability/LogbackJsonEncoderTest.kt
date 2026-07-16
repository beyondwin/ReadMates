package com.readmates.shared.observability

import ch.qos.logback.classic.LoggerContext
import ch.qos.logback.classic.joran.JoranConfigurator
import ch.qos.logback.classic.util.ContextInitializer
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Isolated
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import java.io.ByteArrayOutputStream
import java.io.PrintStream

/**
 * Verifies the production `logback-spring.xml` JSON encoder configuration.
 *
 * Spring Boot's `LogbackLoggingSystem` is what normally wires `logback-spring.xml`.
 * Outside a Spring context, plain Logback only auto-loads `logback.xml` /
 * `logback-test.xml`. So we explicitly parse the production config via Joran
 * and assert the resulting `System.out` line is JSON containing the MDC requestId.
 *
 * `@Isolated` is required because both `System.setOut` and `LoggerContext.reset`
 * are JVM-global; the `unitTest` Gradle task runs classes concurrently.
 */
@Isolated
class LogbackJsonEncoderTest {
    @Test
    fun `console log line is valid JSON containing content-free correlation MDC`() {
        val context = LoggerFactory.getILoggerFactory() as LoggerContext
        val originalOut = System.out
        val captured = ByteArrayOutputStream()

        context.reset()
        JoranConfigurator().apply { setContext(context) }.doConfigure(
            javaClass.classLoader.getResource("logback-spring.xml")
                ?: error("logback-spring.xml not found on classpath"),
        )
        System.setOut(PrintStream(captured))
        try {
            val expected =
                mapOf(
                    "requestId" to "smoke-req-1234",
                    "traceId" to "0123456789abcdef0123456789abcdef",
                    "spanId" to "0123456789abcdef",
                    "jobId" to "11111111-2222-4333-8444-555555555555",
                    "provider" to "openai",
                    "stage" to "primary",
                    "attempt" to "2",
                )
            expected.forEach(MDC::put)
            MDC.put("prompt", "synthetic prompt must not be serialized")
            LoggerFactory.getLogger(LogbackJsonEncoderTest::class.java).info("smoke-line")
        } finally {
            System.setOut(originalOut)
            MDC.clear()
            context.reset()
            ContextInitializer(context).autoConfig()
        }

        val line = captured.toString().lineSequence().first { it.contains("smoke-line") }
        assertTrue(line.trim().startsWith("{"), "log line should be JSON: $line")
        assertTrue(line.contains("\"requestId\":\"smoke-req-1234\""), "missing requestId in: $line")
        assertTrue(line.contains("\"traceId\":\"0123456789abcdef0123456789abcdef\""), "missing traceId in: $line")
        assertTrue(line.contains("\"spanId\":\"0123456789abcdef\""), "missing spanId in: $line")
        assertTrue(line.contains("\"jobId\":\"11111111-2222-4333-8444-555555555555\""), "missing jobId in: $line")
        assertTrue(line.contains("\"provider\":\"openai\""), "missing provider in: $line")
        assertTrue(line.contains("\"stage\":\"primary\""), "missing stage in: $line")
        assertTrue(line.contains("\"attempt\":\"2\""), "missing attempt in: $line")
        assertFalse(line.contains("synthetic prompt"), "content-bearing MDC should be excluded: $line")
        assertFalse(line.contains("[ignore]"), "should not contain placeholder")
    }
}
