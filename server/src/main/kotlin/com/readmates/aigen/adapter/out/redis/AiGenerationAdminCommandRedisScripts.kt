package com.readmates.aigen.adapter.out.redis

import org.springframework.data.redis.core.script.DefaultRedisScript

internal object AiGenerationAdminCommandRedisScripts {
    val cancelForAdmin: DefaultRedisScript<String> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 'MISSING' end
            local status = redis.call('HGET', KEYS[1], 'status')
            local revisionRaw = redis.call('HGET', KEYS[1], 'revision')
            local revision = tonumber(revisionRaw)
            if status == false or revision == nil or revision < 0 or revision ~= math.floor(revision) then
              return redis.error_reply('corrupt admin cancel metadata')
            end
            local allowed = status == 'PENDING' or status == 'RUNNING' or status == 'SUCCEEDED'
            if not allowed or revision ~= tonumber(ARGV[1]) then
              return 'STATE_CHANGED|' .. status .. '|' .. revisionRaw
            end
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            local nextRevision = revision + 1
            redis.call('HSET', KEYS[1],
              'status', 'CANCELLED',
              'progressPct', '0',
              'revision', tostring(nextRevision),
              'cleanupPending', 'false',
              'lastUpdatedAt', ARGV[2],
              'lastUpdatedAtEpochSecond', ARGV[3],
              'lastUpdatedAtNano', ARGV[4])
            redis.call('HDEL', KEYS[1],
              'stage', 'errorCode', 'errorMessage', 'commitLeaseExpiresAt',
              'recoveryQuarantineReason', 'recoveryQuarantinedAt', 'sessionMeta', 'instructions')
            redis.call('DEL', KEYS[2], KEYS[3], KEYS[4], KEYS[5])
            local id = ARGV[6]
            redis.call('ZREM', KEYS[6], id)
            redis.call('ZREM', KEYS[7], id)
            redis.call('ZREM', KEYS[8], id)
            redis.call('ZREM', KEYS[10], id)
            redis.call('ZREM', 'aigen:club:' .. clubId .. ':jobs:active', id)
            local sessionKey = 'aigen:session:' .. sessionId .. ':jobs'
            redis.call('ZADD', sessionKey, ARGV[7], id)
            redis.call('EXPIRE', sessionKey, ARGV[5])
            redis.call('EXPIRE', KEYS[1], ARGV[5])
            return 'CANCELLED|' .. tostring(nextRevision)
            """.trimIndent(),
            String::class.java,
        )
}
