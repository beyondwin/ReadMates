package com.readmates.shared.delivery

import java.time.Duration

interface DeliveryRuntimePolicy {
    val deliveryEnabled: Boolean
    val deliveryWorkerEnabled: Boolean
    val deliveryBatchSize: Int
    val deliveryClaimLease: Duration
    val deliveryMaxAttempts: Int
    val deliveryRetryDelays: List<Duration>
}
