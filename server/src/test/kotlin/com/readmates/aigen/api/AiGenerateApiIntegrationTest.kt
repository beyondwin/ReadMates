package com.readmates.aigen.api

import com.readmates.support.KafkaTestContainer
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.springframework.test.web.servlet.post
import java.time.Duration
import java.util.UUID
import java.util.concurrent.TimeUnit

private const val CLUB_ID = "00000000-0000-0000-0000-000000088600"
private const val SESSION_ID = "00000000-0000-0000-0000-000000088601"
private const val HOST_USER_ID = "00000000-0000-0000-0000-000000088611"
private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000088612"
private const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000088621"
private const val MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000088622"

private const val HOST_EMAIL = "aigen-host@example.test"

private const val CLEANUP_SQL = """
    delete from session_feedback_documents where session_id = '$SESSION_ID';
    delete from public_session_publications where session_id = '$SESSION_ID';
    delete from highlights where session_id = '$SESSION_ID';
    delete from one_line_reviews where session_id = '$SESSION_ID';
    delete from session_participants where session_id = '$SESSION_ID';
    delete from sessions where id = '$SESSION_ID';
    delete from memberships where id in ('$HOST_MEMBERSHIP_ID', '$MEMBER_MEMBERSHIP_ID');
    delete from users where id in ('$HOST_USER_ID', '$MEMBER_USER_ID');
    delete from clubs where id = '$CLUB_ID';
    delete from ai_generation_audit_log where club_id = '$CLUB_ID';
"""

private const val SEED_SQL = """
    insert into clubs (id, slug, name, tagline, about)
    values ('$CLUB_ID', 'aigen-int-club', 'AI Gen Test Club', 'tagline', 'about');
    insert into users (id, email, name, short_name, auth_provider)
    values
      ('$HOST_USER_ID', '$HOST_EMAIL', 'AiGen Host', 'AiGenHost', 'PASSWORD'),
      ('$MEMBER_USER_ID', 'aigen-member@example.test', 'AiGen Member', 'AiGenMember', 'PASSWORD');
    insert into memberships (id, club_id, user_id, role, status, short_name, joined_at)
    values
      ('$HOST_MEMBERSHIP_ID', '$CLUB_ID', '$HOST_USER_ID', 'HOST', 'ACTIVE', 'AiGenHost', '2026-05-01 00:00:00.000000'),
      ('$MEMBER_MEMBERSHIP_ID', '$CLUB_ID', '$MEMBER_USER_ID', 'MEMBER', 'ACTIVE', 'AiGenMember', '2026-05-01 00:00:00.000000');
    insert into sessions (
      id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
      session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
      question_deadline_at, state, visibility
    )
    values (
      '$SESSION_ID', '$CLUB_ID', 8861, '8861차 · AI Gen Book', 'AI Gen Book', 'Book Author',
      null, null, null, '2026-05-14', '20:00:00', '22:00:00', 'Online', null, null,
      '2026-05-13 14:59:00.000000', 'CLOSED', 'MEMBER'
    );
    insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
    values
      ('00000000-0000-0000-0000-000000088631', '$CLUB_ID', '$SESSION_ID', '$HOST_MEMBERSHIP_ID', 'GOING', 'ATTENDED', 'ACTIVE'),
      ('00000000-0000-0000-0000-000000088632', '$CLUB_ID', '$SESSION_ID', '$MEMBER_MEMBERSHIP_ID', 'GOING', 'ATTENDED', 'ACTIVE');
    insert into public_session_publications (id, club_id, session_id, public_summary, is_public, visibility, published_at)
    values ('00000000-0000-0000-0000-000000088641', '$CLUB_ID', '$SESSION_ID', 'placeholder', false, 'MEMBER', null);
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.redis.enabled=true",
        "readmates.aigen.enabled=true",
        "readmates.aigen.mock=true",
        "readmates.aigen.enabled-providers=CLAUDE,OPENAI",
        "readmates.aigen.pricing.claude-sonnet-4-6.input-per-m-token-usd=3.00",
        "readmates.aigen.pricing.claude-sonnet-4-6.cached-input-per-m-token-usd=0.30",
        "readmates.aigen.pricing.claude-sonnet-4-6.output-per-m-token-usd=15.00",
        "readmates.aigen.pricing[gpt-4.1].input-per-m-token-usd=2.00",
        "readmates.aigen.pricing[gpt-4.1].cached-input-per-m-token-usd=0.50",
        "readmates.aigen.pricing[gpt-4.1].output-per-m-token-usd=8.00",
        "readmates.aigen.kafka.enabled=true",
        "spring.kafka.consumer.auto-offset-reset=earliest",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_SQL, SEED_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
@Tag("container")
class AiGenerateApiIntegrationTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val redis: StringRedisTemplate,
) : ReadmatesRedisIntegrationTestSupport() {

    @Test
    fun `full generation lifecycle - start, poll until SUCCEEDED, commit, then Redis keys cleaned`() {
        val transcript = MockMultipartFile(
            "transcript",
            "transcript.txt",
            "text/plain",
            "Stub transcript content for the integration test.".toByteArray(),
        )
        val body = MockMultipartFile(
            "body",
            "body.json",
            "application/json",
            """{"model":"claude-sonnet-4-6","authorNameMode":"real","instructions":null}""".toByteArray(),
        )

        val startResponse = mockMvc.multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
            file(transcript)
            file(body)
            with(user(HOST_EMAIL))
        }.andReturn().response

        assertThat(startResponse.status).isEqualTo(202)
        val jobId = jobIdFrom(startResponse.contentAsString)

        // Wait for the Kafka consumer to dispatch to the worker and the stub to drive
        // the snapshot through the validator + Redis result update.
        await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250)).untilAsserted {
            val status = jobStatusJson(jobId)
            assertThat(status).contains("\"status\":\"SUCCEEDED\"")
        }

        // Sanity: the Redis result key exists with the stub snapshot before commit.
        assertThat(redis.hasKey("aigen:job:$jobId:result")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId:transcript")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId")).isTrue()

        // Commit — no override — must succeed and clean Redis.
        mockMvc.post("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId/commit") {
            with(user(HOST_EMAIL))
            contentType = MediaType.APPLICATION_JSON
            content = """{"recordVisibility":"MEMBER","result":null}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(SESSION_ID) }
            jsonPath("$.publication.summary") { exists() }
        }

        // All 3 Redis keys must be deleted on commit (spec §7.4).
        assertThat(redis.hasKey("aigen:job:$jobId")).isFalse()
        assertThat(redis.hasKey("aigen:job:$jobId:result")).isFalse()
        assertThat(redis.hasKey("aigen:job:$jobId:transcript")).isFalse()

        // The DB must show the imported publication and a feedback document version.
        val summary = jdbcTemplate.queryForObject(
            "select public_summary from public_session_publications where session_id = '$SESSION_ID'",
            String::class.java,
        )
        assertThat(summary).isNotNull
        assertThat(summary).contains("AI Gen Book")
        val feedbackCount = jdbcTemplate.queryForObject(
            "select count(*) from session_feedback_documents where session_id = '$SESSION_ID'",
            Int::class.java,
        )
        assertThat(feedbackCount).isGreaterThanOrEqualTo(1)

        // Audit log has FULL SUCCESS + COMMIT SUCCESS rows.
        val auditRows = jdbcTemplate.queryForList(
            """
            select kind, status from ai_generation_audit_log
            where session_id = '$SESSION_ID' order by created_at
            """.trimIndent(),
        )
        val kindStatus = auditRows.map { it["kind"] as String to it["status"] as String }
        assertThat(kindStatus).contains("FULL" to "SUCCESS", "COMMIT" to "SUCCESS")
    }

    @Test
    fun `regenerate updates the stored result with the patched item`() {
        val transcript = MockMultipartFile(
            "transcript",
            "transcript.txt",
            "text/plain",
            "Another stub transcript.".toByteArray(),
        )
        val body = MockMultipartFile(
            "body",
            "body.json",
            "application/json",
            """{"model":"claude-sonnet-4-6","authorNameMode":"real","instructions":null}""".toByteArray(),
        )

        val startResponse = mockMvc.multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
            file(transcript)
            file(body)
            with(user(HOST_EMAIL))
        }.andReturn().response
        val jobId = jobIdFrom(startResponse.contentAsString)

        await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250)).untilAsserted {
            assertThat(jobStatusJson(jobId)).contains("\"status\":\"SUCCEEDED\"")
        }

        // Regenerate the summary — stub returns a deterministic regenerated value.
        mockMvc.post("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId/regenerate") {
            with(user(HOST_EMAIL))
            contentType = MediaType.APPLICATION_JSON
            content = """{"item":"SUMMARY","model":null,"instructions":null}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.item") { value("SUMMARY") }
            jsonPath("$.value") { value("Regenerated summary for AI Gen Book.") }
        }

        // Status response must reflect the regenerated summary in `result.summary`.
        val statusJson = jobStatusJson(jobId)
        assertThat(statusJson).contains("\"summary\":\"Regenerated summary for AI Gen Book.\"")
    }

    // task 4.3 — provider matrix: re-run the full lifecycle + regenerate flows
    // against each enabled provider. The CLAUDE row duplicates the dedicated
    // single-provider tests above (kept intact per the task constraint
    // "DO NOT modify existing test method behavior") so that, if the matrix
    // is later expanded, both providers are exercised uniformly here.

    @ParameterizedTest(name = "full generation lifecycle - provider {0}")
    @ValueSource(strings = ["claude-sonnet-4-6", "gpt-4.1"])
    fun `full generation lifecycle - provider matrix`(model: String) {
        val transcript = MockMultipartFile(
            "transcript",
            "transcript.txt",
            "text/plain",
            "Stub transcript for provider matrix ($model).".toByteArray(),
        )
        val body = MockMultipartFile(
            "body",
            "body.json",
            "application/json",
            """{"model":"$model","authorNameMode":"real","instructions":null}""".toByteArray(),
        )

        val startResponse = mockMvc.multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
            file(transcript)
            file(body)
            with(user(HOST_EMAIL))
        }.andReturn().response

        assertThat(startResponse.status).isEqualTo(202)
        val jobId = jobIdFrom(startResponse.contentAsString)

        await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250)).untilAsserted {
            val status = jobStatusJson(jobId)
            assertThat(status).contains("\"status\":\"SUCCEEDED\"")
        }

        assertThat(redis.hasKey("aigen:job:$jobId:result")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId:transcript")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId")).isTrue()

        mockMvc.post("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId/commit") {
            with(user(HOST_EMAIL))
            contentType = MediaType.APPLICATION_JSON
            content = """{"recordVisibility":"MEMBER","result":null}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(SESSION_ID) }
            jsonPath("$.publication.summary") { exists() }
        }

        assertThat(redis.hasKey("aigen:job:$jobId")).isFalse()
        assertThat(redis.hasKey("aigen:job:$jobId:result")).isFalse()
        assertThat(redis.hasKey("aigen:job:$jobId:transcript")).isFalse()

        val summary = jdbcTemplate.queryForObject(
            "select public_summary from public_session_publications where session_id = '$SESSION_ID'",
            String::class.java,
        )
        assertThat(summary).isNotNull
        assertThat(summary).contains("AI Gen Book")
        val feedbackCount = jdbcTemplate.queryForObject(
            "select count(*) from session_feedback_documents where session_id = '$SESSION_ID'",
            Int::class.java,
        )
        assertThat(feedbackCount).isGreaterThanOrEqualTo(1)

        val auditRows = jdbcTemplate.queryForList(
            """
            select kind, status from ai_generation_audit_log
            where session_id = '$SESSION_ID' order by created_at
            """.trimIndent(),
        )
        val kindStatus = auditRows.map { it["kind"] as String to it["status"] as String }
        assertThat(kindStatus).contains("FULL" to "SUCCESS", "COMMIT" to "SUCCESS")
    }

    @ParameterizedTest(name = "regenerate updates stored result - provider {0}")
    @ValueSource(strings = ["claude-sonnet-4-6", "gpt-4.1"])
    fun `regenerate updates the stored result - provider matrix`(model: String) {
        val transcript = MockMultipartFile(
            "transcript",
            "transcript.txt",
            "text/plain",
            "Another stub transcript ($model).".toByteArray(),
        )
        val body = MockMultipartFile(
            "body",
            "body.json",
            "application/json",
            """{"model":"$model","authorNameMode":"real","instructions":null}""".toByteArray(),
        )

        val startResponse = mockMvc.multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
            file(transcript)
            file(body)
            with(user(HOST_EMAIL))
        }.andReturn().response
        val jobId = jobIdFrom(startResponse.contentAsString)

        await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250)).untilAsserted {
            assertThat(jobStatusJson(jobId)).contains("\"status\":\"SUCCEEDED\"")
        }

        mockMvc.post("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId/regenerate") {
            with(user(HOST_EMAIL))
            contentType = MediaType.APPLICATION_JSON
            content = """{"item":"SUMMARY","model":null,"instructions":null}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.item") { value("SUMMARY") }
            jsonPath("$.value") { value("Regenerated summary for AI Gen Book.") }
        }

        val statusJson = jobStatusJson(jobId)
        assertThat(statusJson).contains("\"summary\":\"Regenerated summary for AI Gen Book.\"")
    }

    private fun jobStatusJson(jobId: UUID): String =
        mockMvc.get("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId") {
            with(user(HOST_EMAIL))
        }.andReturn().response.contentAsString

    private fun jobIdFrom(json: String): UUID {
        val match = Regex("\"jobId\":\"([0-9a-f-]{36})\"").find(json)
            ?: error("No jobId in response: $json")
        return UUID.fromString(match.groupValues[1])
    }

    companion object {
        // A run-id keeps the Kafka topic+consumer-group unique per test JVM so reused
        // KafkaContainer instances don't bleed offsets between integration test classes.
        val RUN_ID: String = UUID.randomUUID().toString().take(8)

        private val TOPIC = "readmates.aigen.jobs.int.$RUN_ID"

        @JvmStatic
        @DynamicPropertySource
        fun registerKafkaProperties(registry: DynamicPropertyRegistry) {
            val bootstrapServers = KafkaTestContainer.container.bootstrapServers
            // Create the topic up front so the producer doesn't race on auto-create.
            createTopic(bootstrapServers, TOPIC)

            registry.add("readmates.aigen.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("spring.kafka.bootstrap-servers") { bootstrapServers }
            // Per-run topic + consumer-group so reused KafkaContainer instances don't bleed
            // offsets between integration test classes.
            registry.add("readmates.aigen.kafka.topic-jobs") { TOPIC }
            registry.add("readmates.aigen.kafka.consumer-group") { "aigen-int-test-$RUN_ID" }
        }

        private fun createTopic(bootstrapServers: String, topic: String) {
            AdminClient.create(
                mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers),
            ).use { admin ->
                admin.createTopics(listOf(NewTopic(topic, 1, 1.toShort())))
                    .all()
                    .get(10, TimeUnit.SECONDS)
            }
        }
    }
}
