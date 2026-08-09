package com.readmates.admin.health.application.port.out

interface PlatformAdminHealthLocalReadingsPort {
    fun redisOperationErrorCount(): Double?

    fun dbPoolPendingConnections(): Double?

    fun outboxPendingBacklog(): Double?
}
