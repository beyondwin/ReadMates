package com.readmates.admin.analytics.application.port.out

import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AnalyticsWindow

interface AdminAnalyticsAggregatePort {
    fun loadAggregates(window: AnalyticsWindow): AdminAnalyticsRawAggregates
}
