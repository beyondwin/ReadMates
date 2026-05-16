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
    fun `console log line is valid JSON containing requestId from MDC`() {
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
            MDC.put("requestId", "smoke-req-1234")
            LoggerFactory.getLogger(LogbackJsonEncoderTest::class.java).info("smoke-line")
        } finally {
            System.setOut(originalOut)
            MDC.remove("requestId")
            context.reset()
            ContextInitializer(context).autoConfig()
        }

        val line = captured.toString().lineSequence().first { it.contains("smoke-line") }
        assertTrue(line.trim().startsWith("{"), "log line should be JSON: $line")
        assertTrue(line.contains("\"requestId\":\"smoke-req-1234\""), "missing requestId in: $line")
        assertFalse(line.contains("[ignore]"), "should not contain placeholder")
    }
}
