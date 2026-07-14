package com.readmates.aigen.adapter.out.redis

import org.springframework.data.redis.core.script.DefaultRedisScript

internal object GroundedAiGenerationRedisScripts {
    val saveResult: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then return 0 end
            local revision = tonumber(redis.call('HGET', KEYS[1], 'revision') or '0')
            if revision ~= tonumber(ARGV[2]) then return 0 end
            if redis.call('EXISTS', KEYS[4]) == 0 or redis.call('EXISTS', KEYS[5]) == 0 then return 0 end
            local nextRevision = revision + 1
            redis.call('SET', KEYS[2], ARGV[3])
            redis.call('SET', KEYS[3], ARGV[4])
            redis.call('HSET', KEYS[1], 'status', 'SUCCEEDED')
            redis.call('HSET', KEYS[1], 'stage', 'READY')
            redis.call('HSET', KEYS[1], 'progressPct', '100')
            redis.call('HSET', KEYS[1], 'revision', tostring(nextRevision))
            redis.call('HSET', KEYS[1], 'groundingStatus', 'VALID')
            redis.call('HSET', KEYS[1], 'cleanupPending', 'false')
            redis.call('HDEL', KEYS[1], 'commitLeaseExpiresAt', 'errorCode', 'errorMessage')
            redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[5])
            redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[6])
            redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[7])
            redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[8])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[9])
            redis.call('HSET', KEYS[1], 'actualModelProvider', ARGV[11])
            redis.call('HSET', KEYS[1], 'actualModelName', ARGV[12])
            for index = 1, 5 do redis.call('EXPIRE', KEYS[index], ARGV[10]) end
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val acquireCommitLease: DefaultRedisScript<String> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 'NOT_READY' end
            local revision = tonumber(redis.call('HGET', KEYS[1], 'revision') or '0')
            if revision ~= tonumber(ARGV[1]) then return 'REVISION_CONFLICT' end
            local status = redis.call('HGET', KEYS[1], 'status')
            if status ~= 'SUCCEEDED' and status ~= 'COMMIT_RETRY' and status ~= 'COMMITTING' then
              return 'NOT_READY'
            end
            if redis.call('EXISTS', KEYS[2]) == 0 or redis.call('EXISTS', KEYS[3]) == 0 or redis.call('EXISTS', KEYS[4]) == 0 or
                redis.call('EXISTS', KEYS[5]) == 0 then
              redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5])
              return 'EXPIRED'
            end
            if status == 'COMMITTING' then
              return 'ALREADY_COMMITTING|' .. (redis.call('HGET', KEYS[1], 'commitLeaseExpiresAt') or '0')
            end
            redis.call('HSET', KEYS[1], 'status', 'COMMITTING')
            redis.call('HSET', KEYS[1], 'commitLeaseExpiresAt', ARGV[3])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            for index = 1, 5 do
              if redis.call('EXISTS', KEYS[index]) == 1 then redis.call('EXPIRE', KEYS[index], ARGV[4]) end
            end
            return 'ACQUIRED|' .. tostring(revision)
            """.trimIndent(),
            String::class.java,
        )

    val recoverExpiredCommitLease: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= 'COMMITTING' then return 0 end
            if redis.call('EXISTS', KEYS[2]) == 0 or redis.call('EXISTS', KEYS[3]) == 0 or redis.call('EXISTS', KEYS[4]) == 0 or
                redis.call('EXISTS', KEYS[5]) == 0 then
              redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5])
              return 0
            end
            local leaseExpiresAt = tonumber(redis.call('HGET', KEYS[1], 'commitLeaseExpiresAt'))
            if not leaseExpiresAt or leaseExpiresAt > tonumber(ARGV[1]) then return 0 end
            redis.call('HSET', KEYS[1], 'status', 'COMMIT_RETRY')
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('HDEL', KEYS[1], 'commitLeaseExpiresAt')
            for index = 1, 5 do
              if redis.call('EXISTS', KEYS[index]) == 1 then redis.call('EXPIRE', KEYS[index], ARGV[3]) end
            end
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val releaseCommitLeaseForRetry: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= 'COMMITTING' then return 0 end
            if tonumber(redis.call('HGET', KEYS[1], 'revision') or '0') ~= tonumber(ARGV[1]) then return 0 end
            redis.call('HSET', KEYS[1], 'status', 'COMMIT_RETRY')
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('HDEL', KEYS[1], 'commitLeaseExpiresAt')
            for index = 1, 5 do
              if redis.call('EXISTS', KEYS[index]) == 1 then redis.call('EXPIRE', KEYS[index], ARGV[3]) end
            end
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val markCommittedForCleanup: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            local status = redis.call('HGET', KEYS[1], 'status')
            if status ~= 'COMMITTING' and status ~= 'COMMIT_RETRY' then return 0 end
            if tonumber(redis.call('HGET', KEYS[1], 'revision') or '0') ~= tonumber(ARGV[1]) then return 0 end
            redis.call('HSET', KEYS[1], 'status', 'COMMITTED')
            redis.call('HSET', KEYS[1], 'cleanupPending', 'true')
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('HDEL', KEYS[1], 'commitLeaseExpiresAt', 'sessionMeta', 'instructions')
            redis.call('EXPIRE', KEYS[1], ARGV[3])
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val markCleanupComplete: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= 'COMMITTED' then return 0 end
            if tonumber(redis.call('HGET', KEYS[1], 'revision') or '0') ~= tonumber(ARGV[1]) then return 0 end
            if redis.call('HGET', KEYS[1], 'cleanupPending') ~= 'true' then return 0 end
            redis.call('HSET', KEYS[1], 'cleanupPending', 'false')
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('EXPIRE', KEYS[1], ARGV[3])
            return 1
            """.trimIndent(),
            Long::class.java,
        )
}
