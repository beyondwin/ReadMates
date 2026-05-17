package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Default rule-based validator for [SessionImportV1Snapshot].
 *
 * Implements the validation rules from the AI Generation spec (§9.1, §9.3):
 *   1. SCHEMA_INVALID         — format constant, required non-blank fields and session
 *                                metadata consistency (sessionNumber/bookTitle/meetingDate)
 *   2. AUTHOR_NAME_MISMATCH   — every authorName in highlights/oneLineReviews must be
 *                                present in [SessionMeta.expectedAuthorNames]
 *   3. HIGHLIGHTS_OUT_OF_RANGE — highlights size must be in 3..10 (inclusive)
 *   4. ONE_LINE_REVIEWS_DUPLICATE — no duplicate authorName among one-line reviews
 *   5. FEEDBACK_TEMPLATE_INVALID — markdown must start with `<!-- readmates-feedback:v1 -->`
 *                                   AND contain `# 독서모임 {sessionNumber}차 피드백`
 *
 * Rules are evaluated in order; the first violation is returned.
 *
 * The JSON Schema in `SessionImportSchemaResource` is the source-of-truth shape for
 * provider adapters (Claude tool input_schema, OpenAI response_format, Gemini
 * responseSchema). At validation time the snapshot is already a typed Kotlin data
 * class, so the type-level guarantees from deserialisation are sufficient — we only
 * re-check value-level invariants (constants, non-blank, metadata consistency) and
 * the domain rules above.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class DefaultSessionImportV1Validator(
    private val metrics: AiGenerationMetrics,
) : SessionImportV1Validator {

    override fun validate(
        snapshot: SessionImportV1Snapshot,
        sessionMeta: SessionMeta,
    ): ValidationResult {
        val violation = checkSchema(snapshot, sessionMeta)
            ?: checkAuthorNames(snapshot, sessionMeta)
            ?: checkHighlightsRange(snapshot)
            ?: checkOneLineReviewDuplicates(snapshot)
            ?: checkFeedbackTemplate(snapshot, sessionMeta)
        if (violation != null) {
            metrics.recordValidationFailure(violation.code)
            return violation
        }
        return ValidationResult.Ok
    }

    private fun checkSchema(
        snapshot: SessionImportV1Snapshot,
        meta: SessionMeta,
    ): ValidationResult.Violation? =
        sequenceOf<() -> ValidationResult.Violation?>(
            {
                if (snapshot.format != FORMAT_CONST) {
                    schemaInvalid("format must equal '$FORMAT_CONST' (was '${snapshot.format}')")
                } else {
                    null
                }
            },
            {
                if (snapshot.sessionNumber != meta.sessionNumber) {
                    schemaInvalid(
                        "session metadata mismatch: sessionNumber " +
                            "(snapshot=${snapshot.sessionNumber}, expected=${meta.sessionNumber})",
                    )
                } else {
                    null
                }
            },
            {
                if (snapshot.bookTitle != meta.bookTitle) {
                    schemaInvalid("session metadata mismatch: bookTitle")
                } else {
                    null
                }
            },
            {
                if (!snapshot.meetingDate.isEqual(meta.meetingDate)) {
                    schemaInvalid("session metadata mismatch: meetingDate")
                } else {
                    null
                }
            },
            { if (snapshot.summary.isBlank()) schemaInvalid("summary must not be blank") else null },
            {
                if (snapshot.feedbackDocumentFileName.isBlank()) {
                    schemaInvalid("feedbackDocumentFileName must not be blank")
                } else {
                    null
                }
            },
            {
                if (snapshot.feedbackDocumentMarkdown.isBlank()) {
                    schemaInvalid("feedbackDocumentMarkdown must not be blank")
                } else {
                    null
                }
            },
        ).mapNotNull { it.invoke() }.firstOrNull()

    private fun checkAuthorNames(
        snapshot: SessionImportV1Snapshot,
        meta: SessionMeta,
    ): ValidationResult.Violation? {
        val expected = meta.expectedAuthorNames.toSet()
        val offenders = (snapshot.highlights + snapshot.oneLineReviews)
            .map { it.authorName }
            .filter { it !in expected }
            .distinct()
        if (offenders.isNotEmpty()) {
            return ValidationResult.Violation(
                ErrorCode.AUTHOR_NAME_MISMATCH,
                "Unknown authorName(s) not in expectedAuthorNames: $offenders",
            )
        }
        return null
    }

    private fun checkHighlightsRange(snapshot: SessionImportV1Snapshot): ValidationResult.Violation? {
        val n = snapshot.highlights.size
        if (n !in HIGHLIGHTS_RANGE) {
            return ValidationResult.Violation(
                ErrorCode.HIGHLIGHTS_OUT_OF_RANGE,
                "highlights count must be in $HIGHLIGHTS_RANGE (was $n)",
            )
        }
        return null
    }

    private fun checkOneLineReviewDuplicates(snapshot: SessionImportV1Snapshot): ValidationResult.Violation? {
        val duplicates = snapshot.oneLineReviews
            .groupingBy { it.authorName }
            .eachCount()
            .filterValues { it > 1 }
            .keys
        if (duplicates.isNotEmpty()) {
            return ValidationResult.Violation(
                ErrorCode.ONE_LINE_REVIEWS_DUPLICATE,
                "Duplicate one-line-review author(s): $duplicates",
            )
        }
        return null
    }

    private fun checkFeedbackTemplate(
        snapshot: SessionImportV1Snapshot,
        meta: SessionMeta,
    ): ValidationResult.Violation? {
        val markdown = snapshot.feedbackDocumentMarkdown
        val expectedHeader = "# 독서모임 ${meta.sessionNumber}차 피드백"
        val violation =
            when {
                !markdown.trimStart().startsWith(FEEDBACK_MARKER) ->
                    ValidationResult.Violation(
                        ErrorCode.FEEDBACK_TEMPLATE_INVALID,
                        "feedbackDocumentMarkdown must start with '$FEEDBACK_MARKER'",
                    )
                !markdown.contains(expectedHeader) ->
                    ValidationResult.Violation(
                        ErrorCode.FEEDBACK_TEMPLATE_INVALID,
                        "feedbackDocumentMarkdown must contain header '$expectedHeader'",
                    )
                else -> null
            }
        return violation
    }

    private fun schemaInvalid(message: String): ValidationResult.Violation =
        ValidationResult.Violation(ErrorCode.SCHEMA_INVALID, message)

    private companion object {
        const val FORMAT_CONST = "readmates-session-import:v1"
        const val FEEDBACK_MARKER = "<!-- readmates-feedback:v1 -->"
        val HIGHLIGHTS_RANGE = 3..10
    }
}
