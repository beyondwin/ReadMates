package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class AiGenerationPostCommitCleanupServiceTest {
    @Test
    fun `cleanup clears pending only after cache and payload cleanup succeed`() {
        val store = FakeJobStore()
        val record = AiGenerationTestFixtures.jobRecord(status = JobStatus.COMMITTING).copy(revision = 3)
        store.save(record)
        store.markCommittedForCleanup(record.jobId, 3)
        val cache = RecordingCache()
        val service = AiGenerationPostCommitCleanupService(store, cache)

        assertThat(service.cleanup(record.jobId, 3, record.clubId)).isTrue()
        assertThat(store.loadMetadata(record.jobId)?.cleanupPending).isFalse()
        assertThat(store.transientPayloadDeleted).containsExactly(record.jobId)
        assertThat(cache.clubs).containsExactly(record.clubId)
    }

    @Test
    fun `cleanup failure retains cleanupPending for cleanup-only recovery`() {
        val store = FakeJobStore()
        val record = AiGenerationTestFixtures.jobRecord(status = JobStatus.COMMITTING).copy(revision = 3)
        store.save(record)
        store.markCommittedForCleanup(record.jobId, 3)
        val service = AiGenerationPostCommitCleanupService(store, RecordingCache(fail = true))

        assertThat(service.cleanup(record.jobId, 3, record.clubId)).isFalse()
        assertThat(store.loadMetadata(record.jobId)?.cleanupPending).isTrue()
    }

    private class RecordingCache(
        private val fail: Boolean = false,
    ) : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
            if (fail) error("synthetic cache failure")
        }
    }
}
