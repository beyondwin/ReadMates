@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.health.application.port.`in`

import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.model.PlatformHealthView
import java.util.concurrent.CompletableFuture

fun interface ReadPlatformAdminHealthUseCase {
    fun currentHealth(): PlatformHealthView
}

fun interface RefreshPlatformAdminHealthUseCase {
    fun refresh(trigger: PlatformHealthRefreshTrigger): CompletableFuture<PlatformHealthView>
}
