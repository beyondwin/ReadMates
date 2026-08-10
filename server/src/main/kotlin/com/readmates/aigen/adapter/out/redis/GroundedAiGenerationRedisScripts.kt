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
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
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
            redis.call('HINCRBY', KEYS[1], 'tokensCacheWrite', ARGV[6])
            redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[7])
            redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[8])
            redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[9])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[10])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[14])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtNano', ARGV[15])
            redis.call('HSET', KEYS[1], 'actualModelProvider', ARGV[12])
            redis.call('HSET', KEYS[1], 'actualModelName', ARGV[13])
            for index = 1, 5 do redis.call('EXPIRE', KEYS[index], ARGV[11]) end
            local id = ARGV[16]
            local score = tonumber(ARGV[17])
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            local sessionKey = 'aigen:session:' .. sessionId .. ':jobs'
            if redis.call('EXISTS', KEYS[6]) == 0 then redis.call('SET', KEYS[9], ARGV[18], 'EX', ARGV[11]) end
            redis.call('ZADD', KEYS[6], score, id)
            redis.call('ZADD', clubKey, score, id)
            redis.call('ZREM', KEYS[7], id)
            redis.call('ZREM', KEYS[8], id)
            redis.call('ZREM', KEYS[10], id)
            redis.call('ZADD', sessionKey, score, id)
            redis.call('EXPIRE', KEYS[6], ARGV[11])
            redis.call('EXPIRE', KEYS[9], ARGV[11])
            redis.call('EXPIRE', clubKey, ARGV[11])
            redis.call('EXPIRE', sessionKey, ARGV[11])
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
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            if redis.call('EXISTS', KEYS[2]) == 0 or redis.call('EXISTS', KEYS[3]) == 0 or redis.call('EXISTS', KEYS[4]) == 0 or
                redis.call('EXISTS', KEYS[5]) == 0 then
              redis.call('ZREM', KEYS[6], ARGV[7])
              redis.call('ZREM', KEYS[7], ARGV[7])
              redis.call('ZREM', KEYS[8], ARGV[7])
              redis.call('ZREM', KEYS[10], ARGV[7])
              if clubId ~= false then redis.call('ZREM', 'aigen:club:' .. clubId .. ':jobs:active', ARGV[7]) end
              if sessionId ~= false then redis.call('ZREM', 'aigen:session:' .. sessionId .. ':jobs', ARGV[7]) end
              redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5])
              return 'EXPIRED'
            end
            if status == 'COMMITTING' then
              return 'ALREADY_COMMITTING|' .. (redis.call('HGET', KEYS[1], 'commitLeaseExpiresAt') or '0')
            end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('HSET', KEYS[1], 'status', 'COMMITTING')
            redis.call('HSET', KEYS[1], 'commitLeaseExpiresAt', ARGV[3])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[5])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtNano', ARGV[6])
            for index = 1, 5 do
              if redis.call('EXISTS', KEYS[index]) == 1 then redis.call('EXPIRE', KEYS[index], ARGV[4]) end
            end
            local id = ARGV[7]
            local score = tonumber(ARGV[8])
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            local sessionKey = 'aigen:session:' .. sessionId .. ':jobs'
            if redis.call('EXISTS', KEYS[6]) == 0 then redis.call('SET', KEYS[9], ARGV[9], 'EX', ARGV[4]) end
            redis.call('ZADD', KEYS[6], score, id)
            redis.call('ZADD', clubKey, score, id)
            redis.call('ZREM', KEYS[7], id)
            redis.call('ZREM', KEYS[8], id)
            redis.call('ZADD', KEYS[10], 1000000000000000 + score, id)
            redis.call('ZADD', sessionKey, score, id)
            redis.call('EXPIRE', KEYS[6], ARGV[4])
            redis.call('EXPIRE', KEYS[9], ARGV[4])
            redis.call('EXPIRE', KEYS[10], ARGV[4])
            redis.call('EXPIRE', clubKey, ARGV[4])
            redis.call('EXPIRE', sessionKey, ARGV[4])
            return 'ACQUIRED|' .. tostring(revision)
            """.trimIndent(),
            String::class.java,
        )

    val recoverExpiredCommitLease: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= 'COMMITTING' then return 0 end
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            if redis.call('EXISTS', KEYS[2]) == 0 or redis.call('EXISTS', KEYS[3]) == 0 or redis.call('EXISTS', KEYS[4]) == 0 or
                redis.call('EXISTS', KEYS[5]) == 0 then
              redis.call('ZREM', KEYS[6], ARGV[6])
              redis.call('ZREM', KEYS[7], ARGV[6])
              redis.call('ZREM', KEYS[8], ARGV[6])
              redis.call('ZREM', KEYS[10], ARGV[6])
              if clubId ~= false then redis.call('ZREM', 'aigen:club:' .. clubId .. ':jobs:active', ARGV[6]) end
              if sessionId ~= false then redis.call('ZREM', 'aigen:session:' .. sessionId .. ':jobs', ARGV[6]) end
              redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5])
              return 0
            end
            local leaseExpiresAt = tonumber(redis.call('HGET', KEYS[1], 'commitLeaseExpiresAt'))
            if not leaseExpiresAt or leaseExpiresAt > tonumber(ARGV[1]) then return 0 end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('HSET', KEYS[1], 'status', 'COMMIT_RETRY')
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[4])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtNano', ARGV[5])
            redis.call('HDEL', KEYS[1], 'commitLeaseExpiresAt')
            for index = 1, 5 do
              if redis.call('EXISTS', KEYS[index]) == 1 then redis.call('EXPIRE', KEYS[index], ARGV[3]) end
            end
            local id = ARGV[6]
            local score = tonumber(ARGV[7])
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            local sessionKey = 'aigen:session:' .. sessionId .. ':jobs'
            if redis.call('EXISTS', KEYS[6]) == 0 then redis.call('SET', KEYS[9], ARGV[8], 'EX', ARGV[3]) end
            redis.call('ZADD', KEYS[6], score, id)
            redis.call('ZADD', clubKey, score, id)
            redis.call('ZREM', KEYS[7], id)
            redis.call('ZREM', KEYS[8], id)
            redis.call('ZADD', KEYS[10], 2000000000000000 + score, id)
            redis.call('ZADD', sessionKey, score, id)
            redis.call('EXPIRE', KEYS[6], ARGV[3])
            redis.call('EXPIRE', KEYS[9], ARGV[3])
            redis.call('EXPIRE', KEYS[10], ARGV[3])
            redis.call('EXPIRE', clubKey, ARGV[3])
            redis.call('EXPIRE', sessionKey, ARGV[3])
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
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('HSET', KEYS[1], 'status', 'COMMIT_RETRY')
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[4])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtNano', ARGV[5])
            redis.call('HDEL', KEYS[1], 'commitLeaseExpiresAt')
            for index = 1, 5 do
              if redis.call('EXISTS', KEYS[index]) == 1 then redis.call('EXPIRE', KEYS[index], ARGV[3]) end
            end
            local id = ARGV[6]
            local score = tonumber(ARGV[7])
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            local sessionKey = 'aigen:session:' .. sessionId .. ':jobs'
            if redis.call('EXISTS', KEYS[6]) == 0 then redis.call('SET', KEYS[9], ARGV[8], 'EX', ARGV[3]) end
            redis.call('ZADD', KEYS[6], score, id)
            redis.call('ZADD', clubKey, score, id)
            redis.call('ZREM', KEYS[7], id)
            redis.call('ZREM', KEYS[8], id)
            redis.call('ZADD', KEYS[10], 2000000000000000 + score, id)
            redis.call('ZADD', sessionKey, score, id)
            redis.call('EXPIRE', KEYS[6], ARGV[3])
            redis.call('EXPIRE', KEYS[9], ARGV[3])
            redis.call('EXPIRE', KEYS[10], ARGV[3])
            redis.call('EXPIRE', clubKey, ARGV[3])
            redis.call('EXPIRE', sessionKey, ARGV[3])
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
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('HSET', KEYS[1], 'status', 'COMMITTED')
            redis.call('HSET', KEYS[1], 'cleanupPending', 'true')
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[4])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtNano', ARGV[5])
            redis.call('HDEL', KEYS[1], 'commitLeaseExpiresAt', 'sessionMeta', 'instructions')
            redis.call('EXPIRE', KEYS[1], ARGV[3])
            local id = ARGV[6]
            redis.call('ZREM', KEYS[2], id)
            redis.call('ZREM', 'aigen:club:' .. clubId .. ':jobs:active', id)
            redis.call('ZREM', KEYS[3], id)
            redis.call('ZREM', KEYS[4], id)
            redis.call('ZADD', KEYS[6], tonumber(ARGV[7]), id)
            redis.call('EXPIRE', KEYS[6], ARGV[3])
            redis.call('ZADD', 'aigen:session:' .. sessionId .. ':jobs', tonumber(ARGV[7]), id)
            redis.call('EXPIRE', 'aigen:session:' .. sessionId .. ':jobs', ARGV[3])
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
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('HSET', KEYS[1], 'cleanupPending', 'false')
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[2])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[4])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtNano', ARGV[5])
            redis.call('EXPIRE', KEYS[1], ARGV[3])
            local id = ARGV[6]
            redis.call('ZREM', KEYS[2], id)
            redis.call('ZREM', 'aigen:club:' .. clubId .. ':jobs:active', id)
            redis.call('ZREM', KEYS[3], id)
            redis.call('ZREM', KEYS[4], id)
            redis.call('ZREM', KEYS[6], id)
            redis.call('ZADD', 'aigen:session:' .. sessionId .. ':jobs', tonumber(ARGV[7]), id)
            redis.call('EXPIRE', 'aigen:session:' .. sessionId .. ':jobs', ARGV[3])
            return 1
            """.trimIndent(),
            Long::class.java,
        )
}
