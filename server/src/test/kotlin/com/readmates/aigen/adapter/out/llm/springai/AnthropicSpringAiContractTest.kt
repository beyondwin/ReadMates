package com.readmates.aigen.adapter.out.llm.springai

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.GroundedGenerationSchemaResource
import com.readmates.aigen.adapter.out.llm.common.GroundedProviderTestFixture
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCallException
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.config.AnthropicSpringAiModelFactory
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.ai.anthropic.AnthropicCacheStrategy
import org.springframework.ai.anthropic.AnthropicChatModel
import org.springframework.ai.anthropic.AnthropicChatOptions
import org.springframework.ai.chat.client.ChatClient
import java.time.Duration
import java.time.LocalDate

class AnthropicSpringAiContractTest {
    @Test
    fun `native structured output allowlist has one jointly verified model`() {
        assertThat(AnthropicGroundedModelPolicy.verifiedModels)
            .containsExactlyEntriesOf(mapOf(MODEL.name to LocalDate.of(2026, 7, 16)))
    }

    @Test
    fun `request options use exact native schema output ceiling and system-only caching`() {
        val options =
            optionsFactory()
                .options(Provider.CLAUDE, MODEL, request(), SpringAiGenerationMode.GENERATE)
                .build()

        assertThat(options).isInstanceOf(AnthropicChatOptions::class.java)
        val anthropicOptions = options as AnthropicChatOptions
        assertThat(anthropicOptions.model).isEqualTo(MODEL.name)
        assertThat(anthropicOptions.maxTokens).isEqualTo(request().maxOutputTokens)
        assertThat(ObjectMapper().readTree(anthropicOptions.outputSchema))
            .isEqualTo(ObjectMapper().readTree(AnthropicNativeSchema.forProvider(request().schemaJson)))
        assertThat(anthropicOptions.outputSchema).contains("readmates-grounded-generation:v2")
        assertThat(anthropicOptions.outputSchema).doesNotContain("\$ref", "\$defs")
        assertThat(anthropicOptions.cacheOptions.strategy).isEqualTo(AnthropicCacheStrategy.SYSTEM_ONLY)
        assertThat(anthropicOptions.toolCallbacks).isNullOrEmpty()
        assertThat(anthropicOptions.toolChoice).isNull()
    }

    @Test
    fun `request options reject Anthropic models outside the verified native allowlist`() {
        assertThatThrownBy {
            optionsFactory().options(
                Provider.CLAUDE,
                ModelId(Provider.CLAUDE, "claude-unverified-public-test"),
                request(),
                SpringAiGenerationMode.GENERATE,
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Grounded Anthropic model is not verified for native structured output")
    }

    @Test
    fun `Anthropic schema rejects external and recursive references before transport`() {
        val invalidSchemas =
            listOf(
                """{"type":"object","properties":{"value":{"${'$'}ref":"https://public.example/schema"}}}""",
                """
                {
                  "type":"object",
                  "properties":{"value":{"${'$'}ref":"#/${'$'}defs/loop"}},
                  "${'$'}defs":{"loop":{"${'$'}ref":"#/${'$'}defs/loop"}}
                }
                """.trimIndent(),
            )

        invalidSchemas.forEach { schema ->
            val failure = runCatching { AnthropicNativeSchema.forProvider(schema) }.exceptionOrNull()

            assertThat(failure).isInstanceOf(IllegalArgumentException::class.java)
            assertThat(failure?.message)
                .doesNotContain("public.example", "#/\$defs/loop")
                .isIn(
                    "Grounded Anthropic schema contains an unsupported reference",
                    "Grounded Anthropic schema contains a recursive reference",
                )
        }
    }

    @Test
    fun `native structured output and system-only cache are exact on the wire`() {
        ProviderMockHttpServer.start(successResponse(), ANTHROPIC_MESSAGES_PATH).use { server ->
            val output = generator(model(server.origin, Duration.ofSeconds(2))).generate(MODEL, request())

            assertThat(server.requestCount).isEqualTo(1)
            val body = ObjectMapper().readTree(server.requestBodies.single())
            assertThat(body.path("model").asText()).isEqualTo(MODEL.name)
            assertThat(body.path("max_tokens").asInt()).isEqualTo(16_384)
            assertThat(
                body
                    .path("output_config")
                    .path("format")
                    .path("type")
                    .asText(),
            ).isEqualTo("json_schema")
            assertThat(body.path("output_config").path("format").path("schema"))
                .isEqualTo(ObjectMapper().readTree(AnthropicNativeSchema.forProvider(request().schemaJson)))
            assertThat(
                body
                    .path("output_config")
                    .path("format")
                    .path("schema")
                    .toString(),
            ).doesNotContain("\$ref", "\$defs")
            assertThat(body.path("system").isArray).isTrue()
            assertThat(
                body
                    .path("system")
                    .path(0)
                    .path("cache_control")
                    .path("type")
                    .asText(),
            ).isEqualTo("ephemeral")
            assertThat(body.path("messages").path(0).toString()).doesNotContain("cache_control")
            assertThat(body.has("tools")).isFalse()
            assertThat(output.usage.nonCachedInputTokens).isEqualTo(100)
            assertThat(output.usage.cacheWriteInputTokens).isEqualTo(25)
            assertThat(output.usage.cacheReadInputTokens).isEqualTo(20)
            assertThat(output.usage.outputTokens).isEqualTo(30)
            assertThat(output.usageComplete).isTrue()
        }
    }

    @Test
    fun `missing Anthropic cache metadata retains usage but fails closed`() {
        listOf(
            successResponse(includeCacheRead = false),
            successResponse(includeCacheWrite = false),
        ).forEachIndexed { index, response ->
            ProviderMockHttpServer.start(response, ANTHROPIC_MESSAGES_PATH).use { server ->
                val output = generator(model(server.origin, Duration.ofSeconds(2))).generate(MODEL, request())

                assertThat(server.requestCount).describedAs("metadata scenario %s", index).isEqualTo(1)
                assertThat(output.usage.nonCachedInputTokens).isEqualTo(100)
                assertThat(output.usage.cacheWriteInputTokens).isIn(0L, 25L)
                assertThat(output.usage.cacheReadInputTokens).isIn(0L, 20L)
                assertThat(output.usage.outputTokens).isEqualTo(30)
                assertThat(output.usageComplete).isFalse()
            }
        }
    }

    @Test
    fun `each reserved adapter call makes one Anthropic wire request for every failure shape`() {
        val scenarios =
            listOf(
                ProviderMockHttpServer.Response(429, errorBody("rate_limit_error")),
                ProviderMockHttpServer.Response(500, errorBody("api_error")),
                ProviderMockHttpServer.Response(200, successResponse(text = "not-json").body),
                ProviderMockHttpServer.Response(
                    200,
                    successResponse().body,
                    delay = Duration.ofMillis(250),
                ),
            )

        scenarios.forEachIndexed { index, response ->
            ProviderMockHttpServer.start(response, ANTHROPIC_MESSAGES_PATH).use { server ->
                val timeout = if (index == scenarios.lastIndex) Duration.ofMillis(50) else Duration.ofSeconds(2)

                assertThatThrownBy {
                    generator(model(server.origin, timeout)).generate(MODEL, request())
                }.isInstanceOf(ProviderCallException::class.java)
                assertThat(server.requestCount).describedAs("scenario %s", index).isEqualTo(1)
            }
        }
    }

    @Test
    fun `Anthropic model disables SDK retries and retains the bounded request timeout`() {
        val model = model("http://127.0.0.1:1/v1", Duration.ofMinutes(4))

        assertThat(model.options.maxRetries).isZero()
        assertThat(model.options.timeout).isEqualTo(Duration.ofMinutes(4))
    }

    private fun generator(model: AnthropicChatModel) =
        SpringAiWholeTranscriptGroundedGenerator(
            provider = Provider.CLAUDE,
            chatClient = ChatClient.create(model),
            codec = GroundedDraftJsonCodec(),
            optionsFactory = optionsFactory(),
            usageMapper = SpringAiUsageMapper(),
            errorMapper = SpringAiErrorMapper(),
        )

    private fun model(
        baseUrl: String,
        timeout: Duration,
    ) = AnthropicSpringAiModelFactory.create("test-api-key", baseUrl, timeout)

    private fun request() = GroundedProviderTestFixture.request(GroundedGenerationSchemaResource().schemaAsString())

    private fun optionsFactory() =
        SpringAiProviderOptionsFactory(
            ModelCapabilityCatalog { model ->
                model.takeIf { it == MODEL }?.let {
                    ModelCapability(
                        contextWindowTokens = 1_000_000,
                        maxOutputTokens = 128_000,
                        structuredOutputSupported = true,
                    )
                }
            },
        )

    private fun successResponse(
        includeCacheRead: Boolean = true,
        includeCacheWrite: Boolean = true,
        text: String = GroundedProviderTestFixture.draftNode().toString(),
    ): ProviderMockHttpServer.Response {
        val content = ObjectMapper().writeValueAsString(text)
        val cacheRead = if (includeCacheRead) ",\"cache_read_input_tokens\":20" else ""
        val cacheWrite = if (includeCacheWrite) ",\"cache_creation_input_tokens\":25" else ""
        return ProviderMockHttpServer.Response(
            200,
            """
            {
              "id":"msg_public_test",
              "type":"message",
              "role":"assistant",
              "model":"${MODEL.name}",
              "content":[{"type":"text","text":$content}],
              "stop_reason":"end_turn",
              "stop_sequence":null,
              "usage":{
                "input_tokens":100$cacheWrite$cacheRead,
                "output_tokens":30
              }
            }
            """.trimIndent(),
        )
    }

    private fun errorBody(type: String) =
        """
        {"type":"error","error":{"type":"$type","message":"provider unavailable"}}
        """.trimIndent()

    private companion object {
        val MODEL = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")
        const val ANTHROPIC_MESSAGES_PATH = "/v1/messages"
    }
}
