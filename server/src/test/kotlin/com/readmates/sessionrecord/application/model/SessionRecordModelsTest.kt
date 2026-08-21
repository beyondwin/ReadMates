package com.readmates.sessionrecord.application.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SessionRecordModelsTest {
    @Test
    fun `record visibility preserves the exact public enum contract`() {
        assertEquals(
            listOf("HOST_ONLY", "MEMBER", "PUBLIC"),
            SessionRecordVisibility.entries.map { it.name },
        )
    }

    @Test
    fun `history types expose the exact cross-source sort policy`() {
        assertEquals(
            mapOf(
                HostSessionHistoryType.BASIC_INFO_UPDATED to 10,
                HostSessionHistoryType.ATTENDANCE_UPDATED to 20,
                HostSessionHistoryType.RECORD_REVISION_APPLIED to 30,
                HostSessionHistoryType.RECORD_REVISION_RESTORED to 40,
                HostSessionHistoryType.NOTIFICATION_SENT to 50,
                HostSessionHistoryType.NOTIFICATION_SKIPPED to 60,
                HostSessionHistoryType.SESSION_OPENED to 70,
                HostSessionHistoryType.SESSION_CLOSED to 80,
                HostSessionHistoryType.SESSION_PUBLISHED to 90,
                HostSessionHistoryType.SESSION_REOPENED to 100,
                HostSessionHistoryType.SESSION_UNPUBLISHED to 110,
                HostSessionHistoryType.SESSION_RETURNED_TO_DRAFT to 120,
                HostSessionHistoryType.SESSION_DELETED to 130,
                HostSessionHistoryType.SESSION_RESTORED to 140,
            ),
            HostSessionHistoryType.entries.associateWith(HostSessionHistoryType::typeSort),
        )
    }

    @Test
    fun `draft sources exclude baseline`() {
        assertEquals(
            setOf("MANUAL", "JSON_IMPORT", "AI_GENERATED", "RESTORED"),
            SessionRecordDraftSource.entries.map { it.name }.toSet(),
        )
    }
}
