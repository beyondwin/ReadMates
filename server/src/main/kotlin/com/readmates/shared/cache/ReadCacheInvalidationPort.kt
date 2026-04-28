package com.readmates.shared.cache

import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.util.UUID

interface ReadCacheInvalidationPort {
    fun evictClubContent(clubId: UUID)

    fun evictClubContentAfterCommit(clubId: UUID) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                object : TransactionSynchronization {
                    override fun afterCommit() {
                        evictClubContentFailOpen(clubId)
                    }
                },
            )
            return
        }
        evictClubContentFailOpen(clubId)
    }

    private fun evictClubContentFailOpen(clubId: UUID) {
        runCatching {
            evictClubContent(clubId)
        }
    }

    class Noop : ReadCacheInvalidationPort {
        override fun evictClubContent(clubId: UUID) = Unit
    }
}
