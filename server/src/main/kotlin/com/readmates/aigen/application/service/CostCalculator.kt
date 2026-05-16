package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.TokenUsage
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Pure stateless cost estimator.
 *
 * Computes USD cost from a [TokenUsage] / [ModelPricing] pair. Each pricing column is
 * applied independently:
 *   cost = (input * inputPerM + cachedInput * cachedInputPerM + output * outputPerM) / 1_000_000
 *
 * Result is normalised to scale 4 with HALF_UP rounding so it matches the
 * `cost_estimate_usd DECIMAL(8,4)` audit column.
 */
object CostCalculator {

    /** Pricing is quoted per *million* tokens, so usage * price is divided by this denominator. */
    private val TOKENS_PER_PRICING_UNIT: BigDecimal = BigDecimal(TOKENS_PER_PRICING_UNIT_LONG)

    private const val TOKENS_PER_PRICING_UNIT_LONG: Long = 1_000_000L
    private const val SCALE: Int = 4

    fun estimate(usage: TokenUsage, pricing: ModelPricing): BigDecimal {
        val input = BigDecimal(usage.inputTokens).multiply(pricing.inputPerMTokenUsd)
        val cached = BigDecimal(usage.cachedInputTokens).multiply(pricing.cachedInputPerMTokenUsd)
        val output = BigDecimal(usage.outputTokens).multiply(pricing.outputPerMTokenUsd)
        val total = input.add(cached).add(output)
        return total.divide(TOKENS_PER_PRICING_UNIT, SCALE, RoundingMode.HALF_UP)
    }
}
