@file:Suppress("ktlint:standard:package-name")

package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.model.MyPageResult
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ArchiveWebMapperTest {
    @Test
    fun `my page preserves a stored recognized avatar key`() {
        assertEquals("book-tote", myPageResult("book-tote").toWebDto().avatarKey)
    }

    @Test
    fun `my page falls back for missing or unknown avatar keys`() {
        assertEquals("archive-box", myPageResult(null).toWebDto().avatarKey)
        assertEquals("archive-box", myPageResult("future-avatar").toWebDto().avatarKey)
    }
}

private fun myPageResult(avatarKey: String?) =
    MyPageResult(
        avatarKey = avatarKey,
        displayName = "멤버",
        accountName = "계정",
        email = "member@example.com",
        role = "MEMBER",
        membershipStatus = "ACTIVE",
        clubName = "읽는사이",
        joinedAt = "2026-08",
        sessionCount = 0,
        totalSessionCount = 0,
        completedReadingCount = 0,
        recentAttendances = emptyList(),
    )
