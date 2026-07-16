package com.readmates.aigen.config

import com.readmates.aigen.application.model.Provider
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.SpringBootConfiguration
import org.springframework.boot.autoconfigure.EnableAutoConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.core.ResolvableType
import org.springframework.util.ClassUtils

class AiGenerationDisabledContextTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(DisabledAiApplication::class.java)
            .withPropertyValues(
                "readmates.aigen.enabled=false",
                "spring.ai.model.audio.speech=none",
                "spring.ai.model.audio.transcription=none",
                "spring.ai.model.chat=none",
                "spring.ai.model.embedding=none",
                "spring.ai.model.embedding.multimodal=none",
                "spring.ai.model.embedding.text=none",
                "spring.ai.model.image=none",
                "spring.ai.model.moderation=none",
                "management.opentelemetry.tracing.export.otlp.endpoint=http://127.0.0.1:1/v1/traces",
            )

    @Test
    fun `disabled AI starts without provider keys or a reachable OTLP endpoint`() {
        contextRunner.run { context ->
            assertThat(context).hasNotFailed()

            val chatClientClassName = "org.springframework.ai.chat.client.ChatClient"
            assertThat(ClassUtils.isPresent(chatClientClassName, context.classLoader)).isTrue()
            val chatClientClass = ClassUtils.resolveClassName(chatClientClassName, context.classLoader)
            val providerChatClientMap =
                ResolvableType.forClassWithGenerics(
                    Map::class.java,
                    Provider::class.java,
                    chatClientClass,
                )

            assertThat(context.beanFactory.getBeanNamesForType(providerChatClientMap)).isEmpty()
        }
    }

    @SpringBootConfiguration(proxyBeanMethods = false)
    @EnableAutoConfiguration(
        excludeName = ["org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration"],
    )
    class DisabledAiApplication
}
