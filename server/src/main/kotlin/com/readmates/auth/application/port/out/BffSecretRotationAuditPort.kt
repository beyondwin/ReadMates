package com.readmates.auth.application.port.out

interface BffSecretRotationAuditPort {
    fun recordUsage(
        secretAlias: String,
        clientIpHash: String?,
        requestPath: String?,
    )
}
