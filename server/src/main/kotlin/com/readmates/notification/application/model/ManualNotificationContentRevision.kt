package com.readmates.notification.application.model

import com.readmates.shared.security.Sha256
import java.time.LocalDate
import java.util.UUID

object ManualNotificationContentRevision {
    fun nextBook(
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        visibility: String,
    ): String = Sha256.hex(listOf(sessionId, sessionNumber, bookTitle, visibility).joinToString("|"))

    fun sessionRecord(snapshotSha256: String): String {
        require(snapshotSha256.matches(Regex("^[0-9a-f]{64}$")))
        return snapshotSha256
    }

    fun feedbackDocument(
        sessionId: UUID,
        documentVersion: Int,
    ): String = Sha256.hex(listOf(sessionId, documentVersion).joinToString("|"))

    fun reminder(
        sessionId: UUID,
        date: LocalDate?,
    ): String = Sha256.hex(listOf(sessionId, date).joinToString("|"))
}
