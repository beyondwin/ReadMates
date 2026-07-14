package com.readmates.aigen.application.service

import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.util.UUID

@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationPostCommitCleanupService(
    private val jobStore: AiGenerationJobStore,
    private val cacheInvalidation: ReadCacheInvalidationPort,
) {
    /** Idempotent cleanup. The pending bit is cleared only when every cleanup step succeeds. */
    fun cleanup(
        jobId: UUID,
        revision: Long,
        clubId: UUID,
    ): Boolean {
        val cacheCleaned = cacheInvalidation.evictClubContentStrict(clubId)
        val payloadCleaned = runCatching { jobStore.deleteTransientPayload(jobId) }.isSuccess
        return cacheCleaned && payloadCleaned && jobStore.markCleanupComplete(jobId, revision)
    }
}
