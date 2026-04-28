package com.readmates.shared.cache

import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.util.UUID

class ReadCacheInvalidationPortTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")

    @Test
    fun `evicts after commit when transaction synchronization is active`() {
        val invalidation = RecordingReadCacheInvalidationPort()

        TransactionSynchronizationManager.initSynchronization()
        try {
            invalidation.evictClubContentAfterCommit(clubId)

            assertEquals(emptyList<UUID>(), invalidation.clubs)

            TransactionSynchronizationManager.getSynchronizations().forEach { synchronization ->
                synchronization.afterCommit()
            }

            assertEquals(listOf(clubId), invalidation.clubs)
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    @Test
    fun `evicts immediately and fail-open when transaction synchronization is inactive`() {
        val invalidation = ThrowingReadCacheInvalidationPort()

        assertDoesNotThrow {
            invalidation.evictClubContentAfterCommit(clubId)
        }

        assertEquals(1, invalidation.attempts)
    }

    @Test
    fun `after commit invalidation failure is fail-open`() {
        val invalidation = ThrowingReadCacheInvalidationPort()

        TransactionSynchronizationManager.initSynchronization()
        try {
            invalidation.evictClubContentAfterCommit(clubId)

            assertDoesNotThrow {
                TransactionSynchronizationManager.getSynchronizations().forEach { synchronization ->
                    synchronization.afterCommit()
                }
            }

            assertEquals(1, invalidation.attempts)
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    private class RecordingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
        }
    }

    private class ThrowingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        var attempts = 0

        override fun evictClubContent(clubId: UUID) {
            attempts += 1
            throw IllegalStateException("invalidation failed")
        }
    }
}
