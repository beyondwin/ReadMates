package com.readmates.notification.application.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

private const val MIN_REPLAY_TARGETS = 1
private const val DEFAULT_REPLAY_TARGETS = 1_000
private const val MAX_REPLAY_TARGETS = 5_000
private const val NANOS_PER_MILLISECOND = 1_000_000
private const val DEFAULT_PREVIEW_TTL_MINUTES = 10L
private val MIN_PREVIEW_TTL: Duration = Duration.ofMinutes(1)
private val DEFAULT_PREVIEW_TTL: Duration = Duration.ofMinutes(DEFAULT_PREVIEW_TTL_MINUTES)
private val MAX_PREVIEW_TTL: Duration = Duration.ofHours(1)

@ConfigurationProperties(prefix = "readmates.notifications.admin-replay")
data class AdminNotificationReplayProperties(
    val previewTtl: Duration = DEFAULT_PREVIEW_TTL,
    val maxTargets: Int = DEFAULT_REPLAY_TARGETS,
) {
    init {
        require(
            previewTtl in MIN_PREVIEW_TTL..MAX_PREVIEW_TTL &&
                previewTtl.nano % NANOS_PER_MILLISECOND == 0,
        ) {
            "readmates.notifications.admin-replay.preview-ttl must be between 1 minute and 1 hour " +
                "and use whole-millisecond increments"
        }
        require(maxTargets in MIN_REPLAY_TARGETS..MAX_REPLAY_TARGETS) {
            "readmates.notifications.admin-replay.max-targets must be between " +
                "$MIN_REPLAY_TARGETS and $MAX_REPLAY_TARGETS"
        }
    }
}
