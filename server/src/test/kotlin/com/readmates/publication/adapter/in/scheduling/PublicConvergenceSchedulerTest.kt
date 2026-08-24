@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.scheduling

import com.readmates.publication.adapter.out.HttpPublicCachePurgeAdapter
import com.readmates.publication.adapter.out.NoopPublicCachePurgeAdapter
import com.readmates.publication.application.model.PublicConvergenceProcessResult
import com.readmates.publication.application.port.`in`.MaintainPublicConvergenceWorkUseCase
import com.readmates.publication.application.port.`in`.ProcessPublicConvergenceUseCase
import com.readmates.publication.application.port.out.PublicCachePurgePort
import com.readmates.publication.config.PublicConvergenceConfiguration
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

class PublicConvergenceSchedulerTest {
    @Test
    fun `all disabled uses noop provider and no scheduler without invoking work`() {
        assertRuntime(emptyArray(), NoopPublicCachePurgeAdapter::class.java, schedulerExpected = false)
        contextRunner.run { context ->
            assertThat(context).hasNotFailed()
            assertThat(context.containsBean("publicConvergenceMaintenanceScheduler")).isTrue()
            context.getBean(PublicConvergenceMaintenanceScheduler::class.java).purgeExpired()
            assertThat(context.getBean(RecordingMaintenance::class.java).invocations).isOne()
        }
    }

    @Test
    fun `prepared http provider with disabled feature keeps a complete idle bean graph`() {
        assertRuntime(httpProviderProperties(), HttpPublicCachePurgeAdapter::class.java, schedulerExpected = false)
    }

    @Test
    fun `enabled feature with disabled scheduler prepares http provider without invoking work`() {
        assertRuntime(
            arrayOf("readmates.public-convergence.enabled=true") + httpProviderProperties(),
            HttpPublicCachePurgeAdapter::class.java,
            schedulerExpected = false,
        )
    }

    @Test
    fun `enabled feature and scheduler without http provider stays inert on noop`() {
        assertRuntime(
            arrayOf(
                "readmates.public-convergence.enabled=true",
                "readmates.public-convergence.scheduler.enabled=true",
            ),
            NoopPublicCachePurgeAdapter::class.java,
            schedulerExpected = false,
        )
    }

    @Test
    fun `scheduler exists only when feature scheduler and http provider are enabled`() {
        assertRuntime(
            arrayOf(
                "readmates.public-convergence.enabled=true",
                "readmates.public-convergence.scheduler.enabled=true",
            ) + httpProviderProperties(),
            HttpPublicCachePurgeAdapter::class.java,
            schedulerExpected = true,
        )
    }

    @Test
    fun `scheduler drains at most the configured bounded batch`() {
        contextRunner
            .withPropertyValues(
                "readmates.public-convergence.enabled=true",
                "readmates.public-convergence.scheduler.enabled=true",
                "readmates.public-convergence.scheduler.batch-size=2",
                *httpProviderProperties(),
            ).run { context ->
                val scheduler = context.getBean(PublicConvergenceScheduler::class.java)
                val processor = context.getBean(RecordingProcessor::class.java)

                scheduler.processBatch()

                assertThat(processor.invocations).isEqualTo(2)
            }
    }

    private fun assertRuntime(
        properties: Array<String>,
        expectedProvider: Class<out PublicCachePurgePort>,
        schedulerExpected: Boolean,
    ) {
        contextRunner.withPropertyValues(*properties).run { context ->
            assertThat(context).hasNotFailed()
            assertThat(context).hasSingleBean(PublicCachePurgePort::class.java)
            assertThat(context.getBean(PublicCachePurgePort::class.java)).isInstanceOf(expectedProvider)
            if (schedulerExpected) {
                assertThat(context).hasSingleBean(PublicConvergenceScheduler::class.java)
            } else {
                assertThat(context).doesNotHaveBean(PublicConvergenceScheduler::class.java)
            }
            assertThat(context.getBean(RecordingProcessor::class.java).invocations).isZero()
        }
    }

    private fun httpProviderProperties(): Array<String> =
        arrayOf(
            "readmates.public-convergence.provider.http-enabled=true",
            "readmates.public-convergence.provider.endpoint=https://cache-provider.invalid/purge",
            "readmates.public-convergence.provider.credential=test-only-credential",
        )

    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(
                PublicConvergenceConfiguration::class.java,
                HttpPublicCachePurgeAdapter::class.java,
                NoopPublicCachePurgeAdapter::class.java,
                PublicConvergenceScheduler::class.java,
                PublicConvergenceMaintenanceScheduler::class.java,
                TestConfig::class.java,
            )

    @Configuration(proxyBeanMethods = false)
    class TestConfig {
        @Bean
        fun processor(): RecordingProcessor = RecordingProcessor()

        @Bean
        fun maintenance(): RecordingMaintenance = RecordingMaintenance()

        @Bean
        fun providerConsumer(provider: PublicCachePurgePort): ProviderConsumer = ProviderConsumer(provider)
    }

    class ProviderConsumer(
        val provider: PublicCachePurgePort,
    )

    class RecordingProcessor : ProcessPublicConvergenceUseCase {
        var invocations = 0

        override fun processOne(workerId: String): PublicConvergenceProcessResult {
            invocations += 1
            return PublicConvergenceProcessResult.PROCESSED
        }
    }

    class RecordingMaintenance : MaintainPublicConvergenceWorkUseCase {
        var invocations = 0

        override fun purgeExpiredWork(): Int {
            invocations += 1
            return 0
        }
    }
}
