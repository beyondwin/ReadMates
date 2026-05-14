package com.readmates.auth.infrastructure.security

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.test.util.ReflectionTestUtils
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class BffSecretAuditExecutorConfigTest {
    @Test
    fun `executor waits for in-flight tasks on shutdown`() {
        val registry = SimpleMeterRegistry()
        val config = BffSecretAuditExecutorConfig(registry)
        val executor = config.bffSecretAuditExecutor()
        val started = CountDownLatch(1)
        val finished = CountDownLatch(1)

        executor.execute {
            started.countDown()
            Thread.sleep(200)
            finished.countDown()
        }
        started.await(1, TimeUnit.SECONDS)

        executor.shutdown()

        assertThat(finished.await(2, TimeUnit.SECONDS)).isTrue
    }

    @Test
    fun `rejected tasks increment dropped counter`() {
        val registry = SimpleMeterRegistry()
        val config = BffSecretAuditExecutorConfig(registry)
        val executor = config.bffSecretAuditExecutor()

        executor.threadPoolExecutor.shutdownNow()
        executor.execute { /* should be rejected */ }

        val dropped = registry.get("bff.audit.shutdown.dropped").counter().count()
        assertThat(dropped).isGreaterThanOrEqualTo(1.0)
    }

    @Test
    fun `awaitTerminationSeconds is 5`() {
        val registry = SimpleMeterRegistry()
        val config = BffSecretAuditExecutorConfig(registry)
        val executor = config.bffSecretAuditExecutor()

        val awaitTerminationMillis = ReflectionTestUtils.getField(executor, "awaitTerminationMillis") as Long
        assertThat(awaitTerminationMillis).isEqualTo(5_000L)
    }
}
