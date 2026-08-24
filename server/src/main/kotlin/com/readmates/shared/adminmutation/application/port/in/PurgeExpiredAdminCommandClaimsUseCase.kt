@file:Suppress("ktlint:standard:package-name")

package com.readmates.shared.adminmutation.application.port.`in`

fun interface PurgeExpiredAdminCommandClaimsUseCase {
    fun purgeExpired(limit: Int): Int
}
