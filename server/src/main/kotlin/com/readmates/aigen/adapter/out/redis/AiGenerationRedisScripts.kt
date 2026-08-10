package com.readmates.aigen.adapter.out.redis

import org.springframework.data.redis.core.script.DefaultRedisScript

internal object AiGenerationRedisScripts {
    val saveMetadata: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            local fieldCount = tonumber(ARGV[1])
            local values = {}
            for i = 1, fieldCount * 2 do values[i] = ARGV[i + 1] end
            redis.call('HSET', KEYS[1], unpack(values))
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            local offset = fieldCount * 2 + 2
            local ttl = ARGV[offset]
            local id = ARGV[offset + 1]
            local score = tonumber(ARGV[offset + 2])
            local epoch = ARGV[offset + 3]
            local status = ARGV[offset + 4]
            redis.call('EXPIRE', KEYS[1], ttl)
            redis.call('ZADD', KEYS[7], score, id)
            redis.call('EXPIRE', KEYS[7], ttl)
            local active = status == 'PENDING' or status == 'RUNNING' or status == 'SUCCEEDED' or
              status == 'COMMITTING' or status == 'COMMIT_RETRY'
            if active then
              if redis.call('EXISTS', KEYS[2]) == 0 then redis.call('SET', KEYS[5], epoch, 'EX', ttl) end
              redis.call('ZADD', KEYS[2], score, id)
              redis.call('ZADD', KEYS[3], score, id)
              redis.call('EXPIRE', KEYS[2], ttl)
              redis.call('EXPIRE', KEYS[3], ttl)
              redis.call('EXPIRE', KEYS[5], ttl)
              if status == 'PENDING' or status == 'RUNNING' then
                redis.call('ZADD', KEYS[4], score, id)
                redis.call('EXPIRE', KEYS[4], ttl)
              else
                redis.call('ZREM', KEYS[4], id)
              end
              redis.call('ZREM', KEYS[6], id)
            else
              redis.call('ZREM', KEYS[2], id)
              redis.call('ZREM', KEYS[3], id)
              redis.call('ZREM', KEYS[4], id)
              redis.call('ZREM', KEYS[6], id)
            end
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val updateStatus: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('HSET', KEYS[1],
              'status', ARGV[1],
              'progressPct', ARGV[3],
              'lastUpdatedAt', ARGV[6],
              'lastUpdatedAtEpochSecond', ARGV[7],
              'lastUpdatedAtNano', ARGV[8])
            if ARGV[2] == '' then redis.call('HDEL', KEYS[1], 'stage') else redis.call('HSET', KEYS[1], 'stage', ARGV[2]) end
            if ARGV[4] == '' then
              redis.call('HDEL', KEYS[1], 'errorCode', 'errorMessage')
            else
              redis.call('HSET', KEYS[1], 'errorCode', ARGV[4], 'errorMessage', ARGV[5])
            end
            redis.call('EXPIRE', KEYS[1], ARGV[9])
            local id = ARGV[10]
            local score = tonumber(ARGV[11])
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            local sessionKey = 'aigen:session:' .. sessionId .. ':jobs'
            redis.call('ZADD', sessionKey, score, id)
            redis.call('EXPIRE', sessionKey, ARGV[9])
            local active = ARGV[1] == 'PENDING' or ARGV[1] == 'RUNNING' or ARGV[1] == 'SUCCEEDED' or
              ARGV[1] == 'COMMITTING' or ARGV[1] == 'COMMIT_RETRY'
            if active then
              if redis.call('EXISTS', KEYS[2]) == 0 then redis.call('SET', KEYS[5], ARGV[12], 'EX', ARGV[9]) end
              redis.call('ZADD', KEYS[2], score, id)
              redis.call('ZADD', clubKey, score, id)
              redis.call('EXPIRE', KEYS[2], ARGV[9])
              redis.call('EXPIRE', clubKey, ARGV[9])
              redis.call('EXPIRE', KEYS[5], ARGV[9])
              if ARGV[1] == 'PENDING' or ARGV[1] == 'RUNNING' then
                redis.call('ZADD', KEYS[3], score, id)
                redis.call('EXPIRE', KEYS[3], ARGV[9])
              else redis.call('ZREM', KEYS[3], id) end
              redis.call('ZREM', KEYS[4], id)
            else
              redis.call('ZREM', KEYS[2], id)
              redis.call('ZREM', clubKey, id)
              redis.call('ZREM', KEYS[3], id)
              redis.call('ZREM', KEYS[4], id)
            end
            if ARGV[1] == 'COMMITTING' or ARGV[1] == 'COMMIT_RETRY' then
              local priority = ARGV[1] == 'COMMITTING' and 1000000000000000 or 2000000000000000
              redis.call('ZADD', KEYS[6], priority + score, id)
              redis.call('EXPIRE', KEYS[6], ARGV[9])
            else redis.call('ZREM', KEYS[6], id) end
            return 1
            """.trimIndent(),
            Long::class.java,
        )
}

internal object AiGenerationRecoveryRedisScripts {
    val recoverFailure: DefaultRedisScript<String> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 'MISSING' end
            local status = redis.call('HGET', KEYS[1], 'status')
            local observedIso = redis.call('HGET', KEYS[1], 'lastUpdatedAt')
            local observedSecond = redis.call('HGET', KEYS[1], 'lastUpdatedAtEpochSecond')
            local observedNano = redis.call('HGET', KEYS[1], 'lastUpdatedAtNano')
            local currentHostUserId = redis.call('HGET', KEYS[1], 'hostUserId')
            local currentClubId = redis.call('HGET', KEYS[1], 'clubId')
            local currentSessionId = redis.call('HGET', KEYS[1], 'sessionId')
            local function parseInstant(iso)
              if iso == false then return nil, nil end
              local year, month, day, hour, minute, second, fraction =
                string.match(iso, '^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)%.(%d+)Z$')
              if year == nil then
                year, month, day, hour, minute, second =
                  string.match(iso, '^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)Z$')
                fraction = ''
              end
              year = tonumber(year)
              month = tonumber(month)
              day = tonumber(day)
              hour = tonumber(hour)
              minute = tonumber(minute)
              second = tonumber(second)
              if year == nil or year < 1970 or month == nil or month < 1 or month > 12 or
                day == nil or hour == nil or hour > 23 or minute == nil or minute > 59 or
                second == nil or second > 59 or string.len(fraction) > 9 then return nil, nil end
              local leap = year % 4 == 0 and (year % 100 ~= 0 or year % 400 == 0)
              local monthDays = {31, leap and 29 or 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
              if day < 1 or day > monthDays[month] then return nil, nil end
              local adjustedYear = month <= 2 and year - 1 or year
              local era = math.floor(adjustedYear / 400)
              local yearOfEra = adjustedYear - era * 400
              local adjustedMonth = month > 2 and month - 3 or month + 9
              local dayOfYear = math.floor((153 * adjustedMonth + 2) / 5) + day - 1
              local dayOfEra = yearOfEra * 365 + math.floor(yearOfEra / 4) - math.floor(yearOfEra / 100) + dayOfYear
              local epochDay = era * 146097 + dayOfEra - 719468
              local paddedFraction = fraction .. string.rep('0', 9 - string.len(fraction))
              local nano = paddedFraction == '' and 0 or tonumber(paddedFraction)
              return epochDay * 86400 + hour * 3600 + minute * 60 + second, nano
            end
            local function isUuid(value)
              return value ~= false and string.match(
                value,
                '^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$'
              ) ~= nil
            end
            local validSafeErrors = {
              PROVIDER_UNAVAILABLE = true, PROVIDER_RATE_LIMITED = true, SCHEMA_INVALID = true,
              AUTHOR_NAME_MISMATCH = true, HIGHLIGHTS_OUT_OF_RANGE = true, ONE_LINE_REVIEWS_DUPLICATE = true,
              FEEDBACK_TEMPLATE_INVALID = true, HOST_DAILY_CAP_EXCEEDED = true, CLUB_MONTHLY_CAP_EXCEEDED = true,
              RATE_LIMITED = true, AI_DISABLED = true, JOB_EXPIRED = true, QUEUE_UNAVAILABLE = true,
              TRANSCRIPT_FORMAT_INVALID = true, TRANSCRIPT_EMPTY = true, TRANSCRIPT_DURATION_EXCEEDED = true,
              TRANSCRIPT_SPEAKER_NOT_MEMBER = true, TRANSCRIPT_SPEAKER_AMBIGUOUS = true,
              MODEL_CAPABILITY_UNAVAILABLE = true, TRANSCRIPT_TOO_LONG_FOR_MODEL = true,
              TRANSCRIPT_ALIAS_MODE_UNSUPPORTED = true, STALE_GENERATION_REVISION = true, MEMBERSHIP_CHANGED = true,
              ASYNC_PROCESSING_EXHAUSTED = true, MAX_CALLS_EXCEEDED = true, UNKNOWN = true
            }
            local function corrupt()
              redis.call('HSET', KEYS[1],
                'recoveryQuarantineReason', 'CORRUPT_RECOVERY_METADATA',
                'recoveryQuarantinedAt', ARGV[9])
              redis.call('EXPIRE', KEYS[1], ARGV[12])
              redis.call('ZREM', KEYS[11], ARGV[14])
              redis.call('ZADD', KEYS[12], tonumber(ARGV[13]) + tonumber(ARGV[12]) * 1000, ARGV[14])
              redis.call('EXPIRE', KEYS[12], ARGV[12])
              return 'CORRUPT'
            end
            if status ~= ARGV[1] or observedIso ~= ARGV[2] then return 'STATE_CHANGED' end
            if currentHostUserId ~= ARGV[19] or currentClubId ~= ARGV[20] or currentSessionId ~= ARGV[21] then
              return 'STATE_CHANGED'
            end
            if (status == 'PENDING' and ARGV[11] ~= 'RELEASE_PENDING') or
              (status == 'RUNNING' and ARGV[11] ~= 'COMPLETE_RUNNING') then return corrupt() end
            if observedSecond == false and observedNano == false then
              observedSecond = ARGV[3]
              observedNano = ARGV[4]
            elseif observedSecond == false or observedNano == false or
              observedSecond ~= ARGV[3] or observedNano ~= ARGV[4] then
              return corrupt()
            end
            if ARGV[5] ~= '' then
              local cutoffSecond = tonumber(ARGV[5])
              local cutoffNano = tonumber(ARGV[6])
              local currentSecond = tonumber(observedSecond)
              local currentNano = tonumber(observedNano)
              if currentSecond > cutoffSecond or
                (currentSecond == cutoffSecond and currentNano > cutoffNano) then
                return 'NOT_STALE'
              end
            end

            local reconciled = {}
            if status == 'RUNNING' then
              if redis.call('HLEN', KEYS[2]) > 48 then
                return corrupt()
              end
              local entries = redis.call('HGETALL', KEYS[2])
              local live = false
              local attemptCount = 0
              for i = 1, #entries, 2 do
                local field = entries[i]
                local value = entries[i + 1]
                if string.sub(field, -6) == ':state' then
                  local attemptId = string.sub(field, 1, -7)
                  attemptCount = attemptCount + 1
                  local startedRaw = redis.call('HGET', KEYS[2], attemptId .. ':startedAtEpochMs')
                  local started = tonumber(startedRaw)
                  local provider = redis.call('HGET', KEYS[2], attemptId .. ':provider')
                  local mode = redis.call('HGET', KEYS[2], attemptId .. ':mode')
                  local costBasis = redis.call('HGET', KEYS[2], attemptId .. ':costBasis')
                  local startedIso = redis.call('HGET', KEYS[2], attemptId .. ':startedAt')
                  local startedSecondRaw = redis.call('HGET', KEYS[2], attemptId .. ':startedAtEpochSecond')
                  local startedNanoRaw = redis.call('HGET', KEYS[2], attemptId .. ':startedAtNano')
                  local slotReleased = redis.call('HGET', KEYS[2], attemptId .. ':slotReleased')
                  local safeErrorCode = redis.call('HGET', KEYS[2], attemptId .. ':safeErrorCode')
                  local completedAt = redis.call('HGET', KEYS[2], attemptId .. ':completedAt')
                  local ordinalRaw = redis.call('HGET', KEYS[2], attemptId .. ':ordinal')
                  local reservedRaw = redis.call('HGET', KEYS[2], attemptId .. ':reservedCostUsd')
                  local reserved = tonumber(reservedRaw)
                  local plainReserved = reservedRaw ~= false and
                    (string.match(reservedRaw, '^%d+$') ~= nil or string.match(reservedRaw, '^%d+%.%d+$') ~= nil)
                  local startedSecond = tonumber(startedSecondRaw)
                  local startedNano = tonumber(startedNanoRaw)
                  local parsedSecond, parsedNano = parseInstant(startedIso)
                  local completedSecond = nil
                  if completedAt ~= false and completedAt ~= '' then completedSecond = parseInstant(completedAt) end
                  local exactStartAbsent = startedSecondRaw == false and startedNanoRaw == false
                  local exactStartValid = exactStartAbsent or
                    (startedSecond ~= nil and startedNano ~= nil and startedNano >= 0 and startedNano < 1000000000 and
                      startedSecond == parsedSecond and startedNano == parsedNano)
                  local attemptValid =
                    isUuid(attemptId) and
                    redis.call('HGET', KEYS[2], attemptId .. ':attemptId') == attemptId and
                    redis.call('HGET', KEYS[2], attemptId .. ':jobId') == ARGV[14] and
                    (provider == 'OPENAI' or provider == 'CLAUDE' or provider == 'GEMINI') and
                    string.len(redis.call('HGET', KEYS[2], attemptId .. ':model') or '') > 0 and
                    (mode == 'PRIMARY' or mode == 'FALLBACK' or mode == 'RETRY' or mode == 'SCHEMA_CORRECTION' or
                      mode == 'SECTION_REPAIR' or mode == 'REGENERATE_SECTION') and
                    ordinalRaw ~= false and string.match(ordinalRaw, '^[1-9]%d*$') ~= nil and
                    tonumber(ordinalRaw) <= 3 and
                    plainReserved and reserved ~= nil and reserved >= 0 and reserved < math.huge and
                    (costBasis == 'NONE' or costBasis == 'ACTUAL' or costBasis == 'ESTIMATED_UNKNOWN') and
                    (value == 'IN_FLIGHT' or value == 'SUCCEEDED' or value == 'FAILED' or value == 'UNKNOWN') and
                    (slotReleased == '0' or slotReleased == '1') and
                    safeErrorCode ~= false and (safeErrorCode == '' or validSafeErrors[safeErrorCode] == true) and
                    completedAt ~= false and
                    ((value == 'IN_FLIGHT' and completedAt == '') or (value ~= 'IN_FLIGHT' and completedSecond ~= nil)) and
                    parsedSecond ~= nil and parsedNano ~= nil and
                    started == parsedSecond * 1000 + math.floor(parsedNano / 1000000) and exactStartValid
                  if started == nil or not attemptValid or attemptCount > 3 then
                    return corrupt()
                  elseif value == 'IN_FLIGHT' and
                    (parsedSecond < tonumber(ARGV[17]) or
                      (parsedSecond == tonumber(ARGV[17]) and parsedNano < tonumber(ARGV[18]))) then
                    table.insert(reconciled, attemptId)
                  elseif value == 'IN_FLIGHT' then
                    live = true
                  end
                end
              end
              if #entries ~= attemptCount * 32 then return corrupt() end
              for _, attemptId in ipairs(reconciled) do
                redis.call('HSET', KEYS[2],
                  attemptId .. ':state', 'UNKNOWN',
                  attemptId .. ':costBasis', 'ESTIMATED_UNKNOWN',
                  attemptId .. ':completedAt', ARGV[9])
              end
              if live then
                local suffix = #reconciled > 0 and ('|' .. table.concat(reconciled, ',')) or ''
                return 'DEFERRED_IN_FLIGHT' .. suffix
              end
            end

            if redis.call('HGET', KEYS[1], 'lastUpdatedAtEpochSecond') == false then
              redis.call('HSET', KEYS[1],
                'lastUpdatedAtEpochSecond', observedSecond,
                'lastUpdatedAtNano', observedNano)
            end

            local unaccounted = status == 'PENDING' and redis.call('EXISTS', KEYS[3]) == 0
            if redis.call('EXISTS', KEYS[3]) == 1 then
              if status == 'PENDING' then
                local dailyToken = redis.call('HGET', KEYS[3], 'dailyToken')
                local minuteToken = redis.call('HGET', KEYS[3], 'minuteToken')
                local daily = tonumber(redis.call('GET', KEYS[4]) or '0')
                if redis.call('HGET', KEYS[3], 'dailyCharged') == '1' and
                  dailyToken ~= false and dailyToken ~= '' and
                  redis.call('GET', KEYS[5]) == dailyToken and daily > 0 then
                  redis.call('DECR', KEYS[4])
                end
                local minute = tonumber(redis.call('GET', KEYS[6]) or '0')
                if redis.call('HGET', KEYS[3], 'minuteCharged') == '1' and
                  minuteToken ~= false and minuteToken ~= '' and
                  redis.call('GET', KEYS[7]) == minuteToken and minute > 0 then
                  redis.call('DECR', KEYS[6])
                end
              end
              redis.call('DEL', KEYS[3])
            end
            if redis.call('GET', KEYS[8]) == ARGV[14] then redis.call('DEL', KEYS[8]) end

            redis.call('HSET', KEYS[1],
              'status', 'FAILED',
              'progressPct', '100',
              'errorCode', ARGV[8],
              'errorMessage', ARGV[10],
              'lastUpdatedAt', ARGV[9],
              'lastUpdatedAtEpochSecond', ARGV[15],
              'lastUpdatedAtNano', ARGV[16])
            redis.call('HDEL', KEYS[1], 'stage', 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('EXPIRE', KEYS[1], ARGV[12])
            if redis.call('EXISTS', KEYS[2]) == 1 then redis.call('EXPIRE', KEYS[2], ARGV[12]) end
            redis.call('ZREM', KEYS[9], ARGV[14])
            redis.call('ZREM', KEYS[10], ARGV[14])
            redis.call('ZREM', KEYS[11], ARGV[14])
            redis.call('ZREM', KEYS[12], ARGV[14])
            redis.call('ZREM', KEYS[14], ARGV[14])
            redis.call('ZADD', KEYS[13], ARGV[13], ARGV[14])
            redis.call('EXPIRE', KEYS[13], ARGV[12])
            local prefix = unaccounted and 'RECOVERED_UNACCOUNTED' or 'RECOVERED'
            if #reconciled > 0 then return prefix .. '|' .. table.concat(reconciled, ',') end
            return prefix
            """.trimIndent(),
            String::class.java,
        )

    val reclassifyRecovery: DefaultRedisScript<String> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then
              redis.call('ZREM', KEYS[2], ARGV[1])
              redis.call('ZREM', KEYS[3], ARGV[1])
              redis.call('ZREM', KEYS[4], ARGV[1])
              return 'MISSING'
            end
            local status = redis.call('HGET', KEYS[1], 'status')
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local iso = redis.call('HGET', KEYS[1], 'lastUpdatedAt')
            local secondRaw = redis.call('HGET', KEYS[1], 'lastUpdatedAtEpochSecond')
            local nanoRaw = redis.call('HGET', KEYS[1], 'lastUpdatedAtNano')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            local hostUserId = redis.call('HGET', KEYS[1], 'hostUserId')
            local function raw(value) return value == false and '' or value end
            if raw(status) ~= ARGV[6] or raw(iso) ~= ARGV[7] or raw(secondRaw) ~= ARGV[8] or
              raw(nanoRaw) ~= ARGV[9] or raw(clubId) ~= ARGV[10] or raw(sessionId) ~= ARGV[11] or
              raw(hostUserId) ~= ARGV[12] then return 'RETRY' end
            if ARGV[5] ~= '1' then
              redis.call('HSET', KEYS[1],
                'recoveryQuarantineReason', 'CORRUPT_RECOVERY_METADATA',
                'recoveryQuarantinedAt', ARGV[13])
              redis.call('ZREM', KEYS[3], ARGV[1])
              redis.call('ZADD', KEYS[4], tonumber(ARGV[2]) + tonumber(ARGV[3]) * 1000, ARGV[1])
              redis.call('EXPIRE', KEYS[4], ARGV[3])
              return 'CORRUPT'
            end
            local second = tonumber(secondRaw)
            local nano = tonumber(nanoRaw)
            local score = second * 1000 + math.floor(nano / 1000000)
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            if status == 'PENDING' or status == 'RUNNING' then
              if redis.call('EXISTS', KEYS[2]) == 0 then redis.call('SET', KEYS[5], ARGV[4], 'EX', ARGV[3]) end
              redis.call('ZADD', KEYS[2], score, ARGV[1])
              redis.call('ZADD', clubKey, score, ARGV[1])
              redis.call('ZADD', KEYS[3], score, ARGV[1])
              redis.call('ZREM', KEYS[4], ARGV[1])
              redis.call('EXPIRE', KEYS[2], ARGV[3])
              redis.call('EXPIRE', KEYS[3], ARGV[3])
              redis.call('EXPIRE', clubKey, ARGV[3])
              redis.call('EXPIRE', KEYS[5], ARGV[3])
              return 'ACTIVE'
            end
            redis.call('ZREM', KEYS[3], ARGV[1])
            redis.call('ZREM', KEYS[4], ARGV[1])
            if status == 'SUCCEEDED' or status == 'COMMITTING' or status == 'COMMIT_RETRY' then
              if redis.call('EXISTS', KEYS[2]) == 0 then redis.call('SET', KEYS[5], ARGV[4], 'EX', ARGV[3]) end
              redis.call('ZADD', KEYS[2], score, ARGV[1])
              redis.call('ZADD', clubKey, score, ARGV[1])
              redis.call('EXPIRE', KEYS[2], ARGV[3])
              redis.call('EXPIRE', clubKey, ARGV[3])
              redis.call('EXPIRE', KEYS[5], ARGV[3])
              return 'ACTIVE'
            end
            redis.call('ZREM', KEYS[2], ARGV[1])
            redis.call('ZREM', clubKey, ARGV[1])
            return 'TERMINAL'
            """.trimIndent(),
            String::class.java,
        )

    val quarantineRecovery: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 1 then
              redis.call('HSET', KEYS[1],
                'recoveryQuarantineReason', 'CORRUPT_RECOVERY_METADATA',
                'recoveryQuarantinedAt', ARGV[4])
              redis.call('EXPIRE', KEYS[1], ARGV[3])
            end
            redis.call('ZREM', KEYS[2], ARGV[1])
            redis.call('ZADD', KEYS[3], tonumber(ARGV[2]) + tonumber(ARGV[3]) * 1000, ARGV[1])
            redis.call('EXPIRE', KEYS[3], ARGV[3])
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val startProcessingRepairPass: DefaultRedisScript<String> =
        DefaultRedisScript(
            """
            redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', ARGV[1])
            local epoch = redis.call('GET', KEYS[2])
            if epoch == false or epoch == '' then
              epoch = ARGV[4]
              redis.call('SET', KEYS[2], epoch, 'EX', ARGV[3])
            else redis.call('EXPIRE', KEYS[2], ARGV[3]) end
            local stateEpoch = redis.call('HGET', KEYS[3], 'activeIndexEpoch')
            local reset = false
            if stateEpoch ~= false and stateEpoch ~= epoch then
              local oldPass = redis.call('HGET', KEYS[3], 'passId')
              if oldPass ~= false and oldPass ~= '' then redis.call('DEL', ARGV[7] .. oldPass) end
              redis.call('DEL', KEYS[3])
              reset = true
            end
            redis.call('HSET', KEYS[3], 'activeIndexEpoch', epoch)
            local pass = redis.call('HGET', KEYS[3], 'passId')
            local remaining = tonumber(redis.call('HGET', KEYS[3], 'remainingCount') or '0')
            if pass ~= false and pass ~= '' then
              local worklist = ARGV[7] .. pass
              if redis.call('EXISTS', worklist) == 0 then
                if remaining == 0 and redis.call('HGET', KEYS[3], 'completedEpoch') == epoch then
                  redis.call('HDEL', KEYS[3], 'passId')
                  redis.call('EXPIRE', KEYS[3], ARGV[3])
                  return reset and 'EPOCH_RESET_COMPLETE' or 'PASS_COMPLETED'
                end
                redis.call('HDEL', KEYS[3], 'passId', 'remainingCount')
                pass = false
              else
                redis.call('EXPIRE', KEYS[3], ARGV[3])
                if redis.call('EXISTS', worklist) == 1 then redis.call('EXPIRE', worklist, ARGV[3]) end
                return (reset and 'EPOCH_RESET|' or 'READY|') .. pass
              end
            end
            local count = redis.call('ZCARD', KEYS[1])
            if count > tonumber(ARGV[2]) then
              redis.call('EXPIRE', KEYS[3], ARGV[3])
              return 'OVER_CAP'
            end
            local newPass = ARGV[5]
            local worklist = ARGV[7] .. newPass
            redis.call('DEL', worklist)
            if count == 0 then
              redis.call('HSET', KEYS[3],
                'remainingCount', '0',
                'completedEpoch', epoch)
              redis.call('HDEL', KEYS[3], 'passId')
              redis.call('EXPIRE', KEYS[3], ARGV[3])
              return reset and 'EPOCH_RESET_COMPLETE' or 'PASS_COMPLETED'
            end
            redis.call('ZUNIONSTORE', worklist, 1, KEYS[1])
            redis.call('HSET', KEYS[3],
              'passId', newPass,
              'remainingCount', tostring(count))
            redis.call('EXPIRE', worklist, ARGV[3])
            redis.call('EXPIRE', KEYS[3], ARGV[3])
            return (reset and 'EPOCH_RESET|' or 'READY|') .. newPass
            """.trimIndent(),
            String::class.java,
        )

    val repairProcessingMember: DefaultRedisScript<String> =
        DefaultRedisScript(
            """
            local function finish(result)
              local removed = redis.call('ZREM', KEYS[7], ARGV[1])
              if removed == 1 then
                local remaining = redis.call('HINCRBY', KEYS[6], 'remainingCount', -1)
                if remaining <= 0 then
                  redis.call('HSET', KEYS[6], 'remainingCount', '0', 'completedEpoch', ARGV[2])
                  redis.call('HDEL', KEYS[6], 'passId')
                  redis.call('DEL', KEYS[7])
                  redis.call('EXPIRE', KEYS[6], ARGV[6])
                  return result .. '|PASS_COMPLETED'
                end
              end
              redis.call('EXPIRE', KEYS[6], ARGV[6])
              if redis.call('EXISTS', KEYS[7]) == 1 then redis.call('EXPIRE', KEYS[7], ARGV[6]) end
              return result
            end
            if redis.call('GET', KEYS[5]) ~= ARGV[2] or redis.call('HGET', KEYS[6], 'activeIndexEpoch') ~= ARGV[2] or
              redis.call('HGET', KEYS[6], 'passId') ~= ARGV[3] then return 'STALE_PASS' end
            if redis.call('EXISTS', KEYS[1]) == 0 then
              redis.call('ZREM', KEYS[2], ARGV[1])
              redis.call('ZREM', KEYS[3], ARGV[1])
              redis.call('ZREM', KEYS[4], ARGV[1])
              return finish('MISSING')
            end
            local status = redis.call('HGET', KEYS[1], 'status')
            local iso = redis.call('HGET', KEYS[1], 'lastUpdatedAt')
            local second = redis.call('HGET', KEYS[1], 'lastUpdatedAtEpochSecond')
            local nano = redis.call('HGET', KEYS[1], 'lastUpdatedAtNano')
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            local hostUserId = redis.call('HGET', KEYS[1], 'hostUserId')
            if status == false or iso == false or clubId == false or sessionId == false or hostUserId == false or
              (second == false) ~= (nano == false) then
              redis.call('HSET', KEYS[1],
                'recoveryQuarantineReason', 'CORRUPT_RECOVERY_METADATA',
                'recoveryQuarantinedAt', ARGV[15])
              redis.call('ZREM', KEYS[3], ARGV[1])
              redis.call('ZADD', KEYS[4], tonumber(ARGV[5]) + tonumber(ARGV[6]) * 1000, ARGV[1])
              redis.call('EXPIRE', KEYS[4], ARGV[6])
              return finish('QUARANTINED')
            end
            if ARGV[10] ~= '1' then
              redis.call('HSET', KEYS[1],
                'recoveryQuarantineReason', 'CORRUPT_RECOVERY_METADATA',
                'recoveryQuarantinedAt', ARGV[15])
              redis.call('ZREM', KEYS[3], ARGV[1])
              redis.call('ZADD', KEYS[4], tonumber(ARGV[5]) + tonumber(ARGV[6]) * 1000, ARGV[1])
              redis.call('EXPIRE', KEYS[4], ARGV[6])
              return finish('QUARANTINED')
            end
            if status ~= ARGV[4] or clubId ~= ARGV[12] or sessionId ~= ARGV[13] or hostUserId ~= ARGV[14] then
              return 'RETRY'
            end
            if iso ~= ARGV[7] then return 'RETRY' end
            if second == false then
              redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[8], 'lastUpdatedAtNano', ARGV[9])
              second = ARGV[8]
              nano = ARGV[9]
            elseif second ~= ARGV[8] or nano ~= ARGV[9] then
              redis.call('HSET', KEYS[1],
                'recoveryQuarantineReason', 'CORRUPT_RECOVERY_METADATA',
                'recoveryQuarantinedAt', ARGV[15])
              redis.call('ZREM', KEYS[3], ARGV[1])
              redis.call('ZADD', KEYS[4], tonumber(ARGV[5]) + tonumber(ARGV[6]) * 1000, ARGV[1])
              redis.call('EXPIRE', KEYS[4], ARGV[6])
              return finish('QUARANTINED')
            end
            local quarantine = redis.call('ZSCORE', KEYS[4], ARGV[1])
            if quarantine ~= false and tonumber(quarantine) > tonumber(ARGV[5]) then return finish('QUARANTINED') end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            local score = tonumber(second) * 1000 + math.floor(tonumber(nano) / 1000000)
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            local active = status == 'PENDING' or status == 'RUNNING' or status == 'SUCCEEDED' or
              status == 'COMMITTING' or status == 'COMMIT_RETRY'
            if active then
              if redis.call('EXISTS', KEYS[2]) == 0 then
                redis.call('SET', KEYS[5], ARGV[11], 'EX', ARGV[6])
                return 'EPOCH_CHANGED'
              end
              redis.call('ZADD', KEYS[2], score, ARGV[1])
              redis.call('ZADD', clubKey, score, ARGV[1])
              redis.call('EXPIRE', KEYS[2], ARGV[6])
              redis.call('EXPIRE', clubKey, ARGV[6])
              redis.call('EXPIRE', KEYS[5], ARGV[6])
              if status == 'PENDING' or status == 'RUNNING' then
                redis.call('ZADD', KEYS[3], score, ARGV[1])
                redis.call('EXPIRE', KEYS[3], ARGV[6])
              else redis.call('ZREM', KEYS[3], ARGV[1]) end
            else
              redis.call('ZREM', KEYS[2], ARGV[1])
              redis.call('ZREM', clubKey, ARGV[1])
              redis.call('ZREM', KEYS[3], ARGV[1])
            end
            return finish('RECLASSIFIED')
            """.trimIndent(),
            String::class.java,
        )
}

internal object AiGenerationJobMutationRedisScripts {
    val transitionStatus: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            local current = redis.call('HGET', KEYS[1], 'status')
            local expected = ',' .. ARGV[1] .. ','
            if string.find(expected, ',' .. current .. ',', 1, true) == nil then return 0 end
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('HSET', KEYS[1], 'status', ARGV[2])
            if ARGV[3] == '' then
              redis.call('HDEL', KEYS[1], 'stage')
            else
              redis.call('HSET', KEYS[1], 'stage', ARGV[3])
            end
            redis.call('HSET', KEYS[1], 'progressPct', ARGV[4])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[7])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[10])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtNano', ARGV[11])
            if ARGV[5] == '' then
              redis.call('HDEL', KEYS[1], 'errorCode', 'errorMessage')
            else
              redis.call('HSET', KEYS[1], 'errorCode', ARGV[5])
              redis.call('HSET', KEYS[1], 'errorMessage', ARGV[6])
            end
            if ARGV[9] ~= '' then redis.call('HSET', KEYS[1], 'groundingStatus', ARGV[9]) end
            redis.call('EXPIRE', KEYS[1], ARGV[8])
            local id = ARGV[12]
            local score = tonumber(ARGV[13])
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            local sessionKey = 'aigen:session:' .. sessionId .. ':jobs'
            redis.call('ZADD', sessionKey, score, id)
            redis.call('EXPIRE', sessionKey, ARGV[8])
            local active = ARGV[2] == 'PENDING' or ARGV[2] == 'RUNNING' or ARGV[2] == 'SUCCEEDED' or
              ARGV[2] == 'COMMITTING' or ARGV[2] == 'COMMIT_RETRY'
            if active then
              if redis.call('EXISTS', KEYS[2]) == 0 then redis.call('SET', KEYS[5], ARGV[14], 'EX', ARGV[8]) end
              redis.call('ZADD', KEYS[2], score, id)
              redis.call('ZADD', clubKey, score, id)
              redis.call('EXPIRE', KEYS[2], ARGV[8])
              redis.call('EXPIRE', clubKey, ARGV[8])
              redis.call('EXPIRE', KEYS[5], ARGV[8])
              if ARGV[2] == 'PENDING' or ARGV[2] == 'RUNNING' then
                redis.call('ZADD', KEYS[3], score, id)
                redis.call('EXPIRE', KEYS[3], ARGV[8])
              else redis.call('ZREM', KEYS[3], id) end
              redis.call('ZREM', KEYS[4], id)
            else
              redis.call('ZREM', KEYS[2], id)
              redis.call('ZREM', clubKey, id)
              redis.call('ZREM', KEYS[3], id)
              redis.call('ZREM', KEYS[4], id)
            end
            if ARGV[2] == 'COMMITTING' or ARGV[2] == 'COMMIT_RETRY' then
              local priority = ARGV[2] == 'COMMITTING' and 1000000000000000 or 2000000000000000
              redis.call('ZADD', KEYS[6], priority + score, id)
              redis.call('EXPIRE', KEYS[6], ARGV[8])
            else redis.call('ZREM', KEYS[6], id) end
            return 1
            """.trimIndent(),
            Long::class.java,
        )

    val saveResultIfStatus: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then return 0 end
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            if clubId == false or sessionId == false then return redis.error_reply('corrupt job identity') end
            redis.call('HDEL', KEYS[1], 'recoveryQuarantineReason', 'recoveryQuarantinedAt')
            redis.call('SET', KEYS[2], ARGV[2])
            redis.call('EXPIRE', KEYS[2], ARGV[9])
            redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[3])
            redis.call('HINCRBY', KEYS[1], 'tokensCacheWrite', ARGV[4])
            redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[5])
            redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[6])
            redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[7])
            redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[8])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtEpochSecond', ARGV[12])
            redis.call('HSET', KEYS[1], 'lastUpdatedAtNano', ARGV[13])
            redis.call('EXPIRE', KEYS[1], ARGV[9])
            if redis.call('EXISTS', KEYS[3]) == 1 then redis.call('EXPIRE', KEYS[3], ARGV[9]) end
            if redis.call('EXISTS', KEYS[4]) == 1 then redis.call('EXPIRE', KEYS[4], ARGV[9]) end
            if ARGV[10] ~= '' then
              redis.call('HSET', KEYS[1], 'actualModelProvider', ARGV[10])
              redis.call('HSET', KEYS[1], 'actualModelName', ARGV[11])
            end
            local id = ARGV[14]
            local score = tonumber(ARGV[15])
            local clubKey = 'aigen:club:' .. clubId .. ':jobs:active'
            local sessionKey = 'aigen:session:' .. sessionId .. ':jobs'
            if redis.call('EXISTS', KEYS[5]) == 0 then redis.call('SET', KEYS[8], ARGV[16], 'EX', ARGV[9]) end
            redis.call('ZADD', KEYS[5], score, id)
            redis.call('ZADD', clubKey, score, id)
            redis.call('ZADD', KEYS[6], score, id)
            redis.call('ZREM', KEYS[7], id)
            redis.call('ZADD', sessionKey, score, id)
            redis.call('EXPIRE', KEYS[5], ARGV[9])
            redis.call('EXPIRE', KEYS[6], ARGV[9])
            redis.call('EXPIRE', KEYS[8], ARGV[9])
            redis.call('EXPIRE', clubKey, ARGV[9])
            redis.call('EXPIRE', sessionKey, ARGV[9])
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

    val deleteJob: DefaultRedisScript<Long> =
        DefaultRedisScript(
            """
            local id = ARGV[1]
            local clubId = redis.call('HGET', KEYS[1], 'clubId')
            local sessionId = redis.call('HGET', KEYS[1], 'sessionId')
            redis.call('ZREM', KEYS[7], id)
            redis.call('ZREM', KEYS[8], id)
            redis.call('ZREM', KEYS[9], id)
            redis.call('ZREM', KEYS[10], id)
            if clubId ~= false then redis.call('ZREM', 'aigen:club:' .. clubId .. ':jobs:active', id) end
            if sessionId ~= false then redis.call('ZREM', 'aigen:session:' .. sessionId .. ':jobs', id) end
            return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6])
            """.trimIndent(),
            Long::class.java,
        )
}
