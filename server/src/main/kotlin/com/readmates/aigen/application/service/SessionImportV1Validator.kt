package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta

/**
 * Validates an AI-generated [SessionImportV1Snapshot] against domain rules
 * (schema shape, attendee author-name match, highlights count, one-line review
 * uniqueness, feedback-template marker, etc.). Returns [ValidationResult.Ok]
 * when the snapshot satisfies all rules, or [ValidationResult.Violation] with
 * a domain [ErrorCode] when it does not.
 *
 * NOTE — this is the interface only. Task task_1_8 provides the concrete
 * implementation. Domain services in this task (worker, commit, regen) depend
 * on this interface so they remain testable with a fake validator.
 */
interface SessionImportV1Validator {
    fun validate(snapshot: SessionImportV1Snapshot, sessionMeta: SessionMeta): ValidationResult
}

sealed class ValidationResult {
    object Ok : ValidationResult()

    data class Violation(
        val code: ErrorCode,
        val message: String = code.name,
    ) : ValidationResult()
}
