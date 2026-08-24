@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.application.port.`in`

fun interface ProcessAdminNotificationReplayConvergenceUseCase {
    fun processBatch(): Int
}
