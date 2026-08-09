package com.readmates.admin.health.adapter.out.observability

import com.readmates.admin.health.application.port.out.PlatformAdminHealthLocalReadingsPort
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component

@Component
class MicrometerPlatformAdminHealthLocalReadingsAdapter(
    private val meterRegistry: MeterRegistry,
) : PlatformAdminHealthLocalReadingsPort {
    override fun redisOperationErrorCount(): Double? = meterRegistry.find(REDIS_ERRORS_METRIC).counter()?.count()

    override fun dbPoolPendingConnections(): Double? = meterRegistry.find(DB_POOL_PENDING_METRIC).gauge()?.value()

    override fun outboxPendingBacklog(): Double? =
        meterRegistry
            .find(OUTBOX_BACKLOG_METRIC)
            .tag(STATUS_TAG, PENDING_STATUS)
            .gauge()
            ?.value()

    private companion object {
        const val REDIS_ERRORS_METRIC = "readmates.redis.operation.errors"
        const val DB_POOL_PENDING_METRIC = "hikaricp.connections.pending"
        const val OUTBOX_BACKLOG_METRIC = "readmates.notifications.outbox.backlog"
        const val STATUS_TAG = "status"
        const val PENDING_STATUS = "pending"
    }
}
