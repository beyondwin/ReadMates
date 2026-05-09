package com.readmates.shared.security

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.ZonedDateTime
import java.time.temporal.WeekFields

object ClientIpHashing {
    fun hashClientIp(raw: String?, baseSecret: String, clock: Clock = Clock.systemUTC()): String {
        val ip = raw?.takeIf { it.isNotBlank() } ?: return "anonymous"
        val now = ZonedDateTime.now(clock)
        val week = now.get(WeekFields.ISO.weekOfWeekBasedYear())
        val year = now.get(WeekFields.ISO.weekBasedYear())
        val salt = "${baseSecret}::${year}-W${week}"
        return MessageDigest.getInstance("SHA-256")
            .digest("$salt::$ip".toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
            .take(32)
    }
}
