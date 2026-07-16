package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.TokenUsage
import java.math.BigDecimal
import java.math.RoundingMode

/** Pure stateless calculator for actual and reserved worst-case AI cost. */
object CostCalculator {
    private val TOKENS_PER_PRICING_UNIT: BigDecimal = BigDecimal(TOKENS_PER_PRICING_UNIT_LONG)
    private const val TOKENS_PER_PRICING_UNIT_LONG: Long = 1_000_000L
    private const val SCALE: Int = 4

    fun actual(
        usage: TokenUsage,
        pricing: ModelPricing,
    ): BigDecimal {
        val total =
            priced(usage.nonCachedInputTokens, pricing.inputPerMTokenUsd)
                .add(priced(usage.cacheWriteInputTokens, pricing.cacheWriteInputPerMTokenUsd))
                .add(priced(usage.cacheReadInputTokens, pricing.cachedInputPerMTokenUsd))
                .add(priced(usage.outputTokens, pricing.outputPerMTokenUsd))
        return persistedPrecision(total)
    }

    fun worstCase(
        estimatedInputTokens: Long,
        maxOutputTokens: Long,
        pricing: ModelPricing,
        cacheWritePossible: Boolean,
    ): BigDecimal {
        val inputPrice =
            if (cacheWritePossible) {
                pricing.inputPerMTokenUsd.max(pricing.cacheWriteInputPerMTokenUsd)
            } else {
                pricing.inputPerMTokenUsd
            }
        val total =
            priced(estimatedInputTokens, inputPrice)
                .add(priced(maxOutputTokens, pricing.outputPerMTokenUsd))
        return persistedPrecision(total)
    }

    private fun priced(
        tokens: Long,
        pricePerMillionTokens: BigDecimal,
    ): BigDecimal = BigDecimal(tokens).multiply(pricePerMillionTokens)

    private fun persistedPrecision(unscaledTotal: BigDecimal): BigDecimal =
        unscaledTotal.divide(TOKENS_PER_PRICING_UNIT, SCALE, RoundingMode.HALF_UP)
}
