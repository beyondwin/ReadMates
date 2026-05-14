package com.readmates.shared.security

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.ZonedDateTime
import java.time.temporal.WeekFields

object ClientIpHashing {
    fun hashClientIp(
        raw: String?,
        baseSecret: String,
        clock: Clock = Clock.systemUTC(),
        requireNonBlankSecret: Boolean = true,
    ): String {
        val ip = raw?.takeIf { it.isNotBlank() } ?: return "anonymous"
        if (requireNonBlankSecret && baseSecret.isBlank()) {
            throw IllegalStateException(
                "ClientIpHashing.hashClientIp called with blank baseSecret. " +
                    "Set READMATES_IP_HASH_BASE_SECRET or configure " +
                    "readmates.security.ip-hash.base-secret.",
            )
        }
        val now = ZonedDateTime.now(clock)
        val week = now.get(WeekFields.ISO.weekOfWeekBasedYear())
        val year = now.get(WeekFields.ISO.weekBasedYear())
        val salt = "$baseSecret::$year-W$week"
        return MessageDigest
            .getInstance("SHA-256")
            .digest("$salt::$ip".toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
            .take(32)
    }
}
