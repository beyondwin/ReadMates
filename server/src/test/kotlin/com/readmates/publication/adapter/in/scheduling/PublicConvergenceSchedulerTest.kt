@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.scheduling

import com.readmates.publication.application.model.PublicConvergenceProcessResult
import com.readmates.publication.application.port.`in`.ProcessPublicConvergenceUseCase
import com.readmates.publication.config.PublicConvergenceConfiguration
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

class PublicConvergenceSchedulerTest {
    @Test
    fun `scheduler is absent unless feature scheduler and http provider are explicitly enabled`() {
        contextRunner.run { context ->
            assertThat(context).doesNotHaveBean(PublicConvergenceScheduler::class.java)
        }

        contextRunner
            .withPropertyValues(
                "readmates.public-convergence.enabled=true",
                "readmates.public-convergence.scheduler.enabled=true",
            ).run { context ->
                assertThat(context).doesNotHaveBean(PublicConvergenceScheduler::class.java)
            }

        contextRunner
            .withPropertyValues(
                "readmates.public-convergence.enabled=true",
                "readmates.public-convergence.scheduler.enabled=true",
                "readmates.public-convergence.provider.http-enabled=true",
            ).run { context ->
                assertThat(context).hasFailed()
                assertThat(context.startupFailure).hasRootCauseMessage(
                    "Public convergence provider endpoint must be an HTTPS URI without user info",
                )
            }
    }

    @Test
    fun `scheduler drains at most the configured bounded batch`() {
        contextRunner
            .withPropertyValues(
                "readmates.public-convergence.enabled=true",
                "readmates.public-convergence.scheduler.enabled=true",
                "readmates.public-convergence.provider.http-enabled=true",
                "readmates.public-convergence.provider.endpoint=https://cache-provider.example/purge",
                "readmates.public-convergence.provider.credential=test-credential",
                "readmates.public-convergence.scheduler.batch-size=2",
            ).run { context ->
                val scheduler = context.getBean(PublicConvergenceScheduler::class.java)
                val processor = context.getBean(RecordingProcessor::class.java)

                scheduler.processBatch()

                assertThat(processor.invocations).isEqualTo(2)
            }
    }

    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(
                PublicConvergenceConfiguration::class.java,
                PublicConvergenceScheduler::class.java,
                TestConfig::class.java,
            )

    @Configuration(proxyBeanMethods = false)
    class TestConfig {
        @Bean
        fun processor(): RecordingProcessor = RecordingProcessor()
    }

    class RecordingProcessor : ProcessPublicConvergenceUseCase {
        var invocations = 0

        override fun processOne(workerId: String): PublicConvergenceProcessResult {
            invocations += 1
            return PublicConvergenceProcessResult.PROCESSED
        }
    }
}
