package com.readmates.shared.db

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.LocalDateTime
import java.time.OffsetDateTime

class DbColumnsTest {
    @Test
    fun `converts offset datetime to utc local datetime for mysql`() {
        val value = OffsetDateTime.parse("2026-04-20T15:30:00+09:00")

        assertEquals(LocalDateTime.parse("2026-04-20T06:30:00"), value.toUtcLocalDateTime())
    }

    @Test
    fun `converts utc local datetime back to offset datetime`() {
        val value = LocalDateTime.parse("2026-04-20T06:30:00")

        assertEquals(OffsetDateTime.parse("2026-04-20T06:30:00Z"), value.toUtcOffsetDateTime())
    }
}
