package com.readmates.shared.validation

import jakarta.validation.Constraint
import jakarta.validation.ConstraintValidator
import jakarta.validation.ConstraintValidatorContext
import jakarta.validation.Payload
import kotlin.reflect.KClass

@MustBeDocumented
@Constraint(validatedBy = [CodePointSizeValidator::class])
@Target(
    AnnotationTarget.FIELD,
    AnnotationTarget.PROPERTY_GETTER,
    AnnotationTarget.VALUE_PARAMETER,
    AnnotationTarget.ANNOTATION_CLASS,
)
@Retention(AnnotationRetention.RUNTIME)
annotation class CodePointSize(
    val min: Int = 0,
    val max: Int = Int.MAX_VALUE,
    val message: String = "must contain between {min} and {max} Unicode code points",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = [],
)

class CodePointSizeValidator : ConstraintValidator<CodePointSize, CharSequence> {
    private var min: Int = 0
    private var max: Int = Int.MAX_VALUE

    override fun initialize(annotation: CodePointSize) {
        require(annotation.min >= 0) { "min must be non-negative" }
        require(annotation.max >= annotation.min) { "max must be greater than or equal to min" }
        min = annotation.min
        max = annotation.max
    }

    override fun isValid(
        value: CharSequence?,
        context: ConstraintValidatorContext,
    ): Boolean {
        if (value == null) return true
        val text = value.toString()
        val size = text.codePointCount(0, text.length)
        return size in min..max
    }
}
