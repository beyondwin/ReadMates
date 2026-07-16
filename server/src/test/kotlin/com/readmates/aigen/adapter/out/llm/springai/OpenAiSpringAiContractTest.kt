package com.readmates.aigen.adapter.out.llm.springai

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.GroundedGenerationSchemaResource
import com.readmates.aigen.adapter.out.llm.common.GroundedProviderTestFixture
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCallException
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.config.OpenAiSpringAiModelFactory
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import java.time.Duration

class OpenAiSpringAiContractTest {
    @Test
    fun `request options use the allowlisted OpenAI model exact output ceiling and versioned schema`() {
        val request =
            GroundedProviderTestFixture.request(
                GroundedGenerationSchemaResource().schemaAsString(),
            )
        val model = GroundedProviderTestFixture.model(Provider.OPENAI)

        val options =
            optionsFactory()
                .options(Provider.OPENAI, model, request, SpringAiGenerationMode.GENERATE)
                .build()

        assertThat(options).isInstanceOf(OpenAiChatOptions::class.java)
        val openAiOptions = options as OpenAiChatOptions
        assertThat(openAiOptions.model).isEqualTo(model.name)
        assertThat(openAiOptions.maxCompletionTokens).isEqualTo(request.maxOutputTokens)
        assertThat(openAiOptions.store).isFalse()
        assertThat(openAiOptions.outputSchema).isEqualTo(request.schemaJson)
        assertThat(openAiOptions.outputSchema).contains("readmates-grounded-generation:v2")
        assertThat(openAiOptions.toolCallbacks).isNullOrEmpty()
    }

    @Test
    fun `request options reject a non-allowlisted OpenAI model before transport`() {
        val model = ModelId(Provider.OPENAI, "unlisted-public-test-model")

        assertThatThrownBy {
            optionsFactory().options(Provider.OPENAI, model, request(), SpringAiGenerationMode.GENERATE)
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Grounded model is not allowlisted for structured output")
    }

    @Test
    fun `provider structured output is strict on the wire and usage keeps cached input disjoint`() {
        ProviderMockHttpServer.start(successResponse()).use { server ->
            val model = OpenAiSpringAiModelFactory.create("test-api-key", server.baseUrl, Duration.ofSeconds(2))
            val generator = generator(model)

            val output = generator.generate(GroundedProviderTestFixture.model(Provider.OPENAI), request())

            assertThat(server.requestCount).isEqualTo(1)
            val body = ObjectMapper().readTree(server.requestBodies.single())
            assertThat(body.path("model").asText()).isEqualTo("public-test-model")
            assertThat(body.path("max_completion_tokens").asInt()).isEqualTo(16_384)
            assertThat(body.has("store")).isTrue()
            assertThat(body.path("store").asBoolean()).isFalse()
            assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_schema")
            assertThat(body.path("response_format").path("json_schema").has("strict")).isTrue()
            assertThat(
                body
                    .path("response_format")
                    .path("json_schema")
                    .path("strict")
                    .asBoolean(),
            ).isTrue()
            assertThat(body.path("response_format").path("json_schema").path("schema"))
                .isEqualTo(ObjectMapper().readTree(request().schemaJson))
            assertThat(body.has("tools")).isFalse()
            assertThat(output.usage.nonCachedInputTokens).isEqualTo(100)
            assertThat(output.usage.cacheWriteInputTokens).isZero()
            assertThat(output.usage.cacheReadInputTokens).isEqualTo(20)
            assertThat(output.usage.outputTokens).isEqualTo(30)
            assertThat(output.usageComplete).isTrue()
        }
    }

    @Test
    fun `each reserved adapter call makes one wire request for every transport failure shape`() {
        val scenarios =
            listOf(
                ProviderMockHttpServer.Response(
                    429,
                    errorBody("rate_limit_error"),
                    headers = mapOf("Retry-After" to "7200"),
                ),
                ProviderMockHttpServer.Response(500, errorBody("server_error")),
                ProviderMockHttpServer.Response(200, "not-json", contentType = "application/json"),
                ProviderMockHttpServer.Response(
                    200,
                    successResponse().body,
                    delay = Duration.ofMillis(250),
                ),
            )

        scenarios.forEachIndexed { index, response ->
            ProviderMockHttpServer.start(response).use { server ->
                val timeout = if (index == scenarios.lastIndex) Duration.ofMillis(50) else Duration.ofSeconds(2)
                val model = OpenAiSpringAiModelFactory.create("test-api-key", server.baseUrl, timeout)

                assertThatThrownBy {
                    generator(model).generate(GroundedProviderTestFixture.model(Provider.OPENAI), request())
                }.isInstanceOfSatisfying(ProviderCallException::class.java) { failure ->
                    assertThat(failure.cause).isNull()
                    if (index == 0) {
                        assertThat(failure.error.code).isEqualTo(ErrorCode.PROVIDER_RATE_LIMITED)
                        assertThat(failure.retryAfter).isEqualTo(Duration.ofHours(1))
                    }
                    assertThat(failure.error.message)
                        .isIn(
                            "Provider rate limit exceeded",
                            "Provider request outcome unknown",
                            "Provider request rejected",
                        ).doesNotContain("provider unavailable", "rate_limit_error", "server_error", "not-json")
                }
                assertThat(server.requestCount).describedAs("scenario %s", index).isEqualTo(1)
            }
        }
    }

    @Test
    fun `OpenAI model disables SDK retries and retains the bounded request timeout`() {
        val model = OpenAiSpringAiModelFactory.create("test-api-key", "http://127.0.0.1:1/v1", Duration.ofMinutes(4))

        assertThat(model.options.maxRetries).isZero()
        assertThat(model.options.timeout).isEqualTo(Duration.ofMinutes(4))
    }

    private fun generator(model: org.springframework.ai.openai.OpenAiChatModel) =
        SpringAiWholeTranscriptGroundedGenerator(
            provider = Provider.OPENAI,
            chatClient = ChatClient.create(model),
            codec = GroundedDraftJsonCodec(),
            optionsFactory = optionsFactory(),
            usageMapper = SpringAiUsageMapper(),
            errorMapper = SpringAiErrorMapper(),
        )

    private fun request() = GroundedProviderTestFixture.request(GroundedGenerationSchemaResource().schemaAsString())

    private fun optionsFactory() =
        SpringAiProviderOptionsFactory(
            ModelCapabilityCatalog { model ->
                model
                    .takeIf { it == GroundedProviderTestFixture.model(Provider.OPENAI) }
                    ?.let {
                        ModelCapability(
                            contextWindowTokens = 400_000,
                            maxOutputTokens = 128_000,
                            structuredOutputSupported = true,
                        )
                    }
            },
        )

    private fun successResponse(): ProviderMockHttpServer.Response {
        val content = ObjectMapper().writeValueAsString(GroundedProviderTestFixture.draftNode().toString())
        return ProviderMockHttpServer.Response(
            200,
            """
            {
              "id":"chatcmpl-public-test",
              "object":"chat.completion",
              "created":1784160000,
              "model":"public-test-model",
              "choices":[{
                "index":0,
                "message":{"role":"assistant","content":$content},
                "finish_reason":"stop"
              }],
              "usage":{
                "prompt_tokens":120,
                "completion_tokens":30,
                "total_tokens":150,
                "prompt_tokens_details":{"cached_tokens":20}
              }
            }
            """.trimIndent(),
        )
    }

    private fun errorBody(type: String) =
        """
        {"error":{"message":"provider unavailable","type":"$type","code":"$type"}}
        """.trimIndent()
}
