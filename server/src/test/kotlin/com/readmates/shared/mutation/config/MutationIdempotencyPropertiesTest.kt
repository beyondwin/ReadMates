package com.readmates.shared.mutation.config

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Configuration
import org.springframework.mock.env.MockEnvironment
import java.time.Duration

class MutationIdempotencyPropertiesTest {
    @Test
    fun `external rollout buffer override below twenty four hours is rejected`() {
        contextRunner
            .withPropertyValues(
                "readmates.mutation.idempotency.current-key=test-current-mutation-key",
                "readmates.mutation.idempotency.previous-key-rollout-buffer=23h",
            ).run { context ->
                assertThat(context).hasNotFailed()
                val properties = context.getBean(MutationIdempotencyProperties::class.java)
                assertThat(properties.previousKeyRolloutBuffer).isEqualTo(Duration.ofHours(23))
                assertThatThrownBy {
                    properties.validate(MockEnvironment().withProperty("spring.profiles.active", "test"))
                }.isInstanceOf(IllegalStateException::class.java)
                    .hasMessageContaining("previous-key-rollout-buffer")
            }
    }

    @Test
    fun `external rollout buffer override accepts the full twenty four hour minimum`() {
        contextRunner
            .withPropertyValues(
                "readmates.mutation.idempotency.current-key=test-current-mutation-key",
                "readmates.mutation.idempotency.previous-key-rollout-buffer=24h",
            ).run { context ->
                assertThat(context).hasNotFailed()
                val properties = context.getBean(MutationIdempotencyProperties::class.java)
                properties.validate(MockEnvironment().withProperty("spring.profiles.active", "test"))
                assertThat(properties.previousKeyRolloutBuffer).isEqualTo(Duration.ofHours(24))
            }
    }

    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(TestConfiguration::class.java)

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(MutationIdempotencyProperties::class)
    private class TestConfiguration
}
