package com.readmates.notification.application.service

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.`in`.PublishNotificationEventsUseCase
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant

private const val MAX_PUBLISH_ERROR_LENGTH = 500
private const val MISSING_EVENT_MESSAGE_ERROR = "Notification event message missing"
private const val EXPIRED_EVENT_ERROR = "Notification event expired"

@Service
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class NotificationRelayService
    @Autowired
    constructor(
        private val notificationEventOutboxPort: NotificationEventOutboxPort,
        private val notificationEventPublisherPort: NotificationEventPublisherPort,
        private val operationalMetrics: ReadmatesOperationalMetrics,
        private val runtimeProperties: NotificationRuntimeProperties,
        private val clock: Clock,
    ) : PublishNotificationEventsUseCase {
        internal constructor(
            notificationEventOutboxPort: NotificationEventOutboxPort,
            notificationEventPublisherPort: NotificationEventPublisherPort,
            operationalMetrics: ReadmatesOperationalMetrics,
            maxAttempts: Int,
        ) : this(
            notificationEventOutboxPort,
            notificationEventPublisherPort,
            operationalMetrics,
            NotificationRuntimeProperties(
                kafka = NotificationRuntimeProperties.Kafka(maxPublishAttempts = maxAttempts),
            ),
            Clock.systemUTC(),
        )

        override fun publishPending(limit: Int): Int {
            if (limit <= 0) {
                return 0
            }

            val items = notificationEventOutboxPort.claimPublishable(limit)
            items.forEach(::publish)
            return items.size
        }

        private fun publish(item: NotificationEventOutboxItem) {
            val transitionAt = clock.instant()
            val deadline = item.createdAt.toInstant().plus(runtimeProperties.worker.eventMaxAge)
            if (!transitionAt.isBefore(deadline)) {
                recordDeadTransition(item, EXPIRED_EVENT_ERROR, NotificationEventPublishResult.EXPIRED)
            } else {
                publishEligible(item, transitionAt)
            }
        }

        private fun publishEligible(
            item: NotificationEventOutboxItem,
            transitionAt: Instant,
        ) {
            val message = notificationEventOutboxPort.loadMessage(item.id)
            if (message == null) {
                recordDeadTransition(item, MISSING_EVENT_MESSAGE_ERROR, NotificationEventPublishResult.MISSING_PAYLOAD)
            } else {
                publishMessage(item, message, transitionAt)
            }
        }

        private fun publishMessage(
            item: NotificationEventOutboxItem,
            message: NotificationEventMessage,
            transitionAt: Instant,
        ) {
            val publishError =
                try {
                    notificationEventPublisherPort.publish(message, item.kafkaTopic, item.kafkaKey, item.requestId)
                    null
                } catch (exception: Exception) {
                    exception.toPublishStorageError()
                }
            if (publishError == null) {
                recordPublished(item, transitionAt)
            } else {
                recordPublishFailure(item, publishError)
            }
        }

        private fun recordPublished(
            item: NotificationEventOutboxItem,
            transitionAt: Instant,
        ) {
            val committed = notificationEventOutboxPort.markPublished(item.id, item.lockedAt)
            val result = committed.resultOrStale(NotificationEventPublishResult.SUCCESS)
            if (committed) {
                operationalMetrics.recordDeliveryLatency(
                    item.eventType,
                    Duration.between(item.createdAt.toInstant(), transitionAt),
                )
            }
            operationalMetrics.recordOutboxPublish(result)
            logTransition(result, item.attemptCount + 1)
        }

        private fun retryDelayMinutes(attemptCount: Int): Long =
            runtimeProperties.worker.retryDelays
                .getOrElse(attemptCount) { runtimeProperties.worker.retryDelays.last() }
                .toMinutes()

        private fun recordPublishFailure(
            item: NotificationEventOutboxItem,
            error: String,
        ) {
            val attemptedResult: NotificationEventPublishResult
            val committed: Boolean
            if (item.attemptCount + 1 >= runtimeProperties.kafka.maxPublishAttempts) {
                attemptedResult = NotificationEventPublishResult.DEAD
                committed = notificationEventOutboxPort.markPublishDead(item.id, item.lockedAt, error)
            } else {
                attemptedResult = NotificationEventPublishResult.FAILURE
                committed =
                    notificationEventOutboxPort.markPublishFailed(
                        id = item.id,
                        lockedAt = item.lockedAt,
                        error = error,
                        nextAttemptDelayMinutes = retryDelayMinutes(item.attemptCount),
                    )
            }
            val result = committed.resultOrStale(attemptedResult)
            operationalMetrics.recordOutboxPublish(result)
            logTransition(result, item.attemptCount + 1)
        }

        private fun recordDeadTransition(
            item: NotificationEventOutboxItem,
            error: String,
            attemptedResult: NotificationEventPublishResult,
        ) {
            val committed = notificationEventOutboxPort.markPublishDead(item.id, item.lockedAt, error)
            val result = committed.resultOrStale(attemptedResult)
            operationalMetrics.recordOutboxPublish(result)
            logTransition(result, item.attemptCount + 1)
        }

        private fun Boolean.resultOrStale(attemptedResult: NotificationEventPublishResult) =
            if (this) attemptedResult else NotificationEventPublishResult.STALE_LEASE

        private fun logTransition(
            result: NotificationEventPublishResult,
            attemptCount: Int,
        ) {
            if (result == NotificationEventPublishResult.SUCCESS) {
                logger.info("Notification event publish transition committed result={}", result.tag)
            } else {
                logger.warn(
                    "Notification event publish transition completed result={} attemptCount={}",
                    result.tag,
                    attemptCount,
                )
            }
        }

        private fun Exception.toPublishStorageError(): String =
            sanitizeNotificationError(message ?: javaClass.simpleName, MAX_PUBLISH_ERROR_LENGTH)
                ?: javaClass.simpleName.take(MAX_PUBLISH_ERROR_LENGTH)

        private companion object {
            private val logger = LoggerFactory.getLogger(NotificationRelayService::class.java)
        }
    }
