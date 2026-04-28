package com.readmates.shared.cache

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates.redis", name = ["enabled"], havingValue = "false", matchIfMissing = true)
class NoopReadCacheInvalidationAdapter : ReadCacheInvalidationPort {
    override fun evictClubContent(clubId: UUID) = Unit
}
