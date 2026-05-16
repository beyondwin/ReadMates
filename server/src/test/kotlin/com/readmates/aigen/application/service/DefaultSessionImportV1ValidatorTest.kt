package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class DefaultSessionImportV1ValidatorTest {

    private val validator = DefaultSessionImportV1Validator(fakeMetrics())

    @Test
    fun `valid snapshot returns Ok`() {
        val result = validator.validate(validSnapshot(), validMeta())

        assertEquals(ValidationResult.Ok, result)
    }

    @Test
    fun `wrong format constant returns SCHEMA_INVALID`() {
        val snapshot = validSnapshot().copy(format = "wrong-format")

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.SCHEMA_INVALID)
    }

    @Test
    fun `session number mismatch returns SCHEMA_INVALID`() {
        val snapshot = validSnapshot().copy(sessionNumber = 8)

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.SCHEMA_INVALID)
    }

    @Test
    fun `book title mismatch returns SCHEMA_INVALID`() {
        val snapshot = validSnapshot().copy(bookTitle = "Different Book")

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.SCHEMA_INVALID)
    }

    @Test
    fun `meeting date mismatch returns SCHEMA_INVALID`() {
        val snapshot = validSnapshot().copy(meetingDate = LocalDate.of(2026, 6, 1))

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.SCHEMA_INVALID)
    }

    @Test
    fun `blank summary returns SCHEMA_INVALID`() {
        val snapshot = validSnapshot().copy(summary = "   ")

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.SCHEMA_INVALID)
    }

    @Test
    fun `blank feedback document file name returns SCHEMA_INVALID`() {
        val snapshot = validSnapshot().copy(feedbackDocumentFileName = "")

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.SCHEMA_INVALID)
    }

    @Test
    fun `blank feedback document markdown returns SCHEMA_INVALID`() {
        val snapshot = validSnapshot().copy(feedbackDocumentMarkdown = "")

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.SCHEMA_INVALID)
    }

    @Test
    fun `highlight author not in expected names returns AUTHOR_NAME_MISMATCH`() {
        val snapshot = validSnapshot().copy(
            highlights = threeHighlightsFor("Alice", "Bob", "Eve"),
        )

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.AUTHOR_NAME_MISMATCH)
    }

    @Test
    fun `one-line review author not in expected names returns AUTHOR_NAME_MISMATCH`() {
        val snapshot = validSnapshot().copy(
            oneLineReviews = listOf(
                SessionImportV1Snapshot.AuthoredText("Alice", "Wonderful."),
                SessionImportV1Snapshot.AuthoredText("Mallory", "Sneaky."),
            ),
        )

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.AUTHOR_NAME_MISMATCH)
    }

    @Test
    fun `highlights count below three returns HIGHLIGHTS_OUT_OF_RANGE`() {
        val snapshot = validSnapshot().copy(
            highlights = listOf(
                SessionImportV1Snapshot.AuthoredText("Alice", "1"),
                SessionImportV1Snapshot.AuthoredText("Bob", "2"),
            ),
        )

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.HIGHLIGHTS_OUT_OF_RANGE)
    }

    @Test
    fun `highlights count above ten returns HIGHLIGHTS_OUT_OF_RANGE`() {
        val snapshot = validSnapshot().copy(
            highlights = (1..11).map {
                SessionImportV1Snapshot.AuthoredText("Alice", "highlight $it")
            },
        )

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.HIGHLIGHTS_OUT_OF_RANGE)
    }

    @Test
    fun `duplicate one-line review author returns ONE_LINE_REVIEWS_DUPLICATE`() {
        val snapshot = validSnapshot().copy(
            oneLineReviews = listOf(
                SessionImportV1Snapshot.AuthoredText("Alice", "First."),
                SessionImportV1Snapshot.AuthoredText("Alice", "Second."),
            ),
        )

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.ONE_LINE_REVIEWS_DUPLICATE)
    }

    @Test
    fun `feedback markdown missing template marker returns FEEDBACK_TEMPLATE_INVALID`() {
        val snapshot = validSnapshot().copy(
            feedbackDocumentMarkdown = "# 독서모임 7차 피드백\nbody",
        )

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.FEEDBACK_TEMPLATE_INVALID)
    }

    @Test
    fun `feedback markdown missing required header returns FEEDBACK_TEMPLATE_INVALID`() {
        val snapshot = validSnapshot().copy(
            feedbackDocumentMarkdown = "<!-- readmates-feedback:v1 -->\nno header here",
        )

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.FEEDBACK_TEMPLATE_INVALID)
    }

    @Test
    fun `feedback markdown with wrong session number in header returns FEEDBACK_TEMPLATE_INVALID`() {
        val snapshot = validSnapshot().copy(
            feedbackDocumentMarkdown = "<!-- readmates-feedback:v1 -->\n# 독서모임 9차 피드백\n",
        )

        val result = validator.validate(snapshot, validMeta())

        assertViolation(result, ErrorCode.FEEDBACK_TEMPLATE_INVALID)
    }

    private fun assertViolation(result: ValidationResult, expectedCode: ErrorCode) {
        assertTrue(result is ValidationResult.Violation, "Expected Violation, got $result")
        val violation = result as ValidationResult.Violation
        assertEquals(expectedCode, violation.code)
    }

    private fun validMeta(): SessionMeta = SessionMeta(
        sessionId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
        sessionNumber = 7,
        bookTitle = "Test Book",
        bookAuthor = "Author Author",
        meetingDate = LocalDate.of(2026, 5, 16),
        expectedAuthorNames = listOf("Alice", "Bob", "Carol"),
        authorNameMode = AuthorNameMode.REAL,
    )

    private fun validSnapshot(): SessionImportV1Snapshot = SessionImportV1Snapshot(
        format = "readmates-session-import:v1",
        sessionNumber = 7,
        bookTitle = "Test Book",
        meetingDate = LocalDate.of(2026, 5, 16),
        summary = "An interesting discussion.",
        highlights = threeHighlightsFor("Alice", "Bob", "Carol"),
        oneLineReviews = listOf(
            SessionImportV1Snapshot.AuthoredText("Alice", "Wonderful."),
            SessionImportV1Snapshot.AuthoredText("Bob", "Solid."),
        ),
        feedbackDocumentFileName = "feedback.md",
        feedbackDocumentMarkdown = "<!-- readmates-feedback:v1 -->\n# 독서모임 7차 피드백\nbody",
    )

    private fun threeHighlightsFor(vararg authors: String): List<SessionImportV1Snapshot.AuthoredText> =
        authors.map { SessionImportV1Snapshot.AuthoredText(it, "$it's highlight") }
}
