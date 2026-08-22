@file:Suppress("ktlint:standard:package-name")

package com.readmates.shared.mutation.application.port.`in`

fun interface PurgeExpiredMutationIdempotencyUseCase {
    fun purgeExpired(limit: Int): Int
}
