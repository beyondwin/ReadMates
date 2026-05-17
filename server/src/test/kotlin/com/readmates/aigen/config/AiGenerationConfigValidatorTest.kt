package com.readmates.aigen.config

import com.readmates.aigen.application.port.out.AiGenerationJobPublishCommand
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.support.DefaultListableBeanFactory
import org.springframework.beans.factory.support.RootBeanDefinition

class AiGenerationConfigValidatorTest {
    @Test
    fun `passes when aigen is disabled regardless of queue beans`() {
        assertThatCode {
            AiGenerationConfigValidator(
                aigenEnabled = false,
                beanFactory = emptyBeanFactory(),
            ).validate()
        }.doesNotThrowAnyException()
    }

    @Test
    fun `passes when aigen is enabled and a queue bean is wired`() {
        val factory = DefaultListableBeanFactory()
        factory.registerBeanDefinition(
            "noopQueue",
            RootBeanDefinition(NoopQueue::class.java),
        )
        assertThatCode {
            AiGenerationConfigValidator(aigenEnabled = true, beanFactory = factory).validate()
        }.doesNotThrowAnyException()
    }

    @Test
    fun `fails fast with an actionable message when aigen is enabled but no queue bean is wired`() {
        assertThatThrownBy {
            AiGenerationConfigValidator(
                aigenEnabled = true,
                beanFactory = emptyBeanFactory(),
            ).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("readmates.aigen.enabled=true")
            .hasMessageContaining("AiGenerationJobQueue")
            .hasMessageContaining("READMATES_AIGEN_KAFKA_ENABLED")
    }

    private fun emptyBeanFactory(): DefaultListableBeanFactory = DefaultListableBeanFactory()

    private class NoopQueue : AiGenerationJobQueue {
        override fun publish(command: AiGenerationJobPublishCommand) = Unit
    }
}
