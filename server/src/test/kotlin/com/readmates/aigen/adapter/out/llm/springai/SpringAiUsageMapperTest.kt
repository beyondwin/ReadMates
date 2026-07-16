package com.readmates.aigen.adapter.out.llm.springai

import com.readmates.aigen.application.model.Provider
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.metadata.DefaultUsage

class SpringAiUsageMapperTest {
    @Test
    fun `maps complete generic gross usage to all four channels`() {
        val usage = DefaultUsage(120, 30, 150, null, 20, 10)

        val mapped = SpringAiUsageMapper().map(Provider.OPENAI, usage, cacheEnabled = true)

        assertThat(mapped.usage.nonCachedInputTokens).isEqualTo(90)
        assertThat(mapped.usage.cacheWriteInputTokens).isEqualTo(10)
        assertThat(mapped.usage.cacheReadInputTokens).isEqualTo(20)
        assertThat(mapped.usage.outputTokens).isEqualTo(30)
        assertThat(mapped.usageComplete).isTrue()
    }

    @Test
    fun `uses only the registered provider native extractor to complete cache channels`() {
        val native = NativeFixture("opaque-native-response")
        val usage = DefaultUsage(77, 13, 90, native)
        val mapper =
            SpringAiUsageMapper(
                nativeExtractors =
                    mapOf(
                        Provider.CLAUDE to
                            SpringAiNativeUsageExtractor { value ->
                                (value as? NativeFixture)?.let {
                                    SpringAiNativeUsage(
                                        nonCachedInputTokens = 40,
                                        cacheWriteInputTokens = 25,
                                        cacheReadInputTokens = 12,
                                        outputTokens = 13,
                                    )
                                }
                            },
                    ),
            )

        val mapped = mapper.map(Provider.CLAUDE, usage, cacheEnabled = true)

        assertThat(mapped.usage.nonCachedInputTokens).isEqualTo(40)
        assertThat(mapped.usage.cacheWriteInputTokens).isEqualTo(25)
        assertThat(mapped.usage.cacheReadInputTokens).isEqualTo(12)
        assertThat(mapped.usage.outputTokens).isEqualTo(13)
        assertThat(mapped.usageComplete).isTrue()
    }

    @Test
    fun `marks cache usage incomplete when read or write breakdown is absent`() {
        val usage = DefaultUsage(120, 30, 150, null)

        val mapped = SpringAiUsageMapper().map(Provider.CLAUDE, usage, cacheEnabled = true)

        assertThat(mapped.usageComplete).isFalse()
        assertThat(mapped.usage.nonCachedInputTokens).isEqualTo(120)
        assertThat(mapped.usage.cacheWriteInputTokens).isZero()
        assertThat(mapped.usage.cacheReadInputTokens).isZero()
        assertThat(mapped.usage.outputTokens).isEqualTo(30)
    }

    private data class NativeFixture(
        val value: String,
    )
}
