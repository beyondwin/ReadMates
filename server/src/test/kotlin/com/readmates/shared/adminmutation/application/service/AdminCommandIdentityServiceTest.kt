package com.readmates.shared.adminmutation.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.shared.adminmutation.application.model.ADMIN_COMMAND_IDENTITY_PURPOSE
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.DigestKeyUnavailableException
import com.readmates.shared.adminmutation.application.model.InvalidAdminCommandIdentityException
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.security.RequestIdentityHmac
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.mock.env.MockEnvironment
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.Normalizer
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.reflect.full.memberProperties

class AdminCommandIdentityServiceTest {
    private lateinit var logAppender: ListAppender<ILoggingEvent>
    private lateinit var logger: Logger

    @BeforeEach
    fun captureLogs() {
        logger = LoggerFactory.getLogger(AdminCommandIdentityService::class.java) as Logger
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
    fun `nfc equivalent free text produces the same request hmac`() {
        val composed = "Cafe\u0301 모임"
        val nfc = Normalizer.normalize(composed, Normalizer.Form.NFC)
        assertThat(composed).isNotEqualTo(nfc)

        val left = service().digest(identity(), request(reason = composed, email = "host@example.com"))
        val right = service().digest(identity(), request(reason = nfc, email = "host@example.com"))

        assertSameDigest(left, right)
    }

    @Test
    fun `emoji and combining characters are nfc canonicalized`() {
        val family = "가족\u200D모임👨‍👩‍👧"
        val combining = "서점\u0301"
        val left = service().digest(identity(), request(reason = family, email = combining))
        val right =
            service().digest(
                identity(),
                request(
                    reason = Normalizer.normalize(family, Normalizer.Form.NFC),
                    email = Normalizer.normalize(combining, Normalizer.Form.NFC),
                ),
            )
        assertSameDigest(left, right)
    }

    @Test
    fun `canonical field order does not change the request hmac`() {
        val left =
            service().digest(
                identity(),
                request(listOf("reason" to "approved", "email" to "ops@example.com")),
            )
        val right =
            service().digest(
                identity(),
                request(listOf("email" to "ops@example.com", "reason" to "approved")),
            )
        assertSameDigest(left, right)
    }

    @Test
    fun `absent canonical fields differ from empty string fields`() {
        val absent = service().digest(identity(), request(emptyList()))
        val emptyReason = service().digest(identity(), request(listOf("reason" to "")))
        val emptyEmail = service().digest(identity(), request(listOf("email" to "")))

        assertDifferentRequestHmac(absent, emptyReason)
        assertDifferentRequestHmac(absent, emptyEmail)
        assertDifferentRequestHmac(emptyReason, emptyEmail)
        assertThat(MessageDigest.isEqual(absent.idempotencyKeyHmac, emptyReason.idempotencyKeyHmac)).isTrue()
    }

    @Test
    fun `length prefixes prevent delimiter collisions`() {
        val first = service().digest(identity(), request(listOf("a" to "bc")))
        val second = service().digest(identity(), request(listOf("ab" to "c")))
        val split = service().digest(identity(), request(listOf("a" to "b", "c" to "")))
        val piped = service().digest(identity(), request(listOf("a|b" to "c")))
        val nullByte = service().digest(identity(), request(listOf("a" to "b\u0000c")))

        assertDifferentRequestHmac(first, second)
        assertDifferentRequestHmac(first, split)
        assertDifferentRequestHmac(second, piped)
        assertDifferentRequestHmac(first, nullByte)
    }

    @Test
    fun `actor command and target identity are separated`() {
        val baseline = service().digest(identity(), request())
        val otherActor = service().digest(identity(platformAdminUserId = OTHER_ADMIN_ID), request())
        val otherCommand = service().digest(identity(commandType = "club.publish"), request())
        val otherTargetType = service().digest(identity(targetType = "member"), request())
        val otherTarget = service().digest(identity(targetId = OTHER_TARGET_ID.toString()), request())
        val newClub = service().digest(identity(targetId = "new-club"), request())

        assertDifferentRequestHmac(baseline, otherActor)
        assertDifferentRequestHmac(baseline, otherCommand)
        assertDifferentRequestHmac(baseline, otherTargetType)
        assertDifferentRequestHmac(baseline, otherTarget)
        assertDifferentRequestHmac(baseline, newClub)
        assertThat(MessageDigest.isEqual(baseline.idempotencyKeyHmac, otherActor.idempotencyKeyHmac)).isTrue()
    }

    @Test
    fun `identity model never includes club membership ids`() {
        val names =
            PlatformAdminCommandIdentity::class.memberProperties.map { property -> property.name }
        assertThat(names).containsExactlyInAnyOrder(
            "platformAdminUserId",
            "commandType",
            "targetType",
            "targetId",
            "idempotencyKey",
        )
        assertThat(names).doesNotContain("membershipId", "actorMembershipId", "clubId")
    }

    @Test
    fun `same secret key is stable and a different secret key changes both hmacs`() {
        val first = service().digest(identity(), request())
        val second = service().digest(identity(), request())
        val otherKey =
            service(
                properties(
                    currentKey = OTHER_CURRENT_KEY,
                    previousKey = "",
                    previousKeyVersion = 0,
                ),
            ).digest(identity(), request())

        assertSameDigest(first, second)
        assertDifferentDigest(first, otherKey)
    }

    @Test
    fun `key rotation verifies previous version and signs with the current version`() {
        val versionOne = service().digest(identity(), request())
        val rotated =
            service(
                properties(
                    currentKey = ROTATED_CURRENT_KEY,
                    currentKeyVersion = 2,
                    previousKey = CURRENT_KEY,
                    previousKeyVersion = 1,
                ),
            )
        val versionTwo = rotated.digest(identity(), request())

        assertThat(versionOne.digestKeyVersion).isEqualTo(1)
        assertThat(versionTwo.digestKeyVersion).isEqualTo(2)
        assertDifferentDigest(versionOne, versionTwo)
        assertThat(rotated.matches(identity(), request(), versionOne)).isTrue()
        assertThat(rotated.matches(identity(), request(), versionTwo)).isTrue()
        assertThat(service().matches(identity(), request(), versionOne)).isTrue()
    }

    @Test
    fun `unknown and retired digest key versions fail closed`() {
        val versionOne = service().digest(identity(), request())
        val unknown =
            AdminCommandDigest(
                schemaVersion = versionOne.schemaVersion,
                digestKeyVersion = 99,
                idempotencyKeyHmac = versionOne.idempotencyKeyHmac.copyOf(),
                requestHmac = versionOne.requestHmac.copyOf(),
            )
        val retired =
            service(
                properties(
                    currentKey = ROTATED_CURRENT_KEY,
                    currentKeyVersion = 2,
                    previousKey = "",
                    previousKeyVersion = 1,
                ),
            )

        assertThatThrownBy { service().matches(identity(), request(), unknown) }
            .isInstanceOf(DigestKeyUnavailableException::class.java)
        assertThatThrownBy { retired.matches(identity(), request(), versionOne) }
            .isInstanceOf(DigestKeyUnavailableException::class.java)
        assertThatThrownBy { service(properties(currentKey = "")).digest(identity(), request()) }
            .isInstanceOf(DigestKeyUnavailableException::class.java)
    }

    @Test
    fun `verification compares both hmacs with the constant-time primitive`() {
        val digest = service().digest(identity(), request())
        val requestTampered = digest.copy(requestHmac = flip(digest.requestHmac))
        val keyTampered = digest.copy(idempotencyKeyHmac = flip(digest.idempotencyKeyHmac))
        val bothTampered =
            digest.copy(
                requestHmac = flip(digest.requestHmac),
                idempotencyKeyHmac = flip(digest.idempotencyKeyHmac),
            )

        assertThat(service().matches(identity(), request(), digest)).isTrue()
        assertThat(service().matches(identity(), request(), requestTampered)).isFalse()
        assertThat(service().matches(identity(), request(), keyTampered)).isFalse()
        assertThat(service().matches(identity(), request(), bothTampered)).isFalse()
        assertThat(RequestIdentityHmac.equal(digest.requestHmac, digest.requestHmac)).isTrue()
        assertThat(RequestIdentityHmac.equal(digest.requestHmac, flip(digest.requestHmac))).isFalse()
        assertThat(RequestIdentityHmac.equal(byteArrayOf(1, 2), byteArrayOf(1, 2, 3))).isFalse()
        assertThat(RequestIdentityHmac.equal(digest.requestHmac, digest.requestHmac))
            .isEqualTo(MessageDigest.isEqual(digest.requestHmac, digest.requestHmac))
        assertThat(digest).isEqualTo(digest.copy())
        assertThat(digest).isNotEqualTo(requestTampered)
    }

    @Test
    fun `hmac primitive is HmacSHA256 with an explicit purpose prefix`() {
        val key = CURRENT_KEY.toByteArray(StandardCharsets.UTF_8)
        val payload = "canonical-bytes".toByteArray(StandardCharsets.UTF_8)
        val actual = RequestIdentityHmac.hmac(key, payload, ADMIN_COMMAND_IDENTITY_PURPOSE)
        val expected = hmacSha256(key, ADMIN_COMMAND_IDENTITY_PURPOSE, payload)
        val hostPurpose = hmacSha256(key, "readmates:mutation-identity:v1", payload)

        assertThat(actual).isEqualTo(expected)
        assertThat(MessageDigest.isEqual(actual, hostPurpose)).isFalse()
        assertThatThrownBy { RequestIdentityHmac.hmac(key, payload, "") }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `digest dto and logs never include raw reason email idempotency key or canonical request`() {
        val payload = request(reason = SENSITIVE_REASON, email = SENSITIVE_EMAIL)
        val commandIdentity = identity(idempotencyKey = SENSITIVE_IDEMPOTENCY_KEY)
        val digest = service().digest(commandIdentity, payload)
        val rendered = digest.toString()
        val identityRendered = commandIdentity.toString()
        val logText = capturedLogText()

        assertThat(commandIdentity.idempotencyKey).isEqualTo(SENSITIVE_IDEMPOTENCY_KEY)
        assertThat(identityRendered).doesNotContain(SENSITIVE_IDEMPOTENCY_KEY)
        assertThat(rendered).doesNotContain(
            SENSITIVE_REASON,
            SENSITIVE_EMAIL,
            SENSITIVE_IDEMPOTENCY_KEY,
            CURRENT_KEY,
        )
        assertThat(rendered).contains("requestHmacSize=32", "idempotencyKeyHmacSize=32")
        assertThat(logAppender.list).isNotEmpty()
        assertThat(logText).doesNotContain(
            SENSITIVE_REASON,
            SENSITIVE_EMAIL,
            SENSITIVE_IDEMPOTENCY_KEY,
            CURRENT_KEY,
            "canonicalRequest",
        )
        assertThat(hex(digest.requestHmac)).doesNotContain(SENSITIVE_REASON, SENSITIVE_EMAIL)
        assertThat(hex(digest.idempotencyKeyHmac)).doesNotContain(SENSITIVE_IDEMPOTENCY_KEY)
    }

    @Test
    fun `properties toString and validate messages never include hmac secrets`() {
        val configured = properties(currentKey = CURRENT_KEY, previousKey = PREVIOUS_KEY)
        val rendered = configured.toString()
        assertThat(rendered).doesNotContain(CURRENT_KEY, PREVIOUS_KEY)
        assertThat(rendered).contains("currentKeyVersion=1", "previousKeyVersion=0")

        val env = MockEnvironment()
        assertThatThrownBy { properties(currentKey = "").validate(env) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageNotContaining(CURRENT_KEY)
            .hasMessageNotContaining(PREVIOUS_KEY)
    }

    @Test
    fun `changing free text changes request hmac but not the idempotency key fingerprint`() {
        val left = service().digest(identity(), request(reason = "keep-club"))
        val right = service().digest(identity(), request(reason = "close-club"))
        val otherKey = service().digest(identity(idempotencyKey = "other-command-key-1"), request(reason = "keep-club"))

        assertDifferentRequestHmac(left, right)
        assertThat(MessageDigest.isEqual(left.idempotencyKeyHmac, right.idempotencyKeyHmac)).isTrue()
        assertThat(MessageDigest.isEqual(left.requestHmac, otherKey.requestHmac)).isTrue()
        assertThat(MessageDigest.isEqual(left.idempotencyKeyHmac, otherKey.idempotencyKeyHmac)).isFalse()
    }

    @Test
    fun `invalid identity values are rejected before hmac`() {
        assertThatThrownBy { service().digest(identity(commandType = ""), request()) }
            .isInstanceOf(InvalidAdminCommandIdentityException::class.java)
        assertThatThrownBy { service().digest(identity(targetId = "not a slot"), request()) }
            .isInstanceOf(InvalidAdminCommandIdentityException::class.java)
        assertThatThrownBy { service().digest(identity(idempotencyKey = "short"), request()) }
            .isInstanceOf(InvalidAdminCommandIdentityException::class.java)
        assertThatThrownBy {
            service().digest(identity(), request(listOf("reason" to "a", "reason" to "b")))
        }.isInstanceOf(InvalidAdminCommandIdentityException::class.java)
    }

    @Test
    fun `production like blank digest secret fails closed`() {
        val env = MockEnvironment()
        val blank = AdminCommandIdentityProperties(currentKey = "", allowEmptySecret = false)
        assertThatThrownBy { blank.validate(env) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY")
        assertThatThrownBy {
            AdminCommandIdentityProperties(
                currentKey = CURRENT_KEY,
                currentKeyVersion = 1,
                previousKeyVersion = 1,
            ).validate(env)
        }.isInstanceOf(IllegalStateException::class.java)
    }

    private fun capturedLogText(): String =
        logAppender.list.joinToString(separator = "\n") { event ->
            buildString {
                append(event.formattedMessage)
                event.argumentArray?.forEach { argument -> append('\n').append(argument) }
                event.throwableProxy?.message?.let { message -> append('\n').append(message) }
            }
        }

    private companion object {
        val ADMIN_ID: UUID = UUID.fromString("00000000-0000-4000-8000-000000000001")
        val OTHER_ADMIN_ID: UUID = UUID.fromString("00000000-0000-4000-8000-000000000002")
        val TARGET_ID: UUID = UUID.fromString("00000000-0000-4000-8000-0000000000aa")
        val OTHER_TARGET_ID: UUID = UUID.fromString("00000000-0000-4000-8000-0000000000bb")
        const val CURRENT_KEY = "test-admin-command-digest-current-key"
        const val PREVIOUS_KEY = "test-admin-command-digest-previous-key"
        const val OTHER_CURRENT_KEY = "test-admin-command-digest-other-key"
        const val ROTATED_CURRENT_KEY = "test-admin-command-digest-rotated-key"
        const val SENSITIVE_REASON = "do-not-log-this-reason"
        const val SENSITIVE_EMAIL = "do-not-log@example.com"
        const val SENSITIVE_IDEMPOTENCY_KEY = "idempotency-secret-key-value"

        fun service(properties: AdminCommandIdentityProperties = properties()): AdminCommandIdentityService =
            AdminCommandIdentityService(properties)

        fun properties(
            currentKey: String = CURRENT_KEY,
            currentKeyVersion: Int = 1,
            previousKey: String = PREVIOUS_KEY,
            previousKeyVersion: Int = 0,
        ) = AdminCommandIdentityProperties(
            currentKey = currentKey,
            currentKeyVersion = currentKeyVersion,
            previousKey = previousKey,
            previousKeyVersion = previousKeyVersion,
            allowEmptySecret = false,
        )

        fun identity(
            platformAdminUserId: UUID = ADMIN_ID,
            commandType: String = "club.create",
            targetType: String = "club",
            targetId: String = TARGET_ID.toString(),
            idempotencyKey: String = "idempotency-key-0001",
        ) = PlatformAdminCommandIdentity(
            platformAdminUserId = platformAdminUserId,
            commandType = commandType,
            targetType = targetType,
            targetId = targetId,
            idempotencyKey = idempotencyKey,
        )

        fun request(
            fields: List<Pair<String, String>>,
            schemaVersion: String = "club-create:v1",
        ) = FixtureRequest(schemaVersion, fields)

        fun request(
            reason: String = "approved",
            email: String = "ops@example.com",
            schemaVersion: String = "club-create:v1",
        ) = request(listOf("reason" to reason, "email" to email), schemaVersion)

        fun assertSameDigest(
            left: AdminCommandDigest,
            right: AdminCommandDigest,
        ) {
            assertThat(left.schemaVersion).isEqualTo(right.schemaVersion)
            assertThat(left.digestKeyVersion).isEqualTo(right.digestKeyVersion)
            assertThat(MessageDigest.isEqual(left.requestHmac, right.requestHmac)).isTrue()
            assertThat(MessageDigest.isEqual(left.idempotencyKeyHmac, right.idempotencyKeyHmac)).isTrue()
        }

        fun assertDifferentDigest(
            left: AdminCommandDigest,
            right: AdminCommandDigest,
        ) {
            val sameRequest = MessageDigest.isEqual(left.requestHmac, right.requestHmac)
            val sameKey = MessageDigest.isEqual(left.idempotencyKeyHmac, right.idempotencyKeyHmac)
            assertThat(sameRequest && sameKey).isFalse()
        }

        fun assertDifferentRequestHmac(
            left: AdminCommandDigest,
            right: AdminCommandDigest,
        ) {
            assertThat(MessageDigest.isEqual(left.requestHmac, right.requestHmac)).isFalse()
        }

        fun flip(bytes: ByteArray): ByteArray =
            bytes.copyOf().also { copy ->
                copy[0] = (copy[0].toInt() xor 1).toByte()
            }

        fun hex(bytes: ByteArray): String = bytes.joinToString("") { byte -> "%02x".format(byte) }

        fun hmacSha256(
            key: ByteArray,
            purpose: String,
            payload: ByteArray,
        ): ByteArray {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(key, "HmacSHA256"))
            mac.update("$purpose\u0000".toByteArray(StandardCharsets.UTF_8))
            return mac.doFinal(payload)
        }
    }

    private data class FixtureRequest(
        override val schemaVersion: String,
        private val fields: List<Pair<String, String>>,
    ) : CanonicalAdminCommandRequest {
        override fun canonicalFields(): List<Pair<String, String>> = fields
    }
}
