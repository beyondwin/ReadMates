package com.readmates.admin.health.application.model

import java.time.Instant

data class PlatformHealthView(
    val snapshot: PlatformHealthSnapshot,
    val lastSuccessfulAt: Instant?,
    val refreshState: PlatformHealthRefreshState,
    val staleAgeSeconds: Long,
)
