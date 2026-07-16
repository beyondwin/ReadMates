package com.readmates.aigen.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.env.MutablePropertySources
import org.springframework.core.io.FileSystemResource
import org.springframework.mock.env.MockEnvironment
import java.nio.file.Files
import java.nio.file.Path

class SpringAiDependencyContractTest {
    @Test
    fun `uses the Spring AI BOM and managed provider starters`() {
        val buildFile = Files.readString(Path.of("build.gradle.kts"))

        assertThat(buildFile).contains("mavenBom(\"org.springframework.ai:spring-ai-bom:2.0.0\")")
        assertThat(buildFile).contains("spring-ai-starter-model-openai")
        assertThat(buildFile).contains("spring-ai-starter-model-anthropic")
        assertThat(buildFile).contains("spring-ai-starter-model-google-genai")
        assertThat(buildFile).contains("spring-boot-starter-opentelemetry")
        assertThat(buildFile).doesNotContain("compileOnly(\"com.anthropic:anthropic-java")
        assertThat(buildFile).doesNotContain("compileOnly(\"com.openai:openai-java")
        assertThat(buildFile).doesNotContain("implementation(\"com.openai:openai-java")
        assertThat(buildFile).doesNotContain("implementation(\"com.anthropic:anthropic-java")
        assertThat(buildFile).doesNotContain("implementation(\"com.google.genai:google-genai")
        assertThat(buildFile).doesNotContain("implementation(\"com.openai:openai-java-client-okhttp")
        assertThat(buildFile).doesNotContain("implementation(\"com.anthropic:anthropic-java-client-okhttp")
    }

    @Test
    fun `keeps Spring AI content observations disabled by default`() {
        val environment = loadApplicationEnvironment()

        assertThat(environment.getProperty("spring.ai.model.audio.speech")).isEqualTo("none")
        assertThat(environment.getProperty("spring.ai.model.audio.transcription")).isEqualTo("none")
        assertThat(environment.getProperty("spring.ai.model.chat")).isEqualTo("none")
        assertThat(environment.getProperty("spring.ai.model.embedding")).isEqualTo("none")
        assertThat(environment.getProperty("spring.ai.model.embedding.multimodal")).isEqualTo("none")
        assertThat(environment.getProperty("spring.ai.model.embedding.text")).isEqualTo("none")
        assertThat(environment.getProperty("spring.ai.model.image")).isEqualTo("none")
        assertThat(environment.getProperty("spring.ai.model.moderation")).isEqualTo("none")
        assertThat(environment.getProperty("spring.ai.retry.max-attempts")).isEqualTo("1")
        assertThat(environment.getProperty("spring.ai.chat.client.observations.log-prompt")).isEqualTo("false")
        assertThat(environment.getProperty("spring.ai.chat.client.observations.log-completion")).isEqualTo("false")
        assertThat(environment.getProperty("spring.ai.chat.observations.log-prompt")).isEqualTo("false")
        assertThat(environment.getProperty("spring.ai.chat.observations.log-completion")).isEqualTo("false")
        assertThat(environment.getProperty("spring.ai.chat.observations.include-error-logging")).isEqualTo("false")
        assertThat(environment.getProperty("spring.ai.tools.observations.include-content")).isEqualTo("false")
    }

    private fun loadApplicationEnvironment(): MockEnvironment {
        val resource = FileSystemResource(Path.of("src/main/resources/application.yml"))
        val propertySources = MutablePropertySources()
        YamlPropertySourceLoader().load("application.yml", resource).forEach(propertySources::addLast)
        return MockEnvironment().also { environment ->
            propertySources.forEach(environment.propertySources::addLast)
        }
    }
}
