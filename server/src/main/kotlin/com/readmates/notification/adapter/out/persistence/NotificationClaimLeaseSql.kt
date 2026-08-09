package com.readmates.notification.adapter.out.persistence

internal const val NOTIFICATION_DATABASE_UTC_NOW_EXPRESSION = "utc_timestamp(6)"
internal const val NOTIFICATION_CLAIM_LEASE_EXPIRED_PREDICATE =
    "locked_at <= timestampadd(MICROSECOND, ?, $NOTIFICATION_DATABASE_UTC_NOW_EXPRESSION)"
