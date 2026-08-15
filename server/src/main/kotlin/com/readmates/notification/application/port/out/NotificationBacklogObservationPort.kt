package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationBacklogRefreshResult

interface NotificationBacklogObservationPort {
    fun recordBacklogRefresh(result: NotificationBacklogRefreshResult)
}
