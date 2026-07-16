package com.readmates.aigen.adapter.out.llm.springai

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import org.springframework.ai.chat.metadata.Usage
import org.springframework.ai.google.genai.metadata.GoogleGenAiUsage

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
    ): SpringAiUsageMapping {
        val registeredNative =
            runCatching { nativeExtractors[provider]?.extract(usage?.nativeUsage) }
                .getOrNull()
        val native =
            registeredNative
                ?: if (provider == Provider.CLAUDE) AnthropicNativeUsage.extract(usage?.nativeUsage) else null
        return when (provider) {
            Provider.OPENAI -> mapOpenAi(usage, native)
            Provider.CLAUDE -> mapAnthropic(usage, native, cacheEnabled)
            Provider.GEMINI -> mapGoogle(usage, native)
        }
    }

    /** Google prompt count is gross input; this plan never creates cached content. */
    private fun mapGoogle(
        usage: Usage?,
        native: SpringAiNativeUsage?,
    ): SpringAiUsageMapping {
        val prompt = usage?.promptTokens?.toLong()
        val cacheRead = native?.cacheReadInputTokens ?: usage?.cacheReadInputTokens ?: 0L
        val output = native?.outputTokens ?: usage?.completionTokens?.toLong()
        val total = usage?.totalTokens?.toLong()
        val nonCached = native?.nonCachedInputTokens ?: prompt?.minus(cacheRead)
        val nativeMetadataPresent = usage !is GoogleGenAiUsage || usage.nativeUsage != null
        val complete =
            nativeMetadataPresent && prompt != null && output != null && total != null &&
                cacheRead >= 0 && nonCached != null && nonCached >= 0 &&
                total >= 0 && total == prompt + output
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

    private fun mapAnthropic(
        usage: Usage?,
        native: SpringAiNativeUsage?,
        cacheEnabled: Boolean,
    ): SpringAiUsageMapping {
        val nonCached = preferNative(native?.nonCachedInputTokens, usage?.promptTokens?.toLong())
        val cacheRead = preferNative(native?.cacheReadInputTokens, usage?.cacheReadInputTokens)
        val cacheWrite = preferNative(native?.cacheWriteInputTokens, usage?.cacheWriteInputTokens)
        val output = preferNative(native?.outputTokens, usage?.completionTokens?.toLong())
        val total = usage?.totalTokens?.toLong()
        val cacheBreakdownComplete = !cacheEnabled || (cacheRead != null && cacheWrite != null)
        val values = listOf(nonCached, cacheRead ?: 0L, cacheWrite ?: 0L, output)
        val totalConsistent =
            native != null || total == null || (nonCached != null && output != null && total == nonCached + output)
        val complete = cacheBreakdownComplete && totalConsistent && values.all { it != null && it >= 0 }

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

    private fun preferNative(
        native: Long?,
        generic: Long?,
    ): Long? = native ?: generic
}

private object AnthropicNativeUsage {
    fun extract(value: Any?): SpringAiNativeUsage? {
        if (value == null) return null
        return runCatching {
            SpringAiNativeUsage(
                nonCachedInputTokens = value.requiredLong("inputTokens"),
                cacheWriteInputTokens = value.optionalLong("cacheCreationInputTokens"),
                cacheReadInputTokens = value.optionalLong("cacheReadInputTokens"),
                outputTokens = value.requiredLong("outputTokens"),
            )
        }.getOrNull()
    }

    private fun Any.requiredLong(method: String): Long = (javaClass.getMethod(method).invoke(this) as Number).toLong()

    private fun Any.optionalLong(method: String): Long? {
        val result = javaClass.getMethod(method).invoke(this)
        return when (result) {
            is java.util.Optional<*> -> (result.orElse(null) as? Number)?.toLong()
            is Number -> result.toLong()
            else -> null
        }
    }
}
