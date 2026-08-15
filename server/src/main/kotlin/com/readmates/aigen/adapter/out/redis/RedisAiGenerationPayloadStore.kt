package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AiGenerationJobListOperation
import com.readmates.aigen.application.model.AiGenerationJobListResult
import com.readmates.aigen.application.model.AiGenerationJobListUnavailableReason
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationJobReadWritePort
import com.readmates.aigen.application.port.out.GroundedResultPayload
import com.readmates.aigen.application.port.out.GroundedSourceContext
import com.readmates.aigen.application.port.out.JobRecord
import tools.jackson.core.JacksonException
import java.util.UUID

private class MissingGroundedPayloadException : RuntimeException("Grounded job payload is unavailable")

internal class RedisAiGenerationPayloadStore(
    private val context: AiGenerationRedisContext,
) : AiGenerationJobReadWritePort {
    private val redisTemplate = context.redisTemplate
    private val properties = context.properties
    private val objectMapper = context.objectMapper
    private val recordCodec = context.recordCodec
    private val indexes = context.indexes
    private val keyspace = context.keyspace
    private val loader = RedisAiGenerationPayloadLoader(context, ::delete)

    override fun save(job: JobRecord) {
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val hashKey = keyspace.hash(job.jobId)
            val hash = recordCodec.toHash(job)
            saveMetadataAndIndexes(job, hashKey, hash, ttlSeconds)

            redisTemplate
                .opsForValue()
                .set(keyspace.transcript(job.jobId), job.transcript, java.time.Duration.ofSeconds(ttlSeconds))
            require(job.validatedTurns.isNotEmpty()) { "Grounded job requires validated transcript turns" }
            redisTemplate
                .opsForValue()
                .set(
                    keyspace.turns(job.jobId),
                    objectMapper.writeValueAsString(
                        GroundedSourceContext(job.validatedTurns, job.sessionMeta, job.instructions),
                    ),
                    java.time.Duration.ofSeconds(ttlSeconds),
                )

            if (job.result != null) {
                val payload = GroundedResultPayload(job.result, requireNotNull(job.groundedDraft))
                redisTemplate
                    .opsForValue()
                    .set(
                        keyspace.result(job.jobId),
                        objectMapper.writeValueAsString(payload),
                        java.time.Duration.ofSeconds(ttlSeconds),
                    )
            }
            if (job.evidence != null) {
                redisTemplate
                    .opsForValue()
                    .set(
                        keyspace.evidence(job.jobId),
                        objectMapper.writeValueAsString(job.evidence),
                        java.time.Duration.ofSeconds(ttlSeconds),
                    )
            }
        }.onFailure { context.recordFailure("save") }.getOrThrow()
    }

    private fun saveMetadataAndIndexes(
        job: JobRecord,
        hashKey: String,
        hash: Map<String, String>,
        ttlSeconds: Long,
    ) {
        val metadataArguments =
            buildList {
                add(hash.size.toString())
                hash.forEach { (field, value) ->
                    add(field)
                    add(value)
                }
                add(ttlSeconds.toString())
                add(job.jobId.toString())
                add(job.lastUpdatedAt.toEpochMilli().toString())
                add(UUID.randomUUID().toString())
                add(job.status.name)
            }
        redisTemplate.execute(
            AiGenerationRedisScripts.saveMetadata,
            listOf(
                hashKey,
                keyspace.activeJobs,
                keyspace.activeClubJobs(job.clubId),
                keyspace.processingRecovery,
                keyspace.activeIndexEpoch,
                keyspace.processingQuarantine,
                keyspace.sessionRecent(job.sessionId),
            ),
            *metadataArguments.toTypedArray(),
        )
    }

    override fun load(jobId: UUID): JobRecord? =
        runCatching { loader.load(jobId) }
            .onFailure { context.recordFailure("load") }
            .getOrThrow()

    override fun loadMetadata(jobId: UUID): JobRecord? =
        runCatching { loader.loadMetadata(jobId) }
            .onFailure { context.recordFailure("loadMetadata") }
            .getOrThrow()

    override fun loadRecentForSession(
        sessionId: UUID,
        limit: Int,
    ): AiGenerationJobListResult =
        readJobList(AiGenerationJobListOperation.RECENT_FOR_SESSION, "loadRecentForSession") {
            if (limit <= 0) return@readJobList emptyList()
            val ids = indexes.recentIds(sessionId, limit)
            ids.mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loader.loadIndexedMetadata(jobId)
                when {
                    record == null -> {
                        indexes.removeRecent(sessionId, id)
                        null
                    }
                    record.sessionId != sessionId -> {
                        indexes.removeRecent(sessionId, id)
                        null
                    }
                    else -> record
                }
            }
        }

    override fun loadActiveJobs(limit: Int): AiGenerationJobListResult =
        readJobList(AiGenerationJobListOperation.ACTIVE, "loadActiveJobs") {
            if (limit <= 0) return@readJobList emptyList()
            val ids = indexes.activeIds(limit)
            ids.mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loader.loadIndexedMetadata(jobId)
                when {
                    record == null -> {
                        indexes.removeActiveId(id)
                        null
                    }
                    !indexes.isActive(record) -> {
                        indexes.removeActive(record)
                        null
                    }
                    else -> record
                }
            }
        }

    @Suppress("ComplexCondition")
    override fun loadCommitRecoveryJobs(limit: Int): AiGenerationJobListResult =
        readJobList(AiGenerationJobListOperation.COMMIT_RECOVERY, "loadCommitRecoveryJobs") {
            if (limit <= 0) return@readJobList emptyList()
            indexes.commitRecoveryIds(limit).mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loader.loadIndexedMetadata(jobId)
                if (record == null ||
                    (
                        record.status != JobStatus.COMMITTING && record.status != JobStatus.COMMIT_RETRY &&
                            !(record.status == JobStatus.COMMITTED && record.cleanupPending)
                    )
                ) {
                    indexes.removeCommitRecoveryId(id)
                    null
                } else {
                    record
                }
            }
        }

    private inline fun readJobList(
        operation: AiGenerationJobListOperation,
        metricOperation: String,
        read: () -> List<JobRecord>,
    ): AiGenerationJobListResult =
        runCatching { AiGenerationJobListResult.Available(read()) }
            .onFailure { context.recordFailure(metricOperation) }
            .getOrElse {
                AiGenerationJobListResult.Unavailable(
                    operation,
                    AiGenerationJobListUnavailableReason.STORE_READ_FAILED,
                )
            }

    override fun delete(jobId: UUID) {
        runCatching {
            redisTemplate.execute(
                AiGenerationJobMutationRedisScripts.deleteJob,
                listOf(
                    keyspace.hash(jobId),
                    keyspace.transcript(jobId),
                    keyspace.result(jobId),
                    keyspace.turns(jobId),
                    keyspace.evidence(jobId),
                    keyspace.providerAttempts(jobId),
                    keyspace.activeJobs,
                    keyspace.commitRecoveryJobs,
                    keyspace.processingRecovery,
                    keyspace.processingQuarantine,
                ),
                jobId.toString(),
            )
        }.onFailure { context.recordFailure("delete") }.getOrThrow()
    }

    private fun String.toUuidOrNull(): UUID? =
        runCatching {
            UUID.fromString(this)
        }.getOrNull()
}

private class RedisAiGenerationPayloadLoader(
    context: AiGenerationRedisContext,
    private val delete: (UUID) -> Unit,
) {
    private val redisTemplate = context.redisTemplate
    private val objectMapper = context.objectMapper
    private val recordCodec = context.recordCodec
    private val keyspace = context.keyspace

    fun load(jobId: UUID): JobRecord? {
        val hash = redisTemplate.opsForHash<String, String>().entries(keyspace.hash(jobId))
        if (hash.isEmpty()) return null

        val status = hash["status"]?.let { JobStatus.valueOf(it) }
        return loadGrounded(jobId, hash, requireNotNull(status))
    }

    fun loadMetadata(jobId: UUID): JobRecord? {
        val hash = redisTemplate.opsForHash<String, String>().entries(keyspace.hash(jobId))
        if (hash.isEmpty()) return null
        val status = hash["status"]?.let(JobStatus::valueOf)
        return if (!requiredGroundedPayloadsExist(jobId, requireNotNull(status))) {
            delete(jobId)
            null
        } else {
            recordCodec.fromHash(
                jobId = jobId,
                hash = hash,
                transcript = "",
                result = null,
                groundedDraft = null,
                sourceContext = null,
                evidence = null,
            )
        }
    }

    fun loadIndexedMetadata(jobId: UUID): JobRecord? {
        val hash = redisTemplate.opsForHash<String, String>().entries(keyspace.hash(jobId))
        if (hash.isEmpty()) return null
        return recordCodec.fromHash(
            jobId = jobId,
            hash = hash,
            transcript = "",
            result = null,
            groundedDraft = null,
            sourceContext = null,
            evidence = null,
        )
    }

    private fun requiredGroundedPayloadsExist(
        jobId: UUID,
        status: JobStatus,
    ): Boolean {
        val requiredKeys =
            when (status) {
                JobStatus.PENDING,
                JobStatus.RUNNING,
                -> listOf(keyspace.transcript(jobId), keyspace.turns(jobId))
                JobStatus.SUCCEEDED ->
                    listOf(
                        keyspace.transcript(jobId),
                        keyspace.turns(jobId),
                        keyspace.result(jobId),
                        keyspace.evidence(jobId),
                    )
                JobStatus.COMMITTING,
                JobStatus.COMMIT_RETRY,
                ->
                    listOf(
                        keyspace.transcript(jobId),
                        keyspace.turns(jobId),
                        keyspace.result(jobId),
                        keyspace.evidence(jobId),
                    )
                JobStatus.COMMITTED,
                JobStatus.CANCELLED,
                JobStatus.FAILED,
                -> emptyList()
            }
        return requiredKeys.all(redisTemplate::hasKey)
    }

    private fun loadGrounded(
        jobId: UUID,
        hash: Map<String, String>,
        status: JobStatus,
    ): JobRecord? =
        try {
            loadGroundedPayloads(jobId, hash, status)
        } catch (_: MissingGroundedPayloadException) {
            delete(jobId)
            null
        } catch (_: JacksonException) {
            delete(jobId)
            null
        }

    private fun loadGroundedPayloads(
        jobId: UUID,
        hash: Map<String, String>,
        status: JobStatus,
    ): JobRecord? {
        val transcript =
            if (status in GROUNDED_TRANSCRIPT_STATUSES) {
                requirePayload(keyspace.transcript(jobId))
            } else {
                ""
            }
        val sourceContext =
            if (status in GROUNDED_SOURCE_CONTEXT_STATUSES) {
                val sourceJson = requirePayload(keyspace.turns(jobId))
                objectMapper.readValue(sourceJson, GroundedSourceContext::class.java)
            } else {
                null
            }
        val resultPayload =
            if (status in GROUNDED_REVIEW_PAYLOAD_STATUSES) {
                val resultJson = requirePayload(keyspace.result(jobId))
                objectMapper.readValue(resultJson, GroundedResultPayload::class.java)
            } else {
                null
            }
        val evidence =
            if (status in GROUNDED_REVIEW_PAYLOAD_STATUSES) {
                val evidenceJson = requirePayload(keyspace.evidence(jobId))
                objectMapper.readValue(evidenceJson, GroundedEvidenceBundle::class.java)
            } else {
                null
            }
        return recordCodec.fromHash(
            jobId,
            hash,
            transcript,
            resultPayload?.result,
            resultPayload?.draft,
            sourceContext,
            evidence,
        )
    }

    private fun requirePayload(key: String): String =
        redisTemplate
            .opsForValue()
            .get(key)
            ?: throw MissingGroundedPayloadException()

    private companion object {
        val GROUNDED_TRANSCRIPT_STATUSES = setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED)

        val GROUNDED_SOURCE_CONTEXT_STATUSES =
            setOf(
                JobStatus.PENDING,
                JobStatus.RUNNING,
                JobStatus.SUCCEEDED,
                JobStatus.COMMITTING,
                JobStatus.COMMIT_RETRY,
            )

        val GROUNDED_REVIEW_PAYLOAD_STATUSES =
            setOf(JobStatus.SUCCEEDED, JobStatus.COMMITTING, JobStatus.COMMIT_RETRY)
    }
}
