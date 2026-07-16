package com.readmates.aigen.adapter.out.llm.springai

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.GroundedGenerationSchemaResource
import com.readmates.aigen.adapter.out.llm.common.GroundedProviderTestFixture
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource
import com.readmates.aigen.adapter.out.llm.gemini.GeminiSchemaCompatAdapter
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.config.GoogleGenAiSpringAiModelFactory
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.google.genai.GoogleGenAiChatOptions
import java.time.Duration
import java.util.concurrent.atomic.AtomicInteger

class GoogleGenAiSpringAiContractTest {
    @Test
    fun `request options use exact allowlisted safe structured-output settings`() {
        val request = request()

        val options =
            optionsFactory()
                .options(Provider.GEMINI, MODEL, request, SpringAiGenerationMode.GENERATE)
                .build() as GoogleGenAiChatOptions

        assertThat(options.model).isEqualTo(MODEL.name)
        assertThat(options.maxOutputTokens).isEqualTo(request.maxOutputTokens)
        assertThat(options.responseMimeType).isEqualTo("application/json")
        assertThat(options.outputSchema).isEqualTo(schemaAdapter().adapt(request.schemaJson))
        assertThat(options.thinkingBudget).isZero()
        assertThat(options.includeThoughts).isFalse()
        assertThat(options.googleSearchRetrieval).isFalse()
        assertThat(options.includeServerSideToolInvocations).isFalse()
        assertThat(options.toolCallbacks).isNullOrEmpty()
        assertThat(options.cachedContentName).isNull()
        assertThat(options.useCachedContent).isNull()
        assertThat(options.autoCacheThreshold).isNull()
    }

    @Test
    fun `normal request sends no-retention header and omits tools search and thoughts`() {
        ProviderMockHttpServer.start(successResponse(), GOOGLE_PATH).use { server ->
            val output = generator(model(server.origin, Duration.ofSeconds(2))).generate(MODEL, request())

            assertThat(output.usage.nonCachedInputTokens).isEqualTo(100)
            assertThat(output.usage.cacheReadInputTokens).isEqualTo(20)
            assertThat(output.usage.cacheWriteInputTokens).isZero()
            assertThat(output.usage.outputTokens).isEqualTo(30)
            assertThat(output.usageComplete).isTrue()
            assertThat(server.requestCount).isEqualTo(1)
            assertThat(server.requestHeaders.single().entries)
                .anySatisfy { (name, values) ->
                    assertThat(name).isEqualToIgnoringCase("x-goog-data-policy")
                    assertThat(values).containsExactly("no-retention")
                }
            val body = ObjectMapper().readTree(server.requestBodies.single())
            val config = body.path("generationConfig")
            assertThat(config.path("responseMimeType").asText()).isEqualTo("application/json")
            assertThat(config.path("maxOutputTokens").asInt()).isEqualTo(request().maxOutputTokens)
            val wireSchema = config.path("responseJsonSchema")
            assertThat(wireSchema.path("type").asText()).isEqualTo("object")
            assertThat(wireSchema.path("required").map { it.asText() })
                .contains("format", "summaryBlocks", "feedbackSections")
            assertThat(
                wireSchema
                    .path("properties")
                    .path("format")
                    .path("enum")
                    .first()
                    .asText(),
            ).isEqualTo("readmates-grounded-generation:v2")
            assertThat(wireSchema.toString()).doesNotContain("${'$'}schema", "${'$'}ref", "additionalProperties")
            assertThat(config.path("thinkingConfig").path("thinkingBudget").asInt()).isZero()
            assertThat(config.path("thinkingConfig").path("includeThoughts").asBoolean()).isFalse()
            assertThat(config.has("tools")).isFalse()
            assertThat(body.has("tools")).isFalse()
            assertThat(config.has("cachedContent")).isFalse()
            assertThat(server.requestBodies.single()).doesNotContain(
                "googleSearch",
                "codeExecution",
                "urlContext",
                "functionDeclarations",
            )
        }
    }

    @Test
    fun `missing Google usage metadata keeps worst-case reservation`() {
        ProviderMockHttpServer.start(successResponse(usageMetadata = null), GOOGLE_PATH).use { server ->
            val output = generator(model(server.origin, Duration.ofSeconds(2))).generate(MODEL, request())

            assertThat(output.usageComplete).isFalse()
            assertThat(server.requestCount).isEqualTo(1)
        }
    }

    @Test
    fun `empty or partial Google usage metadata keeps worst-case reservation`() {
        listOf(
            "{}",
            """{"promptTokenCount":120}""",
            """{"promptTokenCount":120,"candidatesTokenCount":30}""",
        ).forEach { metadata ->
            ProviderMockHttpServer.start(successResponse(usageMetadata = metadata), GOOGLE_PATH).use { server ->
                val output = generator(model(server.origin, Duration.ofSeconds(2))).generate(MODEL, request())

                assertThat(output.usageComplete).isFalse()
                assertThat(server.requestCount).isEqualTo(1)
            }
        }
    }

    @Test
    fun `429 500 timeout and malformed output each make exactly one request`() {
        listOf(
            ProviderMockHttpServer.Response(429, errorBody(429)),
            ProviderMockHttpServer.Response(500, errorBody(500)),
            successResponse(text = "not-json"),
            successResponse(delay = Duration.ofMillis(250)),
        ).forEachIndexed { index, response ->
            ProviderMockHttpServer.start(response, GOOGLE_PATH).use { server ->
                val timeout = if (index == 3) Duration.ofMillis(30) else Duration.ofSeconds(2)
                assertThatThrownBy { generator(model(server.origin, timeout)).generate(MODEL, request()) }
                    .isInstanceOf(LlmGenerationException::class.java)
                assertThat(server.requestCount).isEqualTo(1)
            }
        }
    }

    @Test
    fun `Google model disables SDK and Spring AI retries and retains bounded timeout`() {
        val created =
            GoogleGenAiSpringAiModelFactory.create(
                "test-api-key",
                "http://127.0.0.1:1",
                Duration.ofMinutes(4),
            )

        assertThat(created.options.timeout().orElseThrow()).isEqualTo(Duration.ofMinutes(4).toMillis().toInt())
        assertThat(
            created.options
                .retryOptions()
                .orElseThrow()
                .attempts()
                .orElseThrow(),
        ).isEqualTo(1)
        val calls = AtomicInteger()
        assertThatThrownBy {
            created.retryTemplate.invoke<Unit> {
                calls.incrementAndGet()
                throw IllegalStateException("test")
            }
        }.isInstanceOf(IllegalStateException::class.java)
        assertThat(calls).hasValue(1)
    }

    private fun generator(model: org.springframework.ai.google.genai.GoogleGenAiChatModel) =
        SpringAiWholeTranscriptGroundedGenerator(
            provider = Provider.GEMINI,
            chatClient = ChatClient.create(model),
            codec = GroundedDraftJsonCodec(),
            optionsFactory = optionsFactory(),
            usageMapper = SpringAiUsageMapper(),
            errorMapper = SpringAiErrorMapper(),
        )

    private fun model(
        baseUrl: String,
        timeout: Duration,
    ) = GoogleGenAiSpringAiModelFactory.create("test-api-key", baseUrl, timeout).model

    private fun request() = GroundedProviderTestFixture.request(GroundedGenerationSchemaResource().schemaAsString())

    private fun schemaAdapter() = GeminiSchemaCompatAdapter(SessionImportSchemaResource())

    private fun optionsFactory() =
        SpringAiProviderOptionsFactory(
            modelCapabilityCatalog =
                ModelCapabilityCatalog { model ->
                    model.takeIf { it == MODEL }?.let {
                        ModelCapability(1_048_576, 65_536, structuredOutputSupported = true)
                    }
                },
            geminiSchemaCompatAdapter = schemaAdapter(),
        )

    private fun successResponse(
        text: String = GroundedProviderTestFixture.draftNode().toString(),
        delay: Duration = Duration.ZERO,
        usageMetadata: String? = DEFAULT_USAGE_METADATA,
    ): ProviderMockHttpServer.Response {
        val content = ObjectMapper().writeValueAsString(text)
        val usage =
            usageMetadata?.let { ",\"usageMetadata\":$it" }.orEmpty()
        return ProviderMockHttpServer.Response(
            200,
            """
            {
              "candidates":[{
                "content":{"parts":[{"text":$content}],"role":"model"},
                "finishReason":"STOP",
                "index":0
              }]$usage,
              "modelVersion":"${MODEL.name}",
              "responseId":"public-test-response"
            }
            """.trimIndent(),
            delay = delay,
        )
    }

    private fun errorBody(code: Int): String {
        val status = "UNAVAILABLE"
        return """
            {"error":{"code":$code,"message":"provider unavailable","status":"$status"}}
            """.trimIndent()
    }

    private companion object {
        val MODEL = ModelId(Provider.GEMINI, "gemini-3-flash-preview")
        const val GOOGLE_PATH = "/v1beta/models/gemini-3-flash-preview:generateContent"
        const val DEFAULT_USAGE_METADATA =
            """{"promptTokenCount":120,"cachedContentTokenCount":20,"candidatesTokenCount":30,"totalTokenCount":150}"""
    }
}
