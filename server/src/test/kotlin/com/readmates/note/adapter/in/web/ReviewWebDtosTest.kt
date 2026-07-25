@file:Suppress("ktlint:standard:package-name")

package com.readmates.note.adapter.`in`.web

import jakarta.validation.Validation
import jakarta.validation.constraints.NotBlank
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ReviewWebDtosTest {
    private val validator = Validation.buildDefaultValidatorFactory().validator

    @Test
    fun `blank one line review violates the text NotBlank rule`() {
        val violations = validator.validate(OneLineReviewRequest(text = " "))

        assertEquals(1, violations.size)
        val violation = violations.single()
        assertEquals("text", violation.propertyPath.toString())
        assertEquals(NotBlank::class, violation.constraintDescriptor.annotation.annotationClass)
    }
}
