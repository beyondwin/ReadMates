@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.application.port.`in`

interface ProcessPublicConvergenceUseCase {
    fun processBatch(leaseOwner: String): Int
}
