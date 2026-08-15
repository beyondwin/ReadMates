package com.readmates.aigen.adapter.out.redis

import java.util.UUID

internal const val ACTIVE_JOBS_KEY = "aigen:jobs:active"
internal const val ACTIVE_INDEX_EPOCH_KEY = "aigen:jobs:active:epoch"
internal const val PROCESSING_RECOVERY_KEY = "aigen:jobs:processing-recovery"
internal const val PROCESSING_QUARANTINE_KEY = "aigen:jobs:processing-recovery:quarantine"
internal const val COMMIT_RECOVERY_JOBS_KEY = "aigen:jobs:commit-recovery"

internal class AiGenerationRedisKeyspace {
    val activeJobs = ACTIVE_JOBS_KEY
    val activeIndexEpoch = ACTIVE_INDEX_EPOCH_KEY
    val processingRecovery = PROCESSING_RECOVERY_KEY
    val processingQuarantine = PROCESSING_QUARANTINE_KEY
    val processingRepairState = "aigen:jobs:processing-recovery:repair-state"
    val commitRecoveryJobs = COMMIT_RECOVERY_JOBS_KEY
    val invalidRepairMember = "aigen:job:invalid-repair-member"
    val repairWorklistPrefix = "$processingRecovery:repair-worklist:"

    val hash: (UUID) -> String = { jobId -> "aigen:job:$jobId" }

    val transcript: (UUID) -> String = { jobId -> "${hash(jobId)}:transcript" }

    val turns: (UUID) -> String = { jobId -> "${hash(jobId)}:turns" }

    val result: (UUID) -> String = { jobId -> "${hash(jobId)}:result" }

    val evidence: (UUID) -> String = { jobId -> "${hash(jobId)}:evidence" }

    val providerAttempts: (UUID) -> String = { jobId -> "${hash(jobId)}:provider-attempts" }

    val admissionReceipt: (UUID) -> String = { jobId -> "${hash(jobId)}:admission-receipt" }

    val activeClubJobs: (UUID) -> String = { clubId -> "aigen:club:$clubId:jobs:active" }

    val sessionRecent: (UUID) -> String = { sessionId -> "aigen:session:$sessionId:jobs" }

    val hostDaily: (UUID) -> String = { hostId -> "aigen:host:$hostId:daily" }

    val hostDailyWindowToken: (UUID) -> String = { hostId -> "${hostDaily(hostId)}:window-token" }

    val hostMinute: (UUID) -> String = { hostId -> "aigen:host:$hostId:minute" }

    val hostMinuteWindowToken: (UUID) -> String = { hostId -> "${hostMinute(hostId)}:window-token" }

    val providerAdmission: (UUID) -> String = { clubId -> "aigen:club:$clubId:provider_admission" }

    val repairWorklist: (String) -> String = { passId -> "$repairWorklistPrefix$passId" }
}

private val defaultAiGenerationRedisKeyspace = AiGenerationRedisKeyspace()

internal fun providerAttemptsKey(jobId: UUID): String = defaultAiGenerationRedisKeyspace.providerAttempts(jobId)
