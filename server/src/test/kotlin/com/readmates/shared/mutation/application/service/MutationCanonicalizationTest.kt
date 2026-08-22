package com.readmates.shared.mutation.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.shared.mutation.adapter.`in`.scheduling.MutationIdempotencyPurgeScheduler
import com.readmates.shared.mutation.application.model.CanonicalMutationPayload
import com.readmates.shared.mutation.application.model.CanonicalRequestDigest
import com.readmates.shared.mutation.application.model.HostMutationOperation
import com.readmates.shared.mutation.application.model.InvalidMutationIdempotencyKeyException
import com.readmates.shared.mutation.application.model.MutationIdentity
import com.readmates.shared.mutation.application.model.UnsupportedCanonicalSchemaException
import com.readmates.shared.mutation.application.port.`in`.PurgeExpiredMutationIdempotencyUseCase
import com.readmates.shared.mutation.application.port.out.MutationIdempotencyPort
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.mock.env.MockEnvironment
import org.springframework.scheduling.annotation.Scheduled
import java.security.MessageDigest
import java.text.Normalizer
import java.time.Clock
import java.time.Duration
import java.util.UUID

class MutationCanonicalizationTest {
    private val registry = SimpleMeterRegistry()
    private val service =
        MutationIdempotencyService(
            port = RecordingPort(),
            properties = TEST_PROPERTIES,
            clock = Clock.systemUTC(),
            metrics = MutationIdempotencyMetrics(registry),
        )
    private lateinit var logAppender: ListAppender<ILoggingEvent>
    private lateinit var logger: Logger

    @BeforeEach
    fun captureLogs() {
        logger = LoggerFactory.getLogger(MutationIdempotencyService::class.java) as Logger
        logAppender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(logAppender)
        logger.level = Level.DEBUG
    }

    @AfterEach
    fun detachLogs() {
        logger.detachAppender(logAppender)
        logAppender.stop()
    }

    @Test
    fun `nfc equivalent meeting titles produce the same hmac`() {
        val composed = "Cafe\u0301 모임"
        val nfc = Normalizer.normalize(composed, Normalizer.Form.NFC)
        assertThat(composed).isNotEqualTo(nfc)

        val left = service.digest(sessionFields(title = composed))
        val right = service.digest(sessionFields(title = nfc))

        assertSameDigest(left, right)
    }

    @Test
    fun `emoji and combining characters are nfc canonicalized`() {
        val family = "가족\u200D모임👨‍👩‍👧"
        val combining = "서점\u0301"
        val left = service.digest(sessionFields(title = family, locationLabel = combining))
        val right =
            service.digest(
                sessionFields(
                    title = Normalizer.normalize(family, Normalizer.Form.NFC),
                    locationLabel = Normalizer.normalize(combining, Normalizer.Form.NFC),
                ),
            )
        assertSameDigest(left, right)
    }

    @Test
    fun `omitted optional fields match schema defaults after default application`() {
        val omitted =
            CanonicalMutationPayload.SessionFields.applyDefaults(
                operation = HostMutationOperation.SESSION_CREATE,
                title = "새 모임",
                bookTitle = "책",
                bookAuthor = "저자",
                date = "2026-08-22",
            )
        val explicit =
            CanonicalMutationPayload.SessionFields.applyDefaults(
                operation = HostMutationOperation.SESSION_CREATE,
                title = "새 모임",
                bookTitle = "책",
                bookAuthor = "저자",
                date = "2026-08-22",
                startTime = "20:00",
                endTime = "22:00",
                accessScope = "HOST_ONLY",
                meetingUrl = null,
                meetingPasscode = null,
            )
        assertSameDigest(service.digest(omitted), service.digest(explicit))
    }

    @Test
    fun `explicit null meeting url matches omitted url and differs from a present url`() {
        val omitted = sessionFields(meetingUrl = null)
        val present = sessionFields(meetingUrl = "https://meet.example.com/room")
        assertSameDigest(service.digest(omitted), service.digest(sessionFields(meetingUrl = null)))
        assertDifferentDigest(service.digest(omitted), service.digest(present))
    }

    @Test
    fun `ordered record entries preserve order`() {
        val firstThenSecond =
            CanonicalMutationPayload.RecordApply(
                entryKeys = listOf("opening", "discussion"),
            )
        val reversed =
            CanonicalMutationPayload.RecordApply(
                entryKeys = listOf("discussion", "opening"),
            )
        assertDifferentDigest(service.digest(firstThenSecond), service.digest(reversed))
        assertSameDigest(service.digest(firstThenSecond), service.digest(firstThenSecond.copy()))
    }

    @Test
    fun `bulk attendance memberships are set sorted`() {
        val membershipA = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000001")
        val membershipB = UUID.fromString("bbbbbbbb-0000-4000-8000-000000000002")
        val left =
            CanonicalMutationPayload.Attendance(
                operation = HostMutationOperation.SESSION_ATTENDANCE_BULK,
                rows =
                    listOf(
                        CanonicalMutationPayload.AttendanceRow(membershipB, "ATTENDED", 1),
                        CanonicalMutationPayload.AttendanceRow(membershipA, "ABSENT", 0),
                    ),
                expectedParticipantSetRevision = 3,
            )
        val right =
            CanonicalMutationPayload.Attendance(
                operation = HostMutationOperation.SESSION_ATTENDANCE_BULK,
                rows =
                    listOf(
                        CanonicalMutationPayload.AttendanceRow(membershipA, "ABSENT", 0),
                        CanonicalMutationPayload.AttendanceRow(membershipB, "ATTENDED", 1),
                    ),
                expectedParticipantSetRevision = 3,
            )
        assertSameDigest(service.digest(left), service.digest(right))
    }

    @Test
    fun `schema version change changes the digest for the same fields`() {
        val payload = sessionFields()
        val versionOne = MutationCanonicalizer.bytes(payload)
        val versionTwo = MutationCanonicalizer.bytes(payload.copy(schemaVersion = 2))
        assertThat(versionOne).isNotEqualTo(versionTwo)
        assertThatThrownBy { service.digest(payload.copy(schemaVersion = 2)) }
            .isInstanceOf(UnsupportedCanonicalSchemaException::class.java)
    }

    @Test
    fun `same payload is stable and a different passcode is a different request`() {
        val first = service.digest(sessionFields(meetingPasscode = "alpha"))
        val second = service.digest(sessionFields(meetingPasscode = "alpha"))
        val other = service.digest(sessionFields(meetingPasscode = "beta"))
        assertSameDigest(first, second)
        assertDifferentDigest(first, other)
    }

    @Test
    fun `malformed idempotency keys are rejected before hmac`() {
        val payload = sessionFields()
        listOf("", " ", "ab", "a".repeat(129), "has space", "slash/key", "unicodé-key", "new\nline").forEach { key ->
            assertThatThrownBy { service.claim(identity(key), payload) }
                .isInstanceOf(InvalidMutationIdempotencyKeyException::class.java)
        }
    }

    @Test
    fun `digest dto and logs never include raw url passcode canonical input or hmac secret`() {
        val payload =
            sessionFields(
                meetingUrl = SENSITIVE_URL,
                meetingPasscode = SENSITIVE_PASSCODE,
            )
        val digest = service.digest(payload)
        val rendered = digest.toString()
        assertThat(rendered).doesNotContain(SENSITIVE_URL, SENSITIVE_PASSCODE, CURRENT_KEY, "cafe")
        assertThat(rendered).contains("hmacSize=32")
        assertThat(logAppender.list.joinToString { it.formattedMessage })
            .doesNotContain(SENSITIVE_URL, SENSITIVE_PASSCODE, CURRENT_KEY)
        assertThat(hex(digest.hmac)).doesNotContain(SENSITIVE_URL, SENSITIVE_PASSCODE)
        val plaintextSha = sha256Hex(MutationCanonicalizer.bytes(payload))
        assertThat(rendered).doesNotContain(plaintextSha)
    }

    @Test
    fun `production like blank hmac secret fails closed`() {
        val env = MockEnvironment()
        val blank = MutationIdempotencyProperties(currentKey = "", allowEmptySecret = false)
        assertThatThrownBy { blank.validate(env) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("READMATES_MUTATION_IDENTITY_CURRENT_KEY")
    }

    @Test
    fun `metrics use bounded outcome tags only`() {
        MutationIdempotencyMetrics(registry).claimOutcome("replayed")
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.key } }.toSet())
            .containsExactly("outcome")
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.value } }.toSet())
            .containsExactly("replayed")
    }

    @Test
    fun `purge scheduler uses bounded delay and does not log secrets`() {
        var calls = 0
        val scheduler =
            MutationIdempotencyPurgeScheduler(
                object : PurgeExpiredMutationIdempotencyUseCase {
                    override fun purgeExpired(limit: Int): Int {
                        calls += 1
                        error("secret=$CURRENT_KEY url=$SENSITIVE_URL")
                    }
                },
                TEST_PROPERTIES,
            )
        val scheduledLogger = LoggerFactory.getLogger(MutationIdempotencyPurgeScheduler::class.java) as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        scheduledLogger.addAppender(appender)
        try {
            scheduler.purgeExpired()
        } finally {
            scheduledLogger.detachAppender(appender)
            appender.stop()
        }
        assertThat(calls).isEqualTo(1)
        assertThat(appender.list.map { it.formattedMessage }.joinToString())
            .doesNotContain(CURRENT_KEY, SENSITIVE_URL)
            .contains("result=failed")
        val scheduled =
            MutationIdempotencyPurgeScheduler::class.java
                .getDeclaredMethod("purgeExpired")
                .getAnnotation(Scheduled::class.java)
        assertThat(scheduled.fixedDelayString)
            .isEqualTo("\${readmates.mutation.idempotency.purge-fixed-delay:1h}")
        assertThat(TEST_PROPERTIES.boundedPurgeBatchSize()).isEqualTo(50)
        assertThat(TEST_PROPERTIES.retention).isEqualTo(Duration.ofHours(24))
    }

    private fun assertSameDigest(
        left: CanonicalRequestDigest,
        right: CanonicalRequestDigest,
    ) {
        assertThat(left.canonicalSchemaVersion).isEqualTo(right.canonicalSchemaVersion)
        assertThat(left.digestKeyVersion).isEqualTo(right.digestKeyVersion)
        assertThat(MessageDigest.isEqual(left.hmac, right.hmac)).isTrue()
    }

    private fun assertDifferentDigest(
        left: CanonicalRequestDigest,
        right: CanonicalRequestDigest,
    ) {
        assertThat(MessageDigest.isEqual(left.hmac, right.hmac)).isFalse()
    }

    private fun sessionFields(
        title: String = "주간 모임",
        locationLabel: String? = "서점",
        meetingUrl: String? = null,
        meetingPasscode: String? = null,
    ) = CanonicalMutationPayload.SessionFields.applyDefaults(
        operation = HostMutationOperation.SESSION_BASIC_SAVE,
        title = title,
        bookTitle = "책",
        bookAuthor = "저자",
        date = "2026-08-22",
        locationLabel = locationLabel,
        meetingUrl = meetingUrl,
        meetingPasscode = meetingPasscode,
    )

    private fun identity(key: String) =
        MutationIdentity(
            clubId = CLUB_ID,
            actorMembershipId = ACTOR_ID,
            operation = HostMutationOperation.SESSION_BASIC_SAVE.name,
            resourceSlot = RESOURCE_SLOT,
            idempotencyKey = key,
        )

    private class RecordingPort : MutationIdempotencyPort {
        override fun claim(row: MutationIdempotencyPort.ClaimRow) = MutationIdempotencyPort.ClaimOutcome.Claimed

        override fun complete(
            identity: MutationIdentity,
            receiptId: UUID,
            at: java.time.Instant,
        ) = Unit

        override fun find(identity: MutationIdentity) = null

        override fun purgeExpired(
            now: java.time.Instant,
            limit: Int,
        ) = 0

        override fun countByDigestKeyVersion(digestKeyVersion: Int) = 0L

        override fun referencedDigestKeyVersions(): Set<Int> = emptySet()

        override fun markReferenced(
            digestKeyVersion: Int,
            at: java.time.Instant,
        ) = Unit

        override fun markUnreferencedIfEmpty(
            digestKeyVersion: Int,
            at: java.time.Instant,
        ) = null

        override fun unreferencedSince(digestKeyVersion: Int) = null
    }

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-4000-8000-000000000001")
        val ACTOR_ID: UUID = UUID.fromString("00000000-0000-4000-8000-000000000002")
        const val RESOURCE_SLOT = "00000000-0000-4000-8000-0000000000aa"
        const val CURRENT_KEY = "test-mutation-identity-current-key"
        const val SENSITIVE_URL = "https://meet.example.com/private-room"
        const val SENSITIVE_PASSCODE = "room-passcode-value"
        val TEST_PROPERTIES =
            MutationIdempotencyProperties(
                currentKey = CURRENT_KEY,
                currentKeyVersion = 1,
                previousKey = "test-mutation-identity-previous-key",
                previousKeyVersion = 0,
                allowEmptySecret = false,
            )

        fun hex(bytes: ByteArray): String = bytes.joinToString("") { byte -> "%02x".format(byte) }

        fun sha256Hex(bytes: ByteArray): String = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
    }
}
