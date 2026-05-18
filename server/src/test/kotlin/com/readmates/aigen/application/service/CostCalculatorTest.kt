package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.TokenUsage
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class CostCalculatorTest {
    @Test
    fun `estimate computes input plus cached plus output divided by million scaled to 4 decimals`() {
        // 1M input @ $3 => $3.0000
        // 500K cached @ $0.30 => $0.1500
        // 500K output @ $15 => $7.5000
        // total: $10.6500
        val usage =
            TokenUsage(
                inputTokens = 1_000_000L,
                cachedInputTokens = 500_000L,
                outputTokens = 500_000L,
            )
        val pricing =
            ModelPricing(
                inputPerMTokenUsd = BigDecimal("3"),
                cachedInputPerMTokenUsd = BigDecimal("0.30"),
                outputPerMTokenUsd = BigDecimal("15"),
            )

        val cost = CostCalculator.estimate(usage, pricing)

        assertEquals(BigDecimal("10.6500"), cost)
    }

    @Test
    fun `estimate with zero pricing returns zero at scale 4`() {
        val usage =
            TokenUsage(
                inputTokens = 5_000L,
                cachedInputTokens = 3_000L,
                outputTokens = 2_000L,
            )
        val pricing =
            ModelPricing(
                inputPerMTokenUsd = BigDecimal.ZERO,
                cachedInputPerMTokenUsd = BigDecimal.ZERO,
                outputPerMTokenUsd = BigDecimal.ZERO,
            )

        val cost = CostCalculator.estimate(usage, pricing)

        assertEquals(BigDecimal("0.0000"), cost)
    }

    @Test
    fun `estimate with zero usage returns zero at scale 4`() {
        val usage = TokenUsage(0L, 0L, 0L)
        val pricing =
            ModelPricing(
                inputPerMTokenUsd = BigDecimal("3"),
                cachedInputPerMTokenUsd = BigDecimal("0.30"),
                outputPerMTokenUsd = BigDecimal("15"),
            )

        val cost = CostCalculator.estimate(usage, pricing)

        assertEquals(BigDecimal("0.0000"), cost)
    }
}
