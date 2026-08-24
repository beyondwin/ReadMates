package com.readmates.publication.adapter.out

import com.readmates.publication.application.port.out.ProviderAttemptResult
import com.readmates.publication.application.port.out.ProviderFailureCategory
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.application.port.out.PublicCachePurgePort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(
    prefix = "readmates.public-convergence.provider",
    name = ["http-enabled"],
    havingValue = "false",
    matchIfMissing = true,
)
class NoopPublicCachePurgeAdapter : PublicCachePurgePort {
    override fun requestPurge(command: PublicCachePurgeCommand): ProviderAttemptResult =
        ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true)
}
