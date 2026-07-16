package com.readmates.aigen.adapter.out.redis

import org.springframework.data.redis.core.script.DefaultRedisScript

internal object ProviderCallReservationRedisScripts {
    val reserve: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then return 0 end
            if redis.call('HGET', KEYS[1], 'clubId') ~= ARGV[15] then return 0 end

            if redis.call('GET', KEYS[2]) ~= ARGV[2] then return -1 end
            if redis.call('TTL', KEYS[2]) <= 0 then return -1 end

            local currentCalls = tonumber(redis.call('HGET', KEYS[1], 'llmCallCount') or '0')
            if currentCalls >= tonumber(ARGV[3]) then return -2 end

            local currentCost = tonumber(redis.call('GET', KEYS[3]) or '0')
            local maximumCost = tonumber(ARGV[4])
            if currentCost + maximumCost > tonumber(ARGV[5]) then return -3 end

            local prefix = ARGV[8] .. ':'
            if redis.call('HEXISTS', KEYS[4], prefix .. 'state') == 1 then return -4 end

            local requestedMode = ARGV[12]
            if requestedMode == 'FALLBACK' or requestedMode == 'RETRY' or requestedMode == 'SCHEMA_CORRECTION' or requestedMode == 'SECTION_REPAIR' then
              local attempts = redis.call('HGETALL', KEYS[4])
              for i = 1, #attempts, 2 do
                if string.sub(attempts[i], -5) == ':mode' then
                  local existingMode = attempts[i + 1]
                  local attemptPrefix = string.sub(attempts[i], 1, -5)
                  local slotReleased = redis.call('HGET', KEYS[4], attemptPrefix .. 'slotReleased') == '1'
                  if not slotReleased then
                    if existingMode == requestedMode then return -5 end
                    if (requestedMode == 'FALLBACK' or requestedMode == 'RETRY') and
                      (existingMode == 'FALLBACK' or existingMode == 'RETRY') then return -5 end
                  end
                end
              end
            end

            local ordinal = redis.call('HINCRBY', KEYS[1], 'llmCallCount', 1)
            redis.call('INCRBYFLOAT', KEYS[3], ARGV[4])
            redis.call('HSET', KEYS[4],
              prefix .. 'attemptId', ARGV[8],
              prefix .. 'ordinal', ordinal,
              prefix .. 'jobId', ARGV[9],
              prefix .. 'provider', ARGV[10],
              prefix .. 'model', ARGV[11],
              prefix .. 'mode', ARGV[12],
              prefix .. 'state', 'IN_FLIGHT',
              prefix .. 'slotReleased', '0',
              prefix .. 'reservedCostUsd', ARGV[4],
              prefix .. 'costBasis', 'NONE',
              prefix .. 'safeErrorCode', '',
              prefix .. 'startedAt', ARGV[13],
              prefix .. 'startedAtEpochMs', ARGV[16],
              prefix .. 'completedAt', '')

            redis.call('EXPIRE', KEYS[1], ARGV[6])
            redis.call('EXPIRE', KEYS[4], ARGV[6])
            if redis.call('TTL', KEYS[3]) <= 0 then redis.call('EXPIRE', KEYS[3], ARGV[7]) end
            redis.call('EXPIRE', KEYS[2], ARGV[14])
            return ordinal
            """.trimIndent(),
            Long::class.java,
        )

    val reconcile: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            local prefix = ARGV[1] .. ':'
            if redis.call('EXISTS', KEYS[3]) == 0 then return -2 end
            if redis.call('HGET', KEYS[3], 'clubId') ~= ARGV[3] then return -2 end
            if redis.call('HGET', KEYS[1], prefix .. 'jobId') ~= ARGV[2] then return -1 end
            if redis.call('HGET', KEYS[1], prefix .. 'state') ~= 'IN_FLIGHT' then return 0 end
            if redis.call('EXISTS', KEYS[2]) == 0 then return -3 end
            if redis.call('TTL', KEYS[2]) <= 0 then return -3 end

            local releaseSlot = ARGV[10] == '1'
            local currentCalls = nil
            if releaseSlot then
              currentCalls = tonumber(redis.call('HGET', KEYS[3], 'llmCallCount') or '0')
              if currentCalls <= 0 then return -4 end
            end

            if ARGV[5] ~= '' then
              local reserved = tonumber(redis.call('HGET', KEYS[1], prefix .. 'reservedCostUsd') or '0')
              local actual = tonumber(ARGV[5])
              local delta = actual - reserved
              if delta ~= 0 then redis.call('INCRBYFLOAT', KEYS[2], tostring(delta)) end
            end

            if releaseSlot then
              redis.call('HINCRBY', KEYS[3], 'llmCallCount', -1)
            end

            redis.call('HSET', KEYS[1],
              prefix .. 'state', ARGV[4],
              prefix .. 'slotReleased', ARGV[10],
              prefix .. 'costBasis', ARGV[6],
              prefix .. 'safeErrorCode', ARGV[7],
              prefix .. 'completedAt', ARGV[8])
            redis.call('EXPIRE', KEYS[1], ARGV[9])
            redis.call('EXPIRE', KEYS[3], ARGV[9])
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val markUnresolvedUnknown: DefaultRedisScript<String> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return '' end
            local entries = redis.call('HGETALL', KEYS[1])
            local changed = {}
            local active = false
            for i = 1, #entries, 2 do
              local field = entries[i]
              local value = entries[i + 1]
              if string.sub(field, -6) == ':state' and value == 'IN_FLIGHT' then
                local attemptId = string.sub(field, 1, -7)
                local startedAtEpochMs = tonumber(redis.call('HGET', KEYS[1], attemptId .. ':startedAtEpochMs'))
                if startedAtEpochMs ~= nil and startedAtEpochMs < tonumber(ARGV[1]) then
                  table.insert(changed, attemptId)
                else
                  active = true
                end
              end
            end
            if #changed == 0 then return active and '!ACTIVE' or '' end
            if redis.call('EXISTS', KEYS[2]) == 0 then return '!BINDING' end
            if redis.call('HGET', KEYS[2], 'clubId') ~= ARGV[4] then return '!BINDING' end
            if redis.call('EXISTS', KEYS[3]) == 0 then return '!COUNTER' end
            if redis.call('TTL', KEYS[3]) <= 0 then return '!COUNTER' end
            for _, attemptId in ipairs(changed) do
              local prefix = attemptId .. ':'
              redis.call('HSET', KEYS[1],
                prefix .. 'state', 'UNKNOWN',
                prefix .. 'costBasis', 'ESTIMATED_UNKNOWN',
                prefix .. 'completedAt', ARGV[2])
            end
            redis.call('EXPIRE', KEYS[1], ARGV[3])
            redis.call('EXPIRE', KEYS[2], ARGV[3])
            return (active and '!ACTIVE|' or '') .. table.concat(changed, ',')
            """.trimIndent(),
            String::class.java,
        )
}
