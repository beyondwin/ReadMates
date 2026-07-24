package com.readmates.notification.kafka

import com.readmates.notification.adapter.`in`.kafka.NotificationEventKafkaListener
import com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapter
import com.readmates.notification.adapter.out.kafka.NotificationKafkaConfiguration
import com.readmates.notification.adapter.out.kafka.NotificationKafkaProperties
import com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapter
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.application.service.NotificationDeliveryEngine
import com.readmates.notification.application.service.NotificationDeliveryTransactionalOperations
import com.readmates.notification.application.service.NotificationDispatchService
import com.readmates.notification.application.service.ReadmatesOperationalMetrics
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.KafkaTestContainer
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.SpringBootConfiguration
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration
import org.springframework.boot.jdbc.autoconfigure.DataSourceTransactionManagerAutoConfiguration
import org.springframework.boot.jdbc.autoconfigure.JdbcTemplateAutoConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.transaction.autoconfigure.TransactionAutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.kafka.annotation.EnableKafka
import org.springframework.kafka.config.KafkaListenerEndpointRegistry
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.test.utils.ContainerTestUtils
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import tools.jackson.databind.ObjectMapper
import java.time.Duration
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

private const val PIPELINE_CLUB_ID = "22222222-2222-4222-8222-222222222222"
private const val PIPELINE_SESSION_ID = "33333333-3333-4333-8333-333333333333"
private const val PIPELINE_MEMBERSHIP_ID = "77777777-7777-4777-8777-777777777777"
private const val PIPELINE_USER_ID = "88888888-8888-4888-8888-888888888888"
private const val PIPELINE_APP_BASE_URL = "https://example.test"
private const val CLEANUP_NOTIFICATION_KAFKA_PIPELINE_SQL = """
    delete from member_notifications where club_id = '$PIPELINE_CLUB_ID';
    delete from notification_deliveries where club_id = '$PIPELINE_CLUB_ID';
    delete from notification_event_outbox where club_id = '$PIPELINE_CLUB_ID';
    delete from session_participants where club_id = '$PIPELINE_CLUB_ID';
    delete from sessions where club_id = '$PIPELINE_CLUB_ID';
    delete from memberships where club_id = '$PIPELINE_CLUB_ID';
    delete from users where id = '$PIPELINE_USER_ID';
    delete from clubs where id = '$PIPELINE_CLUB_ID';
"""

@SpringBootTest(
    classes = [
        NotificationKafkaPipelineIntegrationTest.TestApplication::class,
        NotificationKafkaConfiguration::class,
        NotificationEventKafkaListener::class,
        NotificationKafkaPipelineIntegrationTest.TestDispatchConfiguration::class,
    ],
    properties = [
        "readmates.notifications.enabled=true",
        "readmates.notifications.kafka.enabled=true",
        "readmates.notifications.kafka.delivery-retry-backoff=10ms",
        "readmates.notifications.kafka.delivery-retry-max-attempts=0",
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_KAFKA_PIPELINE_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_KAFKA_PIPELINE_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
@Tag("container")
class NotificationKafkaPipelineIntegrationTest(
    @param:Autowired
    private val notificationEventPublisherPort: NotificationEventPublisherPort,
    @param:Autowired private val recordingDispatchUseCase: RecordingDispatchNotificationEventUseCase,
    @param:Autowired private val recordingMailDeliveryPort: RecordingMailDeliveryPort,
    @param:Autowired private val kafkaListenerEndpointRegistry: KafkaListenerEndpointRegistry,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val objectMapper: ObjectMapper,
) : ReadmatesMySqlIntegrationTestSupport() {
    @BeforeEach
    fun resetDispatchRecorder() {
        recordingDispatchUseCase.clear()
        recordingMailDeliveryPort.clear()
    }

    @Test
    fun `published notification event is consumed and dispatched`() {
        val message = notificationEventMessage()
        insertEventFixture(message)
        waitForListenerAssignment()

        notificationEventPublisherPort.publish(message, eventsTopic, message.clubId.toString(), requestId = null)

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(recordingDispatchUseCase.receivedMessages()).containsExactly(message)
            }
    }

    @Test
    fun `published manual notification event preserves dispatch metadata through Kafka`() {
        val message = manualNotificationEventMessage()
        insertEventFixture(message)
        waitForListenerAssignment()

        notificationEventPublisherPort.publish(message, eventsTopic, message.clubId.toString(), requestId = null)

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                val received = recordingDispatchUseCase.receivedMessages()
                assertThat(received).containsExactly(message)
                assertThat(received.single().payload.manualDispatch)
                    .isEqualTo(message.payload.manualDispatch)
            }
    }

    @Test
    fun `redelivery of the same event id creates one logical dispatch and preserves request metadata`() {
        val message = notificationEventMessage()
        val requestId = "request-r09-kafka-redelivery"
        insertEventFixture(message, requestId)
        waitForListenerAssignment()

        notificationEventPublisherPort.publish(message, eventsTopic, message.clubId.toString(), requestId)
        notificationEventPublisherPort.publish(message, eventsTopic, message.clubId.toString(), requestId)

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(recordingDispatchUseCase.receivedMessages()).containsExactly(message, message)
                assertThat(recordingDispatchUseCase.requestIds()).containsExactly(requestId, requestId)
                assertThat(recordingMailDeliveryPort.commands()).hasSize(1)
                assertThat(deliveryRows(message.eventId)).isEqualTo(2)
                assertThat(memberNotificationRows(message.eventId)).isEqualTo(1)
                val emailRow = emailDeliveryRow(message.eventId)
                assertThat(emailRow["event_id"]).isEqualTo(message.eventId.toString())
                assertThat(emailRow["club_id"]).isEqualTo(message.clubId.toString())
                assertThat(emailRow["recipient_membership_id"]).isEqualTo(PIPELINE_MEMBERSHIP_ID)
                assertThat(emailRow["dedupe_key"])
                    .isEqualTo("${message.eventId}:$PIPELINE_MEMBERSHIP_ID:EMAIL")
                assertThat(emailRow["status"]).isEqualTo("SENT")
                assertThat(emailRow["attempt_count"]).isEqualTo(0)
                assertThat(emailRow["locked_at"]).isNull()
                assertThat(emailRow["sent_at"]).isNotNull()
                assertThat(emailRow["last_error"]).isNull()
            }
    }

    private fun insertEventFixture(
        message: NotificationEventMessage,
        requestId: String? = null,
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'notification-pipeline-test', 'Pipeline Test Club', 'Read safely', 'Kafka redelivery fixture.')
            """.trimIndent(),
            PIPELINE_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, 'pipeline-test-subject', 'pipeline-recipient@example.test', 'Pipeline Recipient', 'Recipient', 'GOOGLE')
            """.trimIndent(),
            PIPELINE_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), 'Recipient')
            """.trimIndent(),
            PIPELINE_MEMBERSHIP_ID,
            PIPELINE_CLUB_ID,
            PIPELINE_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label,
              question_deadline_at, state, visibility
            ) values (
              ?, ?, 6, 'Pipeline Test Session', 'Example Book', 'Example Author',
              '2026-05-01', '19:30:00', '21:30:00', 'Online',
              '2026-04-30 12:00:00.000000', 'OPEN', 'MEMBER'
            )
            """.trimIndent(),
            PIPELINE_SESSION_ID,
            PIPELINE_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, request_id, aggregate_type, aggregate_id,
              payload_json, kafka_topic, kafka_key, status, dedupe_key, published_at, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, utc_timestamp(6), ?)
            """.trimIndent(),
            message.eventId.toString(),
            message.clubId.toString(),
            message.eventType.name,
            requestId,
            message.aggregateType,
            message.aggregateId.toString(),
            objectMapper.writeValueAsString(message.payload),
            eventsTopic,
            message.clubId.toString(),
            "notification-pipeline:${message.eventId}",
            message.occurredAt.toLocalDateTime(),
        )
    }

    private fun deliveryRows(eventId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_deliveries where event_id = ?",
            Int::class.java,
            eventId.toString(),
        ) ?: 0

    private fun memberNotificationRows(eventId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from member_notifications where event_id = ?",
            Int::class.java,
            eventId.toString(),
        ) ?: 0

    private fun emailDeliveryRow(eventId: UUID): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select event_id, club_id, recipient_membership_id, dedupe_key, status, attempt_count,
                   locked_at, sent_at, last_error
            from notification_deliveries
            where event_id = ?
              and channel = 'EMAIL'
            """.trimIndent(),
            eventId.toString(),
        )

    private fun waitForListenerAssignment() {
        val listenerContainers = kafkaListenerEndpointRegistry.listenerContainers
        assertThat(listenerContainers).hasSize(1)
        ContainerTestUtils.waitForAssignment(listenerContainers.single(), 1)
    }

    @SpringBootConfiguration
    @EnableKafka
    @ImportAutoConfiguration(
        DataSourceAutoConfiguration::class,
        JdbcTemplateAutoConfiguration::class,
        DataSourceTransactionManagerAutoConfiguration::class,
        TransactionAutoConfiguration::class,
        FlywayAutoConfiguration::class,
        JacksonAutoConfiguration::class,
    )
    class TestApplication

    @TestConfiguration(proxyBeanMethods = false)
    class TestDispatchConfiguration {
        @Bean
        fun jdbcNotificationDeliveryAdapter(
            jdbcTemplate: JdbcTemplate,
            objectMapper: ObjectMapper,
        ): JdbcNotificationDeliveryAdapter {
            val appBaseUrl = PIPELINE_APP_BASE_URL
            return JdbcNotificationDeliveryAdapter(jdbcTemplate, objectMapper, appBaseUrl)
        }

        @Bean
        fun notificationDeliveryTransactionalOperations(
            adapter: JdbcNotificationDeliveryAdapter,
        ): NotificationDeliveryTransactionalOperations = NotificationDeliveryTransactionalOperations(adapter, adapter)

        @Bean
        fun recordingMailDeliveryPort(): RecordingMailDeliveryPort = RecordingMailDeliveryPort()

        @Bean
        fun notificationDeliveryEngine(
            adapter: JdbcNotificationDeliveryAdapter,
            mailDeliveryPort: RecordingMailDeliveryPort,
        ): NotificationDeliveryEngine =
            NotificationDeliveryEngine(
                deliveryStatusPort = adapter,
                mailDeliveryPort = mailDeliveryPort,
                metrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
                maxAttempts = 5,
                retryDelayMinutesConfig = listOf(5L, 15L, 60L, 240L),
            )

        @Bean
        fun notificationDispatchService(
            adapter: JdbcNotificationDeliveryAdapter,
            deliveryEngine: NotificationDeliveryEngine,
            transactionalOperations: NotificationDeliveryTransactionalOperations,
        ): NotificationDispatchService =
            NotificationDispatchService(
                deliveryStatusPort = adapter,
                deliveryEngine = deliveryEngine,
                transactionalOps = transactionalOperations,
                meterRegistry = SimpleMeterRegistry(),
            )

        @Bean
        @Primary
        fun recordingDispatchNotificationEventUseCase(delegate: NotificationDispatchService) =
            RecordingDispatchNotificationEventUseCase(delegate)

        @Bean
        fun notificationEventPublisherPort(
            @Qualifier("notificationEventKafkaTemplate")
            kafkaTemplate: KafkaTemplate<String, NotificationEventMessage>,
            properties: NotificationKafkaProperties,
        ): NotificationEventPublisherPort = KafkaNotificationEventPublisherAdapter(kafkaTemplate, properties)
    }

    companion object {
        private val topicSuffix = UUID.randomUUID().toString()
        private val eventsTopic = "readmates.notification.events.pipeline.$topicSuffix"
        private val dlqTopic = "readmates.notification.events.pipeline.dlq.$topicSuffix"
        private val consumerGroup = "readmates-notification-pipeline-$topicSuffix"

        @JvmStatic
        @DynamicPropertySource
        fun registerKafkaProperties(registry: DynamicPropertyRegistry) {
            val bootstrapServers = KafkaTestContainer.container.bootstrapServers
            createTopic(bootstrapServers, eventsTopic)
            createTopic(bootstrapServers, dlqTopic)

            registry.add("readmates.notifications.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("readmates.notifications.kafka.events-topic") { eventsTopic }
            registry.add("readmates.notifications.kafka.consumer-group") { consumerGroup }
            registry.add("readmates.notifications.kafka.dlq-topic") { dlqTopic }
        }

        private fun createTopic(
            bootstrapServers: String,
            topic: String,
        ) {
            AdminClient
                .create(
                    mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers),
                ).use { adminClient ->
                    adminClient
                        .createTopics(listOf(NewTopic(topic, 1, 1.toShort())))
                        .all()
                        .get(10, TimeUnit.SECONDS)
                }
        }

        private fun notificationEventMessage(): NotificationEventMessage =
            NotificationEventMessage(
                eventId = UUID.fromString("11111111-1111-4111-8111-111111111111"),
                clubId = UUID.fromString("22222222-2222-4222-8222-222222222222"),
                eventType = NotificationEventType.SESSION_REMINDER_DUE,
                aggregateType = "SESSION",
                aggregateId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
                occurredAt = OffsetDateTime.of(2026, 4, 29, 12, 0, 0, 0, ZoneOffset.UTC),
                payload =
                    NotificationEventPayload(
                        sessionId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
                        sessionNumber = 6,
                        bookTitle = "Example Book",
                        targetDate = LocalDate.of(2026, 5, 1),
                    ),
            )

        private fun manualNotificationEventMessage(): NotificationEventMessage =
            NotificationEventMessage(
                eventId = UUID.fromString("11111111-1111-4111-8111-111111111112"),
                clubId = UUID.fromString("22222222-2222-4222-8222-222222222222"),
                eventType = NotificationEventType.SESSION_REMINDER_DUE,
                aggregateType = "SESSION",
                aggregateId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
                occurredAt = OffsetDateTime.of(2026, 4, 29, 12, 5, 0, 0, ZoneOffset.UTC),
                payload =
                    NotificationEventPayload(
                        sessionId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
                        sessionNumber = 6,
                        bookTitle = "Example Book",
                        targetDate = LocalDate.of(2026, 5, 1),
                        manualDispatch =
                            NotificationManualDispatchPayload(
                                id = UUID.fromString("44444444-4444-4444-8444-444444444444"),
                                source = NotificationDispatchSource.MANUAL,
                                requestedByMembershipId = UUID.fromString("55555555-5555-4555-8555-555555555555"),
                                requestedChannels = ManualNotificationRequestedChannels.IN_APP,
                                audience = ManualNotificationAudience.SESSION_PARTICIPANTS,
                                excludedMembershipIds = listOf(UUID.fromString("66666666-6666-4666-8666-666666666666")),
                                includedMembershipIds = listOf(UUID.fromString("77777777-7777-4777-8777-777777777777")),
                                resend = true,
                                sendMode = ManualNotificationSendMode.NOW,
                            ),
                    ),
            )
    }
}

class RecordingDispatchNotificationEventUseCase : DispatchNotificationEventUseCase {
    constructor(delegate: DispatchNotificationEventUseCase) {
        this.delegate = delegate
    }

    private val delegate: DispatchNotificationEventUseCase
    private val received = CopyOnWriteArrayList<RecordedDispatch>()

    override fun dispatch(message: NotificationEventMessage) {
        delegate.dispatch(message)
        received.add(RecordedDispatch(message, MDC.get("requestId")))
    }

    fun receivedMessages(): List<NotificationEventMessage> = received.map { it.message }

    fun requestIds(): List<String?> = received.map { it.requestId }

    fun clear() {
        received.clear()
    }
}

private data class RecordedDispatch(
    val message: NotificationEventMessage,
    val requestId: String?,
)

class RecordingMailDeliveryPort : MailDeliveryPort {
    private val sent = CopyOnWriteArrayList<MailDeliveryCommand>()

    override fun send(command: MailDeliveryCommand) {
        sent += command
    }

    fun commands(): List<MailDeliveryCommand> = sent.toList()

    fun clear() {
        sent.clear()
    }
}
