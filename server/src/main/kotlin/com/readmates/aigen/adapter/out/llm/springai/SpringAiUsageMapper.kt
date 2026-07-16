package com.readmates.aigen.adapter.out.llm.springai

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import org.springframework.ai.chat.metadata.Usage

data class SpringAiNativeUsage(
    val nonCachedInputTokens: Long? = null,
    val cacheWriteInputTokens: Long? = null,
    val cacheReadInputTokens: Long? = null,
    val outputTokens: Long? = null,
)

fun interface SpringAiNativeUsageExtractor {
    fun extract(nativeUsage: Any?): SpringAiNativeUsage?
}

data class SpringAiProviderNativeUsageExtractor(
    val provider: Provider,
    val extractor: SpringAiNativeUsageExtractor,
)

data class SpringAiUsageMapping(
    val usage: TokenUsage,
    val usageComplete: Boolean,
)

/** Maps only Spring AI generic fields and explicitly registered native strategies. */
class SpringAiUsageMapper(
    private val nativeExtractors: Map<Provider, SpringAiNativeUsageExtractor> = emptyMap(),
) {
    fun map(
        provider: Provider,
        usage: Usage?,
        cacheEnabled: Boolean,
        promptIncludesCache: Boolean = true,
    ): SpringAiUsageMapping {
        val native =
            runCatching { nativeExtractors[provider]?.extract(usage?.nativeUsage) }
                .getOrNull()
        return if (provider == Provider.OPENAI) {
            mapOpenAi(usage, native)
        } else {
            mapGeneric(usage, native, cacheEnabled, promptIncludesCache)
        }
    }

    private fun mapGeneric(
        usage: Usage?,
        native: SpringAiNativeUsage?,
        cacheEnabled: Boolean,
        promptIncludesCache: Boolean,
    ): SpringAiUsageMapping {
        val prompt = usage?.promptTokens?.toLong()
        val output = native?.outputTokens ?: usage?.completionTokens?.toLong()
        val cacheRead = native?.cacheReadInputTokens ?: usage?.cacheReadInputTokens
        val cacheWrite = native?.cacheWriteInputTokens ?: usage?.cacheWriteInputTokens
        val nonCached =
            native?.nonCachedInputTokens
                ?: prompt?.let { total ->
                    if (promptIncludesCache) {
                        total - (cacheRead ?: 0L) - (cacheWrite ?: 0L)
                    } else {
                        total
                    }
                }

        val cacheBreakdownComplete = !cacheEnabled || (cacheRead != null && cacheWrite != null)
        val values = listOf(nonCached, cacheRead ?: 0L, cacheWrite ?: 0L, output)
        val complete = cacheBreakdownComplete && values.all { it != null && it >= 0 }

        return SpringAiUsageMapping(
            usage =
                TokenUsage(
                    nonCachedInputTokens = nonCached.safeTokenCount(),
                    cacheWriteInputTokens = cacheWrite.safeTokenCount(),
                    cacheReadInputTokens = cacheRead.safeTokenCount(),
                    outputTokens = output.safeTokenCount(),
                ),
            usageComplete = complete,
        )
    }

    private fun mapOpenAi(
        usage: Usage?,
        native: SpringAiNativeUsage?,
    ): SpringAiUsageMapping {
        val prompt = usage?.promptTokens?.toLong()
        val cacheRead = native?.cacheReadInputTokens ?: usage?.cacheReadInputTokens ?: 0L
        val output = native?.outputTokens ?: usage?.completionTokens?.toLong()
        val total = usage?.totalTokens?.toLong()
        val nonCached = prompt?.minus(cacheRead)
        val complete =
            prompt != null &&
                output != null &&
                total != null &&
                cacheRead >= 0 &&
                nonCached != null &&
                nonCached >= 0 &&
                total >= 0 &&
                total == prompt + output

        return SpringAiUsageMapping(
            usage =
                TokenUsage(
                    nonCachedInputTokens = nonCached.safeTokenCount(),
                    cacheWriteInputTokens = 0,
                    cacheReadInputTokens = cacheRead.safeTokenCount(),
                    outputTokens = output.safeTokenCount(),
                ),
            usageComplete = complete,
        )
    }

    private fun Long?.safeTokenCount(): Long = this?.coerceAtLeast(0) ?: 0
}
