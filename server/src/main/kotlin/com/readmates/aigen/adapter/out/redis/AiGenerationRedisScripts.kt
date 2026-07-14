package com.readmates.aigen.adapter.out.redis

import org.springframework.data.redis.core.script.DefaultRedisScript

internal object AiGenerationRedisScripts {
    val reserveLlmCall: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then return 0 end
            local current = tonumber(redis.call('HGET', KEYS[1], 'llmCallCount') or '0')
            if current >= tonumber(ARGV[2]) then return -1 end
            redis.call('HINCRBY', KEYS[1], 'llmCallCount', 1)
            redis.call('EXPIRE', KEYS[1], ARGV[3])
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val transitionStatus: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            local current = redis.call('HGET', KEYS[1], 'status')
            local expected = ',' .. ARGV[1] .. ','
            if string.find(expected, ',' .. current .. ',', 1, true) == nil then return 0 end
            redis.call('HSET', KEYS[1], 'status', ARGV[2])
            if ARGV[3] == '' then
              redis.call('HDEL', KEYS[1], 'stage')
            else
              redis.call('HSET', KEYS[1], 'stage', ARGV[3])
            end
            redis.call('HSET', KEYS[1], 'progressPct', ARGV[4])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[7])
            if ARGV[5] == '' then
              redis.call('HDEL', KEYS[1], 'errorCode', 'errorMessage')
            else
              redis.call('HSET', KEYS[1], 'errorCode', ARGV[5])
              redis.call('HSET', KEYS[1], 'errorMessage', ARGV[6])
            end
            if ARGV[9] ~= '' then redis.call('HSET', KEYS[1], 'groundingStatus', ARGV[9]) end
            redis.call('EXPIRE', KEYS[1], ARGV[8])
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val saveResultIfStatus: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then return 0 end
            redis.call('SET', KEYS[2], ARGV[2])
            redis.call('EXPIRE', KEYS[2], ARGV[8])
            redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[3])
            redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[4])
            redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[5])
            redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[6])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[7])
            redis.call('EXPIRE', KEYS[1], ARGV[8])
            if redis.call('EXISTS', KEYS[3]) == 1 then redis.call('EXPIRE', KEYS[3], ARGV[8]) end
            if redis.call('EXISTS', KEYS[4]) == 1 then redis.call('EXPIRE', KEYS[4], ARGV[8]) end
            if ARGV[9] ~= '' then
              redis.call('HSET', KEYS[1], 'actualModelProvider', ARGV[9])
              redis.call('HSET', KEYS[1], 'actualModelName', ARGV[10])
            end
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val deleteTransientPayload: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 1 then
              redis.call('HDEL', KEYS[1], 'sessionMeta', 'instructions')
            end
            return redis.call('DEL', KEYS[2], KEYS[3], KEYS[4], KEYS[5])
            """.trimIndent(),
            Long::class.java,
        )

    val patchResult: DefaultRedisScript<Void> =
        DefaultRedisScript(
            """
            redis.call('SET', KEYS[2], ARGV[1])
            redis.call('EXPIRE', KEYS[2], ARGV[7])
            redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[2])
            redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[3])
            redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[4])
            redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[5])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[6])
            redis.call('EXPIRE', KEYS[1], ARGV[7])
            if redis.call('EXISTS', KEYS[3]) == 1 then redis.call('EXPIRE', KEYS[3], ARGV[7]) end
            if redis.call('EXISTS', KEYS[4]) == 1 then redis.call('EXPIRE', KEYS[4], ARGV[7]) end
            return nil
            """.trimIndent(),
            Void::class.java,
        )

    val deleteJob: DefaultRedisScript<Long> =
        DefaultRedisScript(
            "return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5])",
            Long::class.java,
        )
}
