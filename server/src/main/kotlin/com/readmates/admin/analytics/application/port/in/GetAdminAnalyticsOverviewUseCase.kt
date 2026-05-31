@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.analytics.application.port.`in`

import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.shared.security.CurrentPlatformAdmin

interface GetAdminAnalyticsOverviewUseCase {
    fun overview(
        admin: CurrentPlatformAdmin,
        window: AnalyticsWindow,
    ): AdminAnalyticsOverview
}
