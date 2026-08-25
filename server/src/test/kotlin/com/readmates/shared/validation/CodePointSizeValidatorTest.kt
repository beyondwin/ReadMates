package com.readmates.shared.validation

import jakarta.validation.Validation
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class CodePointSizeValidatorTest {
    private val validator = Validation.buildDefaultValidatorFactory().validator

    @Test
    fun `counts Unicode code points instead of UTF-16 code units`() {
        assertThat(violations(null)).isZero()
        assertThat(violations("📚📚📚")).isZero()
        assertThat(violations("📚📚📚📚")).isOne()
        assertThat(violations("e\u0301e")).isZero()
        assertThat(violations("e\u0301e\u0301")).isOne()
        assertThat(violations("abc")).isZero()
        assertThat(violations("abcd")).isOne()
    }

    private fun violations(value: String?): Int = validator.validate(CodePointLimited(value)).size

    private data class CodePointLimited(
        @field:CodePointSize(max = 3)
        val value: String?,
    )
}
