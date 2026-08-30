package com.readmates.shared.adminmutation.config

import com.readmates.ReadmatesApplication
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import com.zaxxer.hikari.HikariDataSource
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.WebApplicationType
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.ConfigurableApplicationContext
import org.springframework.jdbc.core.JdbcTemplate
import org.testcontainers.mysql.MySQLContainer
import org.testcontainers.utility.DockerImageName
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID
import javax.sql.DataSource

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
class AdminCommandDigestKeyStartupIntegrationTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired dataSource: DataSource,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val hikari = dataSource as HikariDataSource

    @BeforeEach
    @AfterEach
    fun cleanup() {
        jdbcTemplate.update(
            """
            delete from platform_admin_club_command_convergence
            where effect_type = 'HOST_INVITATION' and state = 'PENDING'
            """.trimIndent(),
        )
        jdbcTemplate.update(
            "delete from platform_admin_club_command_convergence where receipt_id_snapshot = ?",
            PENDING_RECEIPT_ID.toString(),
        )
        jdbcTemplate.update(
            "delete from platform_admin_club_command_receipts where id = ?",
            PENDING_RECEIPT_ID.toString(),
        )
        jdbcTemplate.update("delete from platform_audit_events where id = ?", PENDING_AUDIT_ID.toString())
        jdbcTemplate.update("delete from platform_admin_command_idempotency_keys")
        jdbcTemplate.update("delete from platform_admin_command_idempotency")
        jdbcTemplate.update("delete from platform_admin_command_digest_key_state")
    }

    @Test
    fun `configured current and previous referenced versions start`() {
        insertReferencedVersion(PREVIOUS_VERSION, withState = true)

        assertThatCode {
            runContext(previousKey = key(PREVIOUS_VERSION), previousVersion = PREVIOUS_VERSION).close()
        }.doesNotThrowAnyException()
    }

    @Test
    fun `empty first deployment starts after Flyway has created the latest migration`() {
        withFreshDatabase { database ->
            runContext(
                previousKey = "",
                previousVersion = 0,
                jdbcUrl = database.jdbcUrl,
                jdbcUsername = database.username,
                jdbcPassword = database.password,
            ).use { context ->
                val migratedJdbc = JdbcTemplate(context.getBean(DataSource::class.java))
                assertThat(context.getBean(AdminCommandDigestKeyStartupValidator::class.java)).isNotNull
                assertThat(tableExists(migratedJdbc, "platform_admin_command_idempotency_keys")).isTrue()
                assertThat(latestFlywayVersion(migratedJdbc)).isEqualTo("65")
            }
        }
    }

    @Test
    fun `premature previous key removal with live aliases rejects startup`() {
        insertReferencedVersion(PREVIOUS_VERSION, withState = true)

        assertStartupRejected(previousKey = "", previousVersion = PREVIOUS_VERSION)
    }

    @Test
    fun `pending host invitation requires its receipt digest key at startup`() {
        insertPendingHostInvitationReference(PREVIOUS_VERSION)

        assertStartupRejected(previousKey = "", previousVersion = PREVIOUS_VERSION)

        assertThatCode {
            runContext(previousKey = key(PREVIOUS_VERSION), previousVersion = PREVIOUS_VERSION).close()
        }.doesNotThrowAnyException()
    }

    @Test
    fun `unknown referenced alias version rejects startup`() {
        insertReferencedVersion(UNKNOWN_VERSION, withState = true)

        assertStartupRejected(previousKey = key(PREVIOUS_VERSION), previousVersion = PREVIOUS_VERSION)
    }

    @Test
    fun `referenced current version with a locally allowed blank key rejects startup`() {
        insertReferencedVersion(CURRENT_VERSION, withState = true)

        assertStartupRejected(
            currentKey = "",
            previousKey = "",
            previousVersion = 0,
        )
    }

    @Test
    fun `referenced alias or declared removed version missing state rejects startup`() {
        insertReferencedVersion(PREVIOUS_VERSION, withState = false)
        assertStartupRejected(previousKey = key(PREVIOUS_VERSION), previousVersion = PREVIOUS_VERSION)

        cleanup()
        assertStartupRejected(previousKey = "", previousVersion = PREVIOUS_VERSION)
    }

    @Test
    fun `pending zero alias buffer rejects startup`() {
        insertState(PREVIOUS_VERSION, NOW.minus(Duration.ofDays(2)), NOW.minus(Duration.ofHours(23)))

        assertStartupRejected(previousKey = "", previousVersion = PREVIOUS_VERSION)
    }

    @Test
    fun `safely retired unconfigured version starts`() {
        insertState(PREVIOUS_VERSION, NOW.minus(Duration.ofDays(2)), NOW.minus(Duration.ofHours(25)))

        assertThatCode {
            runContext(previousKey = "", previousVersion = PREVIOUS_VERSION).close()
        }.doesNotThrowAnyException()
    }

    @Test
    fun `reference query failure aborts startup`() {
        jdbcTemplate.execute(
            "rename table platform_admin_command_digest_key_state " +
                "to platform_admin_command_digest_key_state_task4_broken",
        )
        try {
            assertStartupRejected(previousKey = "", previousVersion = 0, queryFailure = true)
        } finally {
            jdbcTemplate.execute(
                "rename table platform_admin_command_digest_key_state_task4_broken " +
                    "to platform_admin_command_digest_key_state",
            )
        }
    }

    private fun assertStartupRejected(
        currentKey: String = key(CURRENT_VERSION),
        previousKey: String,
        previousVersion: Int,
        queryFailure: Boolean = false,
    ) {
        val failure = catchThrowable { runContext(previousKey, previousVersion, currentKey) }
        assertThat(failure).isNotNull
        if (queryFailure) {
            assertThat(failure.stackTraceToString())
                .contains(
                    "AdminCommandDigestKeyStartupValidator.afterSingletonsInstantiated",
                    "platform_admin_command_digest_key_state",
                )
            assertThat(
                jdbcTemplate.queryForObject(
                    """
                    select version
                    from flyway_schema_history
                    where success = 1 and version is not null
                    order by installed_rank desc
                    limit 1
                    """.trimIndent(),
                    String::class.java,
                ),
            ).isEqualTo("65")
        } else {
            assertThat(generateSequence(failure) { it.cause }.mapNotNull { it.message }.toList())
                .contains("Admin command digest keys cannot safely replay or retire persisted command references")
        }
    }

    private fun runContext(
        previousKey: String,
        previousVersion: Int,
        currentKey: String = key(CURRENT_VERSION),
        jdbcUrl: String = hikari.jdbcUrl,
        jdbcUsername: String = hikari.username,
        jdbcPassword: String = hikari.password,
    ): ConfigurableApplicationContext =
        SpringApplicationBuilder(ReadmatesApplication::class.java)
            .web(WebApplicationType.SERVLET)
            .run(
                "--spring.datasource.url=$jdbcUrl",
                "--spring.datasource.username=$jdbcUsername",
                "--spring.datasource.password=$jdbcPassword",
                "--spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver",
                "--spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
                "--server.port=0",
                "--management.server.port=0",
                "--spring.profiles.active=test",
                "--readmates.admin.command-identity.current-key=$currentKey",
                "--readmates.admin.command-identity.current-key-version=$CURRENT_VERSION",
                "--readmates.admin.command-identity.previous-key=$previousKey",
                "--readmates.admin.command-identity.previous-key-version=$previousVersion",
                "--readmates.admin.command-identity.write-previous-alias=false",
                "--readmates.admin.command-identity.allow-empty-secret=${currentKey.isBlank()}",
                "--readmates.admin.command-idempotency.previous-key-rollout-buffer=24h",
            )

    private fun insertReferencedVersion(
        version: Int,
        withState: Boolean,
    ) {
        val claimId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency (
              id, platform_admin_user_id, command_type, target_type, target_id,
              canonical_schema_version, state, claim_token, receipt_type, receipt_id,
              created_at, updated_at, expires_at
            ) values (?, ?, 'club.create', 'club', ?, 'club-create:v1', 'IN_PROGRESS', ?, null, null, ?, ?, ?)
            """.trimIndent(),
            claimId,
            ADMIN_ID.toString(),
            TARGET_ID.toString(),
            UUID.randomUUID().toString(),
            NOW.minusSeconds(1).toDbTimeStartup(),
            NOW.minusSeconds(1).toDbTimeStartup(),
            NOW.plus(Duration.ofHours(1)).toDbTimeStartup(),
        )
        if (withState) {
            insertState(version, NOW.minusSeconds(1), null)
        }
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency_keys (
              claim_id, platform_admin_user_id, command_type, target_type, target_id,
              digest_key_version, idempotency_key_hmac, request_hmac, created_at
            ) values (?, ?, 'club.create', 'club', ?, ?, ?, ?, ?)
            """.trimIndent(),
            claimId,
            ADMIN_ID.toString(),
            TARGET_ID.toString(),
            version,
            ByteArray(32) { (version and 0xff).toByte() },
            ByteArray(32) { ((version + 1) and 0xff).toByte() },
            NOW.toDbTimeStartup(),
        )
    }

    private fun insertState(
        version: Int,
        lastReferencedAt: Instant,
        unreferencedSince: Instant?,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_digest_key_state (
              digest_key_version, last_referenced_at, unreferenced_since
            ) values (?, ?, ?)
            """.trimIndent(),
            version,
            lastReferencedAt.toDbTimeStartup(),
            unreferencedSince?.toDbTimeStartup(),
        )
    }

    private fun insertPendingHostInvitationReference(version: Int) {
        insertState(version, NOW.minusSeconds(1), null)
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, null, 'OWNER', null, 'ADMIN_CLUB_ONBOARDED',
                    cast('{"receipt":"pending"}' as json), ?)
            """.trimIndent(),
            PENDING_AUDIT_ID.toString(),
            NOW.toDbTimeStartup(),
        )
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_receipts (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, club_id_snapshot, preview_id_snapshot,
              before_admin_revision, after_admin_revision, outcome,
              canonical_schema_version, digest_key_version, request_hmac,
              platform_audit_event_id_snapshot, origin_at, safe_result_json
            ) values (?, 'club.onboarding.create', ?, 'OWNER', cast('["CREATE_CLUB"]' as json), ?, null,
                      null, 0, 'SUCCEEDED', 'admin.club.onboarding.create.v1', ?, ?, ?, ?,
                      cast('{"resultCode":"CLUB_ONBOARDED"}' as json))
            """.trimIndent(),
            PENDING_RECEIPT_ID.toString(),
            ADMIN_ID.toString(),
            TARGET_ID.toString(),
            version,
            ByteArray(32) { 7 },
            PENDING_AUDIT_ID.toString(),
            NOW.toDbTimeStartup(),
        )
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_convergence (
              id, receipt_id_snapshot, effect_type, effect_target_id_snapshot,
              state, attempt_count, next_attempt_no, lease_owner, lease_expires_at,
              last_safe_error_code, available_at, created_at, updated_at
            ) values (?, ?, 'HOST_INVITATION', ?, 'PENDING', 0, 1, null, null, null, ?, ?, ?)
            """.trimIndent(),
            PENDING_CONVERGENCE_ID.toString(),
            PENDING_RECEIPT_ID.toString(),
            PENDING_INVITATION_ID.toString(),
            NOW.toDbTimeStartup(),
            NOW.toDbTimeStartup(),
            NOW.toDbTimeStartup(),
        )
    }

    private fun tableExists(
        jdbc: JdbcTemplate,
        table: String,
    ): Boolean =
        (
            jdbc.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database() and table_name = ?
                """.trimIndent(),
                Int::class.java,
                table,
            ) ?: 0
        ) == 1

    private fun latestFlywayVersion(jdbc: JdbcTemplate): String? =
        jdbc.queryForObject(
            """
            select version
            from flyway_schema_history
            where success = 1 and version is not null
            order by installed_rank desc
            limit 1
            """.trimIndent(),
            String::class.java,
        )

    private fun <T> withFreshDatabase(block: (MySQLContainer) -> T): T {
        val database = FreshStartupMySqlContainer().apply { start() }
        return database.use(block)
    }

    private companion object {
        val NOW: Instant = Instant.now().minusSeconds(1)
        val ADMIN_ID: UUID = UUID.fromString("cccccccc-0000-4000-8000-000000059001")
        val TARGET_ID: UUID = UUID.fromString("cccccccc-0000-4000-8000-000000059002")
        val PENDING_AUDIT_ID: UUID = UUID.fromString("cccccccc-0000-4000-8000-000000059003")
        val PENDING_RECEIPT_ID: UUID = UUID.fromString("cccccccc-0000-4000-8000-000000059004")
        val PENDING_CONVERGENCE_ID: UUID = UUID.fromString("cccccccc-0000-4000-8000-000000059005")
        val PENDING_INVITATION_ID: UUID = UUID.fromString("cccccccc-0000-4000-8000-000000059006")
        const val CURRENT_VERSION = 5902
        const val PREVIOUS_VERSION = 5901
        const val UNKNOWN_VERSION = 5909

        fun key(version: Int) = "test-admin-command-startup-key-$version"
    }
}

private fun Instant.toDbTimeStartup(): LocalDateTime = atOffset(ZoneOffset.UTC).toLocalDateTime()

private class FreshStartupMySqlContainer :
    MySQLContainer(
        DockerImageName.parse("mysql:8.4"),
    ) {
    init {
        withDatabaseName("readmates_task4_startup_fresh")
        withUsername("readmates_task4_startup")
        withPassword("readmates_task4_startup")
        withUrlParam("serverTimezone", "UTC")
        withCommand(
            "--log-bin-trust-function-creators=1",
            "--innodb-buffer-pool-size=32M",
            "--performance-schema=OFF",
            "--key-buffer-size=8M",
            "--max-connections=50",
        )
    }
}
