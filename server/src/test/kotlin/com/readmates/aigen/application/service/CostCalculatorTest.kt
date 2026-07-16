package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.TokenUsage
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class CostCalculatorTest {
    private val pricing =
        ModelPricing(
            inputPerMTokenUsd = BigDecimal("3.00"),
            cacheWriteInputPerMTokenUsd = BigDecimal("3.75"),
            cachedInputPerMTokenUsd = BigDecimal("0.30"),
            outputPerMTokenUsd = BigDecimal("15.00"),
        )

    @Test
    fun `actual prices all four usage channels independently`() {
        val usage =
            TokenUsage(
                nonCachedInputTokens = 1_000_000,
                cacheWriteInputTokens = 1_000_000,
                cacheReadInputTokens = 1_000_000,
                outputTokens = 1_000_000,
            )

        assertThat(CostCalculator.actual(usage, pricing)).isEqualByComparingTo("22.05")
        assertThat(usage.publicInputTokens).isEqualTo(2_000_000)
        assertThat(usage.publicCachedInputTokens).isEqualTo(1_000_000)
    }

    @Test
    fun `actual rounds only after summing all channels`() {
        val usage =
            TokenUsage(
                nonCachedInputTokens = 25,
                cacheWriteInputTokens = 25,
                cacheReadInputTokens = 25,
                outputTokens = 25,
            )
        val unitPricing =
            ModelPricing(
                inputPerMTokenUsd = BigDecimal.ONE,
                cacheWriteInputPerMTokenUsd = BigDecimal.ONE,
                cachedInputPerMTokenUsd = BigDecimal.ONE,
                outputPerMTokenUsd = BigDecimal.ONE,
            )

        assertThat(CostCalculator.actual(usage, unitPricing)).isEqualByComparingTo("0.0001")
    }

    @Test
    fun `worst case uses cache write premium when cache writing is possible`() {
        assertThat(
            CostCalculator.worstCase(
                estimatedInputTokens = 1_000_000,
                maxOutputTokens = 1_000_000,
                pricing = pricing,
                cacheWritePossible = true,
            ),
        ).isEqualByComparingTo("18.75")
    }

    @Test
    fun `worst case uses normal input price when cache writing is impossible`() {
        assertThat(
            CostCalculator.worstCase(
                estimatedInputTokens = 1_000_000,
                maxOutputTokens = 1_000_000,
                pricing = pricing,
                cacheWritePossible = false,
            ),
        ).isEqualByComparingTo("18.00")
    }

    @Test
    fun `token usage rejects a negative count in every channel`() {
        val negativeUsages =
            listOf<() -> TokenUsage>(
                {
                    TokenUsage(
                        nonCachedInputTokens = -1,
                        cacheWriteInputTokens = 0,
                        cacheReadInputTokens = 0,
                        outputTokens = 0,
                    )
                },
                {
                    TokenUsage(
                        nonCachedInputTokens = 0,
                        cacheWriteInputTokens = -1,
                        cacheReadInputTokens = 0,
                        outputTokens = 0,
                    )
                },
                {
                    TokenUsage(
                        nonCachedInputTokens = 0,
                        cacheWriteInputTokens = 0,
                        cacheReadInputTokens = -1,
                        outputTokens = 0,
                    )
                },
                {
                    TokenUsage(
                        nonCachedInputTokens = 0,
                        cacheWriteInputTokens = 0,
                        cacheReadInputTokens = 0,
                        outputTokens = -1,
                    )
                },
            )

        negativeUsages.forEach { construct ->
            assertThatThrownBy { construct() }
                .isInstanceOf(IllegalArgumentException::class.java)
        }
    }

    @Test
    fun `ZERO and plus preserve all four channels`() {
        val first =
            TokenUsage(
                nonCachedInputTokens = 1,
                cacheWriteInputTokens = 2,
                cacheReadInputTokens = 3,
                outputTokens = 4,
            )
        val second =
            TokenUsage(
                nonCachedInputTokens = 10,
                cacheWriteInputTokens = 20,
                cacheReadInputTokens = 30,
                outputTokens = 40,
            )

        assertThat(TokenUsage.ZERO + first).isEqualTo(first)
        assertThat(first + TokenUsage.ZERO).isEqualTo(first)
        assertThat(first + second).isEqualTo(
            TokenUsage(
                nonCachedInputTokens = 11,
                cacheWriteInputTokens = 22,
                cacheReadInputTokens = 33,
                outputTokens = 44,
            ),
        )
    }
}
