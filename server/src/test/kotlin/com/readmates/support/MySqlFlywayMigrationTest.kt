package com.readmates.support

import com.readmates.auth.domain.BookClubAvatarKey
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.io.ClassPathResource
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.UncategorizedSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.init.ScriptUtils
import org.springframework.test.context.TestPropertySource
import org.testcontainers.mysql.MySQLContainer
import org.testcontainers.utility.DockerImageName
import java.util.UUID

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "spring.ai.model.chat=none",
        "spring.ai.google.genai.api-key=test-key",
        "spring.ai.openai.api-key=test-key",
        "spring.ai.anthropic.api-key=test-key",
    ],
)
@Tag("integration")
class MySqlFlywayMigrationTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    @Suppress("LongMethod")
    fun `mysql upgrades populated v42 schema with deterministic avatars and guest exposure`() {
        FlywayUpgradeMySqlContainer().use { database ->
            database.start()
            val dataSource = DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
            val preLatestFlyway =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .target("42")
                    .load()

            assertThat(preLatestFlyway.migrate().targetSchemaVersion.toString()).isEqualTo("42")
            dataSource.connection.use { connection ->
                ScriptUtils.executeSqlScript(
                    connection,
                    ClassPathResource("db/phase2/flyway-upgrade-before-latest.sql"),
                )
            }
            val upgradeJdbc = JdbcTemplate(dataSource)
            assertThat(
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from information_schema.columns
                    where table_schema = database()
                      and table_name = 'memberships'
                      and column_name = 'avatar_key'
                    """.trimIndent(),
                    Int::class.java,
                ),
            ).isZero()
            insertAvatarBackfillFixtures(upgradeJdbc)
            insertExposureBackfillFixtures(upgradeJdbc)
            val legacyReplayFixtures = insertLegacyAdminReplayPreviewFixtures(upgradeJdbc)

            val upgradeResult =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .load()
                    .migrate()

            assertThat(upgradeResult.migrationsExecuted).isEqualTo(17)
            val latestVersion =
                upgradeJdbc.queryForObject(
                    """
                    select version
                    from flyway_schema_history
                    where success = true
                    order by installed_rank desc
                    limit 1
                    """.trimIndent(),
                    String::class.java,
                )
            assertThat(latestVersion).isEqualTo("59")
            assertV52RevisionSchema(upgradeJdbc)
            assertV52RevisionBackfill(upgradeJdbc)
            assertV53IdempotencySchema(upgradeJdbc)
            assertV54PublicProjectionConvergenceSchema(upgradeJdbc)
            assertV55PlatformAdminPublicTakedownSchema(upgradeJdbc)
            assertV56PublicConvergenceWorkRetentionIndex(upgradeJdbc)
            assertV57PlatformAdminCommandIdempotencySchema(upgradeJdbc)
            assertV58PlatformAdminClubCommandEvidenceSchema(upgradeJdbc)
            assertV59PlatformAdminServiceCommandEvidenceSchema(upgradeJdbc)
            assertAtomicAdminReplaySchema(upgradeJdbc)
            assertLegacyAdminReplayPreviewFixtures(upgradeJdbc, legacyReplayFixtures)
            assertThat(
                upgradeJdbc.queryForObject(
                    """
                    select concat(short_name, ':', status, ':', role)
                    from memberships
                    where id = '10000000-0000-0000-0000-000000000002'
                    """.trimIndent(),
                    String::class.java,
                ),
            ).isEqualTo("Upgrade Host:ACTIVE:HOST")
            assertThat(
                upgradeJdbc.queryForObject(
                    """
                    select concat(book_title, ':', state, ':', visibility)
                    from sessions
                    where id = '10000000-0000-0000-0000-000000000003'
                    """.trimIndent(),
                    String::class.java,
                ),
            ).isEqualTo("Upgrade Fixture Book:CLOSED:MEMBER")
            assertThat(
                upgradeJdbc.queryForObject(
                    """
                    select concat(version, ':', source, ':', snapshot_sha256)
                    from session_record_revisions
                    where id = '10000000-0000-0000-0000-000000000004'
                    """.trimIndent(),
                    String::class.java,
                ),
            ).isEqualTo("1:BASELINE:${"a".repeat(64)}")
            assertThat(
                upgradeJdbc.queryForObject(
                    """
                    select concat(draft_revision, ':', source, ':', snapshot_sha256, ':',
                                  date_format(base_session_updated_at, '%Y-%m-%d %H:%i:%s.%f'))
                    from session_record_drafts
                    where session_id = '10000000-0000-0000-0000-000000000003'
                    """.trimIndent(),
                    String::class.java,
                ),
            ).isEqualTo("2:MANUAL:${"b".repeat(64)}:2026-07-24 10:00:00.000000")
            assertEquals(
                "club_id,session_id,event_type,content_revision,created_at",
                indexColumns(
                    upgradeJdbc,
                    "notification_manual_dispatches",
                    "notification_manual_dispatches_revision_idx",
                ),
            )
            assertEquals(
                "revision_id,club_id,session_id",
                foreignKeyColumns(
                    upgradeJdbc,
                    "session_record_apply_receipts",
                    "session_record_apply_receipts_revision_scope_fk",
                ),
            )
            assertThat(
                checkConstraintClause(upgradeJdbc, "notification_manual_dispatches_audience_check"),
            ).contains("SELECTED_MEMBERS")

            val nullAvatarKeyCount =
                upgradeJdbc.queryForObject(
                    "select count(*) from memberships where avatar_key is null",
                    Int::class.java,
                )
            assertThat(nullAvatarKeyCount).isZero()
            val avatarColumnMetadata =
                upgradeJdbc.queryForMap(
                    """
                    select is_nullable, column_default, character_set_name, collation_name
                    from information_schema.columns
                    where table_schema = database()
                      and table_name = 'memberships'
                      and column_name = 'avatar_key'
                    """.trimIndent(),
                )
            assertThat(avatarColumnMetadata["IS_NULLABLE"]).isEqualTo("NO")
            assertThat(avatarColumnMetadata["COLUMN_DEFAULT"]).isNull()
            assertThat(avatarColumnMetadata["CHARACTER_SET_NAME"]).isEqualTo("ascii")
            assertThat(avatarColumnMetadata["COLLATION_NAME"]).isEqualTo("ascii_bin")

            val visibleKeysForFirstClub =
                upgradeJdbc
                    .queryForList(
                        """
                        select avatar_key
                        from memberships
                        where club_id = ?
                        order by
                          case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
                          created_at,
                          id
                        """.trimIndent(),
                        String::class.java,
                        AVATAR_FIXTURE_FIRST_CLUB_ID,
                    ).filterNotNull()
            assertThat(visibleKeysForFirstClub.take(20).distinct()).hasSize(20)
            assertThat(visibleKeysForFirstClub).allMatch(::isWireValue)
            val hiddenFixtureOrderingViolationCount =
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from memberships hidden
                    join memberships visible on visible.club_id = hidden.club_id
                    where hidden.club_id = ?
                      and hidden.status in ('LEFT', 'INACTIVE')
                      and visible.status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED')
                      and (hidden.created_at >= visible.created_at or hidden.id >= visible.id)
                    """.trimIndent(),
                    Int::class.java,
                    AVATAR_FIXTURE_FIRST_CLUB_ID,
                )
            assertThat(hiddenFixtureOrderingViolationCount).isZero()
            val rankedStatusAndKeysForFirstClub =
                upgradeJdbc
                    .queryForList(
                        """
                        select concat(status, ':', avatar_key)
                        from memberships
                        where club_id = ?
                        order by
                          case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
                          created_at,
                          id
                        """.trimIndent(),
                        String::class.java,
                        AVATAR_FIXTURE_FIRST_CLUB_ID,
                    ).filterNotNull()
            assertThat(rankedStatusAndKeysForFirstClub.takeLast(2)).allMatch {
                it.startsWith("LEFT:") || it.startsWith("INACTIVE:")
            }

            val keysOrderedByCreatedAt =
                upgradeJdbc
                    .queryForList(
                        """
                        select avatar_key
                        from memberships
                        where club_id = ?
                          and status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED')
                        order by created_at, id
                        """.trimIndent(),
                        String::class.java,
                        AVATAR_FIXTURE_FIRST_CLUB_ID,
                    ).filterNotNull()
            assertThat(keysOrderedByCreatedAt.take(3)).allMatch(::isWireValue)
            assertThat(
                upgradeJdbc.queryForObject(
                    "select avatar_key from memberships where id = ?",
                    String::class.java,
                    avatarFixtureMembershipId(clubNumber = 2, memberNumber = 1),
                ),
            ).matches(::isWireValue)
            assertEquals(
                "club_id,status,avatar_key",
                indexColumns(upgradeJdbc, "memberships", "memberships_club_status_avatar_idx"),
            )
            assertEquals(
                "NO",
                upgradeJdbc.queryForObject(
                    """
                    select is_nullable
                    from information_schema.columns
                    where table_schema = database()
                      and table_name = 'sessions'
                      and column_name = 'access_scope'
                    """.trimIndent(),
                    String::class.java,
                ),
            )
            assertEquals(
                "NO",
                upgradeJdbc.queryForObject(
                    """
                    select is_nullable
                    from information_schema.columns
                    where table_schema = database()
                      and table_name = 'public_session_publications'
                      and column_name = 'site_visibility'
                    """.trimIndent(),
                    String::class.java,
                ),
            )
            assertThat(checkConstraintClause(upgradeJdbc, "sessions_access_scope_check"))
                .contains("HOST_ONLY", "GUEST_READABLE")
            assertThat(checkConstraintClause(upgradeJdbc, "public_session_publications_site_visibility_check"))
                .contains("HIDDEN", "PUBLIC_RECORD")
            assertEquals(
                "club_id,access_scope,state,number",
                indexColumns(upgradeJdbc, "sessions", "sessions_club_access_state_number_idx"),
            )
            assertEquals(
                0,
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from sessions
                    where (id = '10000000-0000-0000-0000-000000000003' and access_scope <> 'GUEST_READABLE')
                       or (id = '10000000-0000-0000-0000-000000000005' and access_scope <> 'GUEST_READABLE')
                       or (id = '10000000-0000-0000-0000-000000000007' and access_scope <> 'GUEST_READABLE')
                    """.trimIndent(),
                    Int::class.java,
                ),
            )
            assertEquals(
                0,
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from public_session_publications
                    where (session_id = '10000000-0000-0000-0000-000000000005' and site_visibility <> 'PUBLIC_RECORD')
                       or (session_id = '10000000-0000-0000-0000-000000000007' and site_visibility <> 'HIDDEN')
                    """.trimIndent(),
                    Int::class.java,
                ),
            )

            val invalidAvatarError =
                assertInvalidAvatarKeyRejected(upgradeJdbc, v43AvatarKeys().first())
            assertThat(invalidAvatarError.mostSpecificCause.message).contains("memberships_avatar_key_check")
            val arbitraryAvatarError =
                assertInvalidAvatarKeyRejected(upgradeJdbc, "member-id")
            assertThat(arbitraryAvatarError.mostSpecificCause.message).contains("memberships_avatar_key_check")
            val uppercaseAvatarError =
                assertInvalidAvatarKeyRejected(upgradeJdbc, "HEDGEHOG-GREEN-BOOK")
            assertThat(uppercaseAvatarError.mostSpecificCause.message).contains("memberships_avatar_key_check")
            assertInvalidAvatarKeyRejected(upgradeJdbc, "hédgehog-green-book")
            val omittedAvatarError =
                assertThrows(UncategorizedSQLException::class.java) {
                    upgradeJdbc.update(
                        """
                        -- membership-avatar-key-omission: verify V44 rejects omitted keys after migration
                        insert into memberships (
                          id, club_id, user_id, role, status, short_name, joined_at, created_at, updated_at
                        ) values (?, ?, ?, 'MEMBER', 'ACTIVE', 'Missing Avatar', null,
                                  '2026-08-01 12:00:00.000000', '2026-08-01 12:00:00.000000')
                        """.trimIndent(),
                        "33000000-0000-0000-0000-000000000002",
                        AVATAR_FIXTURE_FIRST_CLUB_ID,
                        avatarFixtureUserId(clubNumber = 2, memberNumber = 2),
                    )
                }
            assertThat(omittedAvatarError.mostSpecificCause.message).contains("avatar_key")
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql upgrades populated v44 schema to integrated membership avatar keys`() {
        FlywayUpgradeMySqlContainer().use { database ->
            database.start()
            val dataSource = DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
            val v44Flyway =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .target("44")
                    .load()

            assertThat(v44Flyway.migrate().targetSchemaVersion.toString()).isEqualTo("44")
            val upgradeJdbc = JdbcTemplate(dataSource)
            insertV44AvatarUpgradeFixtures(upgradeJdbc)
            val legacyReplayFixtures = insertLegacyAdminReplayPreviewFixtures(upgradeJdbc)

            val upgradeResult =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .load()
                    .migrate()

            assertThat(upgradeResult.migrationsExecuted).isEqualTo(15)
            val latestVersion =
                upgradeJdbc.queryForObject(
                    """
                    select version
                    from flyway_schema_history
                    where success = true
                    order by installed_rank desc
                    limit 1
                    """.trimIndent(),
                    String::class.java,
                )
            assertThat(latestVersion).isEqualTo("59")
            assertV52RevisionSchema(upgradeJdbc)
            assertV52RevisionBackfill(upgradeJdbc)
            assertV53IdempotencySchema(upgradeJdbc)
            assertV54PublicProjectionConvergenceSchema(upgradeJdbc)
            assertV55PlatformAdminPublicTakedownSchema(upgradeJdbc)
            assertV56PublicConvergenceWorkRetentionIndex(upgradeJdbc)
            assertV57PlatformAdminCommandIdempotencySchema(upgradeJdbc)
            assertV58PlatformAdminClubCommandEvidenceSchema(upgradeJdbc)
            assertV59PlatformAdminServiceCommandEvidenceSchema(upgradeJdbc)
            assertAtomicAdminReplaySchema(upgradeJdbc)
            assertLegacyAdminReplayPreviewFixtures(upgradeJdbc, legacyReplayFixtures)

            listOf(AVATAR_FIXTURE_FIRST_CLUB_ID, avatarFixtureClubId(clubNumber = 2)).forEach { clubId ->
                val assignments = integratedAvatarAssignmentsForClub(upgradeJdbc, clubId)
                val keys = assignments.map { it.substringAfterLast(':') }
                assertThat(keys.take(30).distinct()).hasSize(30)
                assertThat(keys[30]).isEqualTo(keys[0])
                assertThat(keys).allMatch(::isWireValue)
            }
            assertThat(
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from memberships
                    where avatar_key not in (${BookClubAvatarKey.ordered.joinToString { "'${it.wireValue}'" }})
                    """.trimIndent(),
                    Int::class.java,
                ),
            ).isZero()

            val migrationSql =
                checkNotNull(javaClass.classLoader.getResourceAsStream(V46_INTEGRATED_AVATARS))
                    .bufferedReader()
                    .use { it.readText() }
            val jsonKeys =
                Regex("\\\"([a-z0-9-]+)\\\"")
                    .findAll(migrationSql.substringBefore("'$[*]'"))
                    .map { it.groupValues[1] }
                    .toList()
            val checkKeys =
                Regex("'([a-z0-9-]+)'")
                    .findAll(
                        migrationSql.substringAfter("add constraint memberships_avatar_key_check"),
                    ).map { it.groupValues[1] }
                    .toList()
            val expectedKeys = BookClubAvatarKey.ordered.map { it.wireValue }
            assertThat(jsonKeys).containsExactlyElementsOf(expectedKeys)
            assertThat(checkKeys).containsExactlyElementsOf(expectedKeys)

            assertThat(
                assertInvalidAvatarKeyRejected(upgradeJdbc, "hedgehog-green-book").mostSpecificCause.message,
            ).contains("memberships_avatar_key_check")
            assertThat(
                assertInvalidAvatarKeyRejected(upgradeJdbc, "HEDGEHOG-GREEN-BOOK").mostSpecificCause.message,
            ).contains("memberships_avatar_key_check")
            assertThat(assertInvalidAvatarKeyRejected(upgradeJdbc, "member-id").mostSpecificCause.message)
                .contains("memberships_avatar_key_check")
            assertThrows(DataIntegrityViolationException::class.java) {
                upgradeJdbc.update(
                    "update memberships set avatar_key = null where id = ?",
                    avatarFixtureMembershipId(clubNumber = 1, memberNumber = 1),
                )
            }
        }
    }

    private fun assertInvalidAvatarKeyRejected(
        jdbcTemplate: JdbcTemplate,
        avatarKey: String,
    ): UncategorizedSQLException =
        assertThrows(UncategorizedSQLException::class.java) {
            jdbcTemplate.update(
                """
                insert into memberships (
                  id, club_id, user_id, role, status, short_name, avatar_key, joined_at,
                  created_at, updated_at
                ) values (?, ?, ?, 'MEMBER', 'ACTIVE', 'Invalid Avatar', ?, null,
                          '2026-08-01 12:00:00.000000', '2026-08-01 12:00:00.000000')
                """.trimIndent(),
                "33000000-0000-0000-0000-000000000001",
                AVATAR_FIXTURE_FIRST_CLUB_ID,
                avatarFixtureUserId(clubNumber = 2, memberNumber = 1),
                avatarKey,
            )
        }

    private fun insertAvatarBackfillFixtures(jdbcTemplate: JdbcTemplate) {
        (1..2).forEach { clubNumber ->
            val clubId = avatarFixtureClubId(clubNumber)
            jdbcTemplate.update(
                """
                insert into clubs (
                  id, slug, name, tagline, about, status, public_visibility, created_at, updated_at
                ) values (?, ?, ?, 'Avatar migration fixture', 'Synthetic migration test data.',
                          'ACTIVE', 'PRIVATE', '2026-07-01 00:00:00.000000', '2026-07-01 00:00:00.000000')
                """.trimIndent(),
                clubId,
                "avatar-fixture-$clubNumber",
                "Avatar Fixture Club $clubNumber",
            )

            insertAvatarBackfillMembershipFixtures(jdbcTemplate, clubNumber, clubId)
        }
    }

    private fun insertV44AvatarUpgradeFixtures(jdbcTemplate: JdbcTemplate) {
        val preUpgradeAvatarKeys = v44AvatarKeys()
        (1..2).forEach { clubNumber ->
            val clubId = avatarFixtureClubId(clubNumber)
            jdbcTemplate.update(
                """
                insert into clubs (
                  id, slug, name, tagline, about, status, public_visibility, created_at, updated_at
                ) values (?, ?, ?, 'Avatar migration fixture', 'Synthetic migration test data.',
                          'ACTIVE', 'PRIVATE', '2026-07-01 00:00:00.000000', '2026-07-01 00:00:00.000000')
                """.trimIndent(),
                clubId,
                "avatar-fixture-$clubNumber",
                "Avatar Fixture Club $clubNumber",
            )
            (1..42).forEach { memberNumber ->
                val userId = avatarFixtureUserId(clubNumber, memberNumber)
                val status =
                    when {
                        memberNumber == 40 -> "INVITED"
                        memberNumber == 41 -> "LEFT"
                        memberNumber == 42 -> "INACTIVE"
                        memberNumber % 3 == 1 -> "ACTIVE"
                        memberNumber % 3 == 2 -> "SUSPENDED"
                        else -> "VIEWER"
                    }
                jdbcTemplate.update(
                    """
                    insert into users (
                      id, google_subject_id, email, name, short_name, auth_provider, created_at, updated_at
                    ) values (?, ?, ?, ?, ?, 'GOOGLE', '2026-07-01 09:00:00.000000', '2026-07-01 09:00:00.000000')
                    """.trimIndent(),
                    userId,
                    "avatar-fixture-$clubNumber-$memberNumber",
                    "avatar-$clubNumber-$memberNumber@example.test",
                    "Avatar Member $clubNumber-$memberNumber",
                    "Avatar $clubNumber-$memberNumber",
                )
                jdbcTemplate.update(
                    """
                    insert into memberships (
                      id, club_id, user_id, role, status, short_name, avatar_key, joined_at, created_at, updated_at
                    ) values (?, ?, ?, 'MEMBER', ?, ?, ?, null,
                              '2026-07-01 09:00:00.000000', '2026-07-01 09:00:00.000000')
                    """.trimIndent(),
                    avatarFixtureMembershipId(clubNumber, memberNumber),
                    clubId,
                    userId,
                    status,
                    "Avatar $clubNumber-$memberNumber",
                    preUpgradeAvatarKeys[(memberNumber - 1) % preUpgradeAvatarKeys.size],
                )
            }
        }
    }

    private fun v44AvatarKeys(): List<String> {
        val migrationSql =
            checkNotNull(javaClass.classLoader.getResourceAsStream(V44_ANIMAL_AVATARS))
                .bufferedReader()
                .use { it.readText() }
        return V43_AVATAR_KEY_REGEX
            .findAll(migrationSql.substringAfter("add constraint memberships_avatar_key_check"))
            .map { it.groupValues[1] }
            .toList()
    }

    private fun v43AvatarKeys(): List<String> {
        val migrationSql =
            checkNotNull(javaClass.classLoader.getResourceAsStream(V43_MEMBERSHIP_AVATARS))
                .bufferedReader()
                .use { it.readText() }
        val constraintSql = migrationSql.substringAfter("add constraint memberships_avatar_key_check")
        return V43_AVATAR_KEY_REGEX
            .findAll(constraintSql)
            .map { it.groupValues[1] }
            .toList()
            .also { check(it.isNotEmpty()) { "V43 avatar constraint must declare keys" } }
    }

    private fun isWireValue(value: String): Boolean = BookClubAvatarKey.fromWireValue(value) != null

    private fun integratedAvatarAssignmentsForClub(
        jdbcTemplate: JdbcTemplate,
        clubId: String,
    ): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select concat(cast(right(id, 12) as unsigned), ':', status, ':', avatar_key)
                from memberships
                where club_id = ?
                order by
                  case when status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED') then 0 else 1 end,
                  sha2(concat(club_id, ':', id, ':integrated-avatar-v2'), 256),
                  id
                """.trimIndent(),
                String::class.java,
                clubId,
            ).filterNotNull()

    private fun insertExposureBackfillFixtures(jdbcTemplate: JdbcTemplate) {
        listOf(
            Triple("10000000-0000-0000-0000-000000000005", "PUBLISHED", "PUBLIC"),
            Triple("10000000-0000-0000-0000-000000000007", "OPEN", "PUBLIC"),
        ).forEachIndexed { index, (sessionId, state, visibility) ->
            jdbcTemplate.update(
                """
                insert into sessions (
                  id, club_id, number, title, book_title, book_author, session_date,
                  start_time, end_time, location_label, question_deadline_at, state, visibility
                ) values (?, '10000000-0000-0000-0000-000000000001', ?, 'Exposure fixture session',
                          'Exposure fixture book', 'Example Author', '2026-07-24', '19:00:00', '21:00:00',
                          'Example Room', '2026-07-23 12:00:00.000000', ?, ?)
                """.trimIndent(),
                sessionId,
                index + 2,
                state,
                visibility,
            )
            jdbcTemplate.update(
                """
                insert into public_session_publications (
                  id, club_id, session_id, public_summary, is_public, visibility, published_at
                ) values (?, '10000000-0000-0000-0000-000000000001', ?, 'Exposure migration fixture',
                          true, 'PUBLIC', '2026-07-24 22:00:00.000000')
                """.trimIndent(),
                if (index == 0) "10000000-0000-0000-0000-000000000006" else "10000000-0000-0000-0000-000000000008",
                sessionId,
            )
        }
    }

    private fun insertAvatarBackfillMembershipFixtures(
        jdbcTemplate: JdbcTemplate,
        clubNumber: Int,
        clubId: String,
    ) {
        val memberNumbersInInsertOrder = listOf(3, 2, 1) + (4..23)
        memberNumbersInInsertOrder.forEach { memberNumber ->
            val userId = avatarFixtureUserId(clubNumber, memberNumber)
            val createdMinute = if (memberNumber <= 2) 0 else memberNumber - 2
            val createdAt =
                if (memberNumber >= 22) {
                    "2026-06-01 08:00:00.000000"
                } else {
                    "2026-07-01 09:${createdMinute.toString().padStart(2, '0')}:00.000000"
                }
            val status =
                when {
                    memberNumber == 22 -> "LEFT"
                    memberNumber == 23 -> "INACTIVE"
                    memberNumber % 3 == 1 -> "ACTIVE"
                    memberNumber % 3 == 2 -> "SUSPENDED"
                    else -> "VIEWER"
                }

            jdbcTemplate.update(
                """
                insert into users (
                  id, google_subject_id, email, name, short_name, auth_provider, created_at, updated_at
                ) values (?, ?, ?, ?, ?, 'GOOGLE', ?, ?)
                """.trimIndent(),
                userId,
                "avatar-fixture-$clubNumber-$memberNumber",
                "avatar-$clubNumber-$memberNumber@example.test",
                "Avatar Member $clubNumber-$memberNumber",
                "Avatar $clubNumber-$memberNumber",
                createdAt,
                createdAt,
            )
            jdbcTemplate.update(
                """
                -- membership-avatar-key-omission: seed the V42 schema for deterministic V43 backfill
                insert into memberships (
                  id, club_id, user_id, role, status, short_name, joined_at, created_at, updated_at
                ) values (?, ?, ?, 'MEMBER', ?, ?, null, ?, ?)
                """.trimIndent(),
                avatarFixtureMembershipId(clubNumber, memberNumber),
                clubId,
                userId,
                status,
                "Avatar $clubNumber-$memberNumber",
                createdAt,
                createdAt,
            )
        }
    }

    private fun avatarFixtureClubId(clubNumber: Int): String =
        "20000000-0000-0000-0000-" +
            clubNumber.toString().padStart(12, '0')

    private fun avatarFixtureUserId(
        clubNumber: Int,
        memberNumber: Int,
    ): String = "21000000-0000-0000-${clubNumber.toString().padStart(4, '0')}-${memberNumber.toString().padStart(12, '0')}"

    private fun avatarFixtureMembershipId(
        clubNumber: Int,
        memberNumber: Int,
    ): String {
        val prefix = if (memberNumber >= 22) "30000000" else "31000000"
        return "$prefix-0000-0000-${clubNumber.toString().padStart(4, '0')}-" +
            memberNumber.toString().padStart(12, '0')
    }

    @Test
    fun `mysql creates atomic admin replay receipts with byte exact v2 evidence`() {
        assertAtomicAdminReplaySchema(jdbcTemplate)
        assertOldBinaryAdminReplayInsertRemainsV1(jdbcTemplate)
        assertV2AdminReplayConstraintsAndCycleSafeCleanup(jdbcTemplate)
    }

    private fun assertOldBinaryAdminReplayInsertRemainsV1(jdbcTemplate: JdbcTemplate) {
        val previewId = UUID.randomUUID().toString()
        val actorUserId =
            jdbcTemplate.queryForObject("select id from users order by id limit 1", String::class.java)
                ?: error("Expected a seeded migration-test user")
        try {
            jdbcTemplate.update(
                """
                insert into admin_notification_replay_previews (
                  id, actor_user_id, filter_json, selection_hash, matched_count, expires_at, created_at
                ) values (?, ?, json_object('channel', 'EMAIL'), ?, 0,
                          '2026-08-10 00:10:00.000000', '2026-08-10 00:00:00.000000')
                """.trimIndent(),
                previewId,
                actorUserId,
                "a".repeat(64),
            )
            val row =
                jdbcTemplate.queryForMap(
                    """
                    select contract_version, actor_platform_role, club_id, consumed_confirmation_id
                    from admin_notification_replay_previews
                    where id = ?
                    """.trimIndent(),
                    previewId,
                )
            assertThat(row["CONTRACT_VERSION"]).isEqualTo(1)
            assertThat(row["ACTOR_PLATFORM_ROLE"]).isNull()
            assertThat(row["CLUB_ID"]).isNull()
            assertThat(row["CONSUMED_CONFIRMATION_ID"]).isNull()
        } finally {
            jdbcTemplate.update("delete from admin_notification_replay_previews where id = ?", previewId)
        }
    }

    private fun assertV2AdminReplayConstraintsAndCycleSafeCleanup(jdbcTemplate: JdbcTemplate) {
        val fixture = insertV2AdminReplayFixtureMetadata()
        try {
            assertV2ReplayPreviewRoleAndHashConstraints(jdbcTemplate, fixture)
            assertV2ReplayTargetConstraints(jdbcTemplate, fixture)
            insertV2ReplayAuditMetadata(jdbcTemplate, fixture)
            assertV2ReplayConfirmationConstraints(jdbcTemplate, fixture)
            assertV2ReplayConsumeConstraints(jdbcTemplate, fixture)
        } finally {
            cleanupV2AdminReplayFixtureCycleSafely(jdbcTemplate, fixture)
        }
    }

    private fun insertV2AdminReplayFixtureMetadata(): V2AdminReplayFixture {
        val fixture = V2AdminReplayFixture()
        insertClub(fixture.clubId, "atomic-replay-${fixture.suffix}")
        insertProfileUser(
            fixture.actorUserId,
            "atomic-replay-${fixture.suffix}@example.com",
            "Atomic Replay",
            "Replay${fixture.suffix}",
        )
        return fixture
    }

    private fun assertV2ReplayPreviewRoleAndHashConstraints(
        jdbcTemplate: JdbcTemplate,
        fixture: V2AdminReplayFixture,
    ) {
        listOf("owner", "OwNeR", "OWNER ").forEach { invalidRole ->
            assertConstraintRejected {
                insertV2ReplayPreview(
                    jdbcTemplate,
                    UUID.randomUUID().toString(),
                    fixture.actorUserId,
                    fixture.clubId,
                    invalidRole,
                )
            }
        }
        assertConstraintRejected {
            insertV2ReplayPreview(
                jdbcTemplate,
                UUID.randomUUID().toString(),
                fixture.actorUserId,
                fixture.clubId,
                "OWNER",
                selectionHash = "A".repeat(64),
            )
        }
        insertV2ReplayPreview(jdbcTemplate, fixture.previewId, fixture.actorUserId, fixture.clubId, "OWNER")
        insertV2ReplayPreview(jdbcTemplate, fixture.operatorPreviewId, fixture.actorUserId, fixture.clubId, "OPERATOR")
    }

    private fun assertV2ReplayTargetConstraints(
        jdbcTemplate: JdbcTemplate,
        fixture: V2AdminReplayFixture,
    ) {
        insertReplayTarget(
            jdbcTemplate,
            fixture.operatorPreviewId,
            UUID.randomUUID().toString(),
            fixture.clubId,
            "DEAD",
            "MAIL_PERMANENT",
        )
        listOf("failed", "FaIlEd", "FAILED ").forEach { invalidStatus ->
            assertReplayTargetRejected(jdbcTemplate, fixture, invalidStatus, "MAIL_RETRYABLE")
        }
        listOf("mail_retryable", "Mail_Retryable", "MAIL_RETRYABLE ").forEach { invalidCode ->
            assertReplayTargetRejected(jdbcTemplate, fixture, "FAILED", invalidCode)
        }
        assertReplayTargetRejected(jdbcTemplate, fixture, "FAILED", "MAIL_RETRYABLE", expectedAttemptCount = -1)
        insertReplayTarget(
            jdbcTemplate,
            fixture.previewId,
            fixture.deliveryId,
            fixture.clubId,
            "FAILED",
            "MAIL_RETRYABLE",
        )
    }

    private fun assertReplayTargetRejected(
        jdbcTemplate: JdbcTemplate,
        fixture: V2AdminReplayFixture,
        status: String,
        failureCode: String,
        expectedAttemptCount: Int = 1,
    ) {
        assertConstraintRejected {
            insertReplayTarget(
                jdbcTemplate,
                fixture.previewId,
                UUID.randomUUID().toString(),
                fixture.clubId,
                status,
                failureCode,
                expectedAttemptCount,
            )
        }
    }

    private fun insertV2ReplayAuditMetadata(
        jdbcTemplate: JdbcTemplate,
        fixture: V2AdminReplayFixture,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events (
              id, actor_user_id, actor_platform_role, event_type, metadata_json, created_at
            ) values (?, ?, 'OWNER', 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED', json_object(),
                      '2026-08-10 00:01:00.000000')
            """.trimIndent(),
            fixture.auditId,
            fixture.actorUserId,
        )
    }

    private fun assertV2ReplayConfirmationConstraints(
        jdbcTemplate: JdbcTemplate,
        fixture: V2AdminReplayFixture,
    ) {
        listOf("operator", "OpErAtOr", "OPERATOR ").forEach { invalidRole ->
            assertReplayConfirmationRejected(jdbcTemplate, fixture, actorPlatformRole = invalidRole)
        }
        assertReplayConfirmationRejected(jdbcTemplate, fixture, replayedCount = -1)
        assertReplayConfirmationRejected(jdbcTemplate, fixture, skippedCount = -1)
        insertReplayConfirmation(
            jdbcTemplate,
            fixture.confirmationId,
            fixture.previewId,
            fixture.actorUserId,
            "OWNER",
            fixture.clubId,
            fixture.auditId,
        )
        assertUniqueConstraintRejected("admin_notification_replay_confirmations_preview_uk") {
            insertReplayConfirmation(
                jdbcTemplate,
                UUID.randomUUID().toString(),
                fixture.previewId,
                fixture.actorUserId,
                "OWNER",
                fixture.clubId,
                fixture.auditId,
            )
        }
    }

    private fun assertReplayConfirmationRejected(
        jdbcTemplate: JdbcTemplate,
        fixture: V2AdminReplayFixture,
        actorPlatformRole: String = "OWNER",
        replayedCount: Int = 1,
        skippedCount: Int = 0,
    ) {
        assertConstraintRejected {
            insertReplayConfirmation(
                jdbcTemplate,
                UUID.randomUUID().toString(),
                fixture.previewId,
                fixture.actorUserId,
                actorPlatformRole,
                fixture.clubId,
                fixture.auditId,
                replayedCount = replayedCount,
                skippedCount = skippedCount,
            )
        }
    }

    private fun assertV2ReplayConsumeConstraints(
        jdbcTemplate: JdbcTemplate,
        fixture: V2AdminReplayFixture,
    ) {
        assertConstraintRejected {
            jdbcTemplate.update(
                """
                update admin_notification_replay_previews
                set consumed_at = '2026-08-10 00:01:00.000000'
                where id = ?
                """.trimIndent(),
                fixture.previewId,
            )
        }
        assertConstraintRejected {
            jdbcTemplate.update(
                "update admin_notification_replay_previews set consumed_confirmation_id = ? where id = ?",
                fixture.confirmationId,
                fixture.previewId,
            )
        }
        jdbcTemplate.update(
            """
            update admin_notification_replay_previews
            set consumed_at = '2026-08-10 00:01:00.000000', consumed_confirmation_id = ?
            where id = ?
            """.trimIndent(),
            fixture.confirmationId,
            fixture.previewId,
        )
        assertConstraintRejected {
            insertV2ReplayPreview(
                jdbcTemplate,
                fixture.nullRolePreviewId,
                fixture.actorUserId,
                fixture.clubId,
                null,
            )
        }
    }

    private fun cleanupV2AdminReplayFixtureCycleSafely(
        jdbcTemplate: JdbcTemplate,
        fixture: V2AdminReplayFixture,
    ) {
        jdbcTemplate.update("delete from admin_notification_replay_previews where id = ?", fixture.previewId)
        jdbcTemplate.update(
            "delete from admin_notification_replay_confirmations where preview_id = ?",
            fixture.previewId,
        )
        jdbcTemplate.update("delete from platform_audit_events where id = ?", fixture.auditId)
        jdbcTemplate.update(
            "delete from admin_notification_replay_previews where id in (?, ?)",
            fixture.operatorPreviewId,
            fixture.nullRolePreviewId,
        )
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from admin_notification_replay_preview_targets where preview_id = ?",
                Int::class.java,
                fixture.previewId,
            ),
        ).isZero()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from admin_notification_replay_confirmations where preview_id = ?",
                Int::class.java,
                fixture.previewId,
            ),
        ).isZero()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where id = ?",
                Int::class.java,
                fixture.auditId,
            ),
        ).isZero()
        jdbcTemplate.update("delete from users where id = ?", fixture.actorUserId)
        jdbcTemplate.update("delete from clubs where id = ?", fixture.clubId)
    }

    private data class V2AdminReplayFixture(
        val suffix: String = UUID.randomUUID().toString().take(8),
        val clubId: String = UUID.randomUUID().toString(),
        val actorUserId: String = UUID.randomUUID().toString(),
        val previewId: String = UUID.randomUUID().toString(),
        val operatorPreviewId: String = UUID.randomUUID().toString(),
        val nullRolePreviewId: String = UUID.randomUUID().toString(),
        val deliveryId: String = UUID.randomUUID().toString(),
        val auditId: String = UUID.randomUUID().toString(),
        val confirmationId: String = UUID.randomUUID().toString(),
    )

    private fun assertAtomicAdminReplaySchema(jdbcTemplate: JdbcTemplate) {
        assertAtomicAdminReplayColumns(jdbcTemplate)
        assertAtomicAdminReplayIndexesAndChecks(jdbcTemplate)
        assertAtomicAdminReplayForeignKeys(jdbcTemplate)
    }

    private fun assertAtomicAdminReplayColumns(jdbcTemplate: JdbcTemplate) {
        assertThat(columns(jdbcTemplate, "admin_notification_replay_previews"))
            .contains("contract_version", "actor_platform_role", "club_id", "consumed_confirmation_id")
        assertThat(columns(jdbcTemplate, "admin_notification_replay_preview_targets"))
            .containsExactlyInAnyOrder(
                "preview_id",
                "delivery_id",
                "club_id",
                "expected_status",
                "expected_attempt_count",
                "expected_failure_code",
                "expected_updated_at",
            )
        assertThat(columns(jdbcTemplate, "admin_notification_replay_confirmations"))
            .containsExactlyInAnyOrder(
                "id",
                "preview_id",
                "actor_user_id",
                "actor_platform_role",
                "actor_capabilities_json",
                "club_id",
                "command_type",
                "target_kind",
                "target_id_snapshot",
                "selection_hash",
                "identity_mode",
                "canonical_schema_version",
                "digest_key_version",
                "request_hmac",
                "replayed_count",
                "skipped_count",
                "skipped_reason_counts_json",
                "origin_outcome",
                "platform_audit_event_id",
                "confirmed_at",
            )
        val contractVersion = columnMetadata(jdbcTemplate, "admin_notification_replay_previews", "contract_version")
        assertThat(contractVersion["IS_NULLABLE"]).isEqualTo("NO")
        assertThat(contractVersion["COLUMN_DEFAULT"].toString()).isEqualTo("1")
        listOf(
            "admin_notification_replay_previews" to "actor_platform_role",
            "admin_notification_replay_preview_targets" to "expected_status",
            "admin_notification_replay_preview_targets" to "expected_failure_code",
            "admin_notification_replay_confirmations" to "actor_platform_role",
        ).forEach { (table, column) ->
            val metadata = columnMetadata(jdbcTemplate, table, column)
            assertThat(metadata["DATA_TYPE"]).isEqualTo("varchar")
            assertThat(metadata["CHARACTER_SET_NAME"]).isEqualTo("ascii")
            assertThat(metadata["COLLATION_NAME"]).isEqualTo("ascii_bin")
        }
        assertThat(
            columnMetadata(
                jdbcTemplate,
                "admin_notification_replay_preview_targets",
                "expected_updated_at",
            )["DATETIME_PRECISION"],
        ).isEqualTo(6L)
        assertThat(
            columnMetadata(
                jdbcTemplate,
                "admin_notification_replay_confirmations",
                "confirmed_at",
            )["DATETIME_PRECISION"],
        ).isEqualTo(6L)
    }

    private fun assertAtomicAdminReplayIndexesAndChecks(jdbcTemplate: JdbcTemplate) {
        assertEquals(
            "preview_id,delivery_id",
            indexColumns(jdbcTemplate, "admin_notification_replay_preview_targets", "PRIMARY"),
        )
        assertEquals(
            "preview_id,delivery_id,expected_status,expected_attempt_count,expected_updated_at",
            indexColumns(
                jdbcTemplate,
                "admin_notification_replay_preview_targets",
                "admin_notification_replay_preview_targets_confirm_idx",
            ),
        )
        assertEquals(
            "preview_id",
            indexColumns(
                jdbcTemplate,
                "admin_notification_replay_confirmations",
                "admin_notification_replay_confirmations_preview_uk",
            ),
        )
        assertThat(
            indexNonUnique(
                jdbcTemplate,
                "admin_notification_replay_confirmations",
                "admin_notification_replay_confirmations_preview_uk",
            ),
        ).isZero()
        assertThat(checkConstraintClause(jdbcTemplate, "admin_notification_replay_previews_versioned_check"))
            .contains("contract_version", "actor_platform_role", "selection_hash", "consumed_confirmation_id")
        assertThat(checkConstraintClause(jdbcTemplate, "admin_notification_replay_preview_targets_status_check"))
            .contains("FAILED", "DEAD")
        assertThat(checkConstraintClause(jdbcTemplate, "admin_notification_replay_preview_targets_failure_code_check"))
            .contains("MAIL_RETRYABLE", "MAIL_PERMANENT")
        assertThat(checkConstraintClause(jdbcTemplate, "admin_notification_replay_confirmations_counts_check"))
            .contains("replayed_count", "skipped_count")
        assertThat(checkConstraintClause(jdbcTemplate, "admin_notification_confirmations_identity_check"))
            .contains("LEGACY_SELECTION_SHA", "HMAC", "selection_hash", "request_hmac")
    }

    private fun assertAtomicAdminReplayForeignKeys(jdbcTemplate: JdbcTemplate) {
        assertEquals(
            "admin_notification_replay_previews:id",
            foreignKeyReference(
                jdbcTemplate,
                "admin_notification_replay_preview_targets",
                "admin_notification_replay_preview_targets_preview_fk",
            ),
        )
        assertEquals(
            "CASCADE",
            foreignKeyDeleteRule(
                jdbcTemplate,
                "admin_notification_replay_preview_targets",
                "admin_notification_replay_preview_targets_preview_fk",
            ),
        )
        assertThat(importedKeys(jdbcTemplate, "admin_notification_replay_confirmations")).isEmpty()
        assertEquals(
            "admin_notification_replay_confirmations:id,preview_id",
            foreignKeyReference(
                jdbcTemplate,
                "admin_notification_replay_previews",
                "admin_notification_replay_previews_confirmation_fk",
            ),
        )
        assertEquals(
            "RESTRICT",
            foreignKeyDeleteRule(
                jdbcTemplate,
                "admin_notification_replay_previews",
                "admin_notification_replay_previews_confirmation_fk",
            ),
        )
    }

    private fun insertV2ReplayPreview(
        jdbcTemplate: JdbcTemplate,
        previewId: String,
        actorUserId: String,
        clubId: String,
        actorRole: String?,
        selectionHash: String = "a".repeat(64),
    ) {
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews (
              id, actor_user_id, actor_platform_role, club_id, contract_version,
              filter_json, selection_hash, matched_count, expires_at, created_at
            ) values (?, ?, ?, ?, 2, json_object('channel', 'EMAIL'), ?, 1,
                      '2026-08-10 00:10:00.000000', '2026-08-10 00:00:00.000000')
            """.trimIndent(),
            previewId,
            actorUserId,
            actorRole,
            clubId,
            selectionHash,
        )
    }

    private fun insertReplayTarget(
        jdbcTemplate: JdbcTemplate,
        previewId: String,
        deliveryId: String,
        clubId: String,
        expectedStatus: String,
        expectedFailureCode: String,
        expectedAttemptCount: Int = 1,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_preview_targets (
              preview_id, delivery_id, club_id, expected_status, expected_attempt_count,
              expected_failure_code, expected_updated_at
            ) values (?, ?, ?, ?, ?, ?, '2026-08-10 00:00:00.000000')
            """.trimIndent(),
            previewId,
            deliveryId,
            clubId,
            expectedStatus,
            expectedAttemptCount,
            expectedFailureCode,
        )
    }

    private fun insertReplayConfirmation(
        jdbcTemplate: JdbcTemplate,
        confirmationId: String,
        previewId: String,
        actorUserId: String,
        actorRole: String,
        clubId: String,
        auditId: String,
        replayedCount: Int = 1,
        skippedCount: Int = 0,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_confirmations (
              id, preview_id, actor_user_id, actor_platform_role, club_id, selection_hash,
              actor_capabilities_json, command_type, target_kind, target_id_snapshot,
              identity_mode, canonical_schema_version, digest_key_version, request_hmac,
              replayed_count, skipped_count, skipped_reason_counts_json, origin_outcome,
              platform_audit_event_id, confirmed_at
            ) values (?, ?, ?, ?, ?, null, json_array('REPLAY_NOTIFICATIONS'),
                      'notification.replay', 'NOTIFICATION_REPLAY_TARGET_SET', ?,
                      'HMAC', 'notification-replay:v1', 1, ?, ?, ?, json_object(), 'SUCCEEDED', ?,
                      '2026-08-10 00:01:00.000000')
            """.trimIndent(),
            confirmationId,
            previewId,
            actorUserId,
            actorRole,
            clubId,
            confirmationId,
            ByteArray(32) { 0x51 },
            replayedCount,
            skippedCount,
            auditId,
        )
    }

    private fun assertConstraintRejected(block: () -> Unit) {
        val error = assertThrows(RuntimeException::class.java, block)
        assertThat(error).isInstanceOfAny(
            DataIntegrityViolationException::class.java,
            UncategorizedSQLException::class.java,
        )
        val causalMessages =
            generateSequence<Throwable>(error) { it.cause }
                .mapNotNull { it.message }
                .joinToString("\n")
        assertThat(causalMessages).containsIgnoringCase("constraint")
    }

    private fun assertUniqueConstraintRejected(
        constraintName: String,
        block: () -> Unit,
    ) {
        val error = assertThrows(DataIntegrityViolationException::class.java, block)
        val causalMessages =
            generateSequence<Throwable>(error) { it.cause }
                .mapNotNull { it.message }
                .joinToString("\n")
        assertThat(causalMessages).contains(constraintName)
    }

    private data class LegacyReplayFixtures(
        val openPreviewId: String,
        val consumedPreviewId: String,
    )

    private fun insertLegacyAdminReplayPreviewFixtures(jdbcTemplate: JdbcTemplate): LegacyReplayFixtures {
        val actorUserId =
            jdbcTemplate.queryForObject("select id from users order by id limit 1", String::class.java)
                ?: error("Expected a user before inserting legacy replay fixtures")
        val fixtures = LegacyReplayFixtures(UUID.randomUUID().toString(), UUID.randomUUID().toString())
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews (
              id, actor_user_id, filter_json, selection_hash, matched_count, expires_at, consumed_at, created_at
            ) values
              (?, ?, json_object('channel', 'EMAIL'), ?, 1,
               '2026-08-10 00:10:00.000000', null, '2026-08-10 00:00:00.000000'),
              (?, ?, json_object('channel', 'EMAIL'), ?, 2,
               '2026-08-10 00:10:00.000000', '2026-08-10 00:01:00.000000', '2026-08-10 00:00:00.000000')
            """.trimIndent(),
            fixtures.openPreviewId,
            actorUserId,
            "b".repeat(64),
            fixtures.consumedPreviewId,
            actorUserId,
            "c".repeat(64),
        )
        return fixtures
    }

    private fun assertLegacyAdminReplayPreviewFixtures(
        jdbcTemplate: JdbcTemplate,
        fixtures: LegacyReplayFixtures,
    ) {
        val rows =
            jdbcTemplate.queryForList(
                """
                select id, contract_version, actor_platform_role, club_id, consumed_at, consumed_confirmation_id
                from admin_notification_replay_previews
                where id in (?, ?)
                order by id
                """.trimIndent(),
                fixtures.openPreviewId,
                fixtures.consumedPreviewId,
            )
        assertThat(rows).hasSize(2)
        assertThat(rows).allSatisfy { row ->
            assertThat(row["CONTRACT_VERSION"]).isEqualTo(1)
            assertThat(row["ACTOR_PLATFORM_ROLE"]).isNull()
            assertThat(row["CLUB_ID"]).isNull()
            assertThat(row["CONSUMED_CONFIRMATION_ID"]).isNull()
        }
        val consumedAtById = rows.associate { it["ID"].toString() to it["CONSUMED_AT"] }
        assertThat(consumedAtById[fixtures.openPreviewId]).isNull()
        assertThat(consumedAtById[fixtures.consumedPreviewId]).isNotNull()
    }

    @Test
    fun `mysql creates host session record revision and notification confirmation tables`() {
        val tables =
            jdbcTemplate
                .queryForList(
                    """
                    select table_name
                    from information_schema.tables
                    where table_schema = database()
                      and table_name in (
                        'session_record_drafts',
                        'session_record_revisions',
                        'host_session_change_audit',
                        'host_action_notification_previews',
                        'host_action_notification_decisions'
                      )
                    """.trimIndent(),
                    String::class.java,
                ).toSet()

        assertEquals(
            setOf(
                "session_record_drafts",
                "session_record_revisions",
                "host_session_change_audit",
                "host_action_notification_previews",
                "host_action_notification_decisions",
            ),
            tables,
        )
        assertEquals(
            "club_id,session_id,version",
            indexColumns("session_record_revisions", "session_record_revisions_version_uk"),
        )
        assertEquals(
            "session_id,club_id",
            foreignKeyColumns("session_record_drafts", "session_record_drafts_session_fk"),
        )
        assertEquals(
            "session_id,club_id",
            indexColumns("session_record_drafts", "PRIMARY"),
        )
        assertEquals("NO", columnValue("session_record_drafts", "base_session_updated_at", "is_nullable"))
        assertTrue(checkConstraintClause("session_record_drafts_sha_check").contains("64"))
        assertTrue(checkConstraintClause("session_record_revisions_sha_check").contains("64"))
        val previewCounts = checkConstraintClause("host_action_notification_previews_counts_check")
        assertTrue(previewCounts.contains("target_count") && previewCounts.contains(">= 0"))
        val decisionCounts = checkConstraintClause("host_action_notification_decisions_counts_check")
        assertTrue(decisionCounts.contains("target_count") && decisionCounts.contains(">= 0"))
        val decisions = checkConstraintClause("host_action_notification_decisions_decision_check")
        assertTrue(decisions.contains("SEND") && decisions.contains("SKIP"))
        assertHostNotificationComposerSchema()
    }

    @Test
    fun `mysql creates append-only host session lifecycle audit without cascade foreign keys`() {
        assertThat(tableExists("host_session_lifecycle_audit")).isTrue()
        assertThat(importedKeys("host_session_lifecycle_audit")).isEmpty()
        assertLifecycleAuditSchema()
        assertThatThrownBy {
            insertLifecycleAudit(action = "OPENED", from = "CLOSED", to = "OPEN", reason = null)
        }.isInstanceOf(UncategorizedSQLException::class.java)
            .hasMessageContaining("host_session_lifecycle_audit_contract_check")
        assertThatThrownBy {
            insertLifecycleAudit(action = "REOPENED", from = "CLOSED", to = "OPEN", reason = null)
        }.isInstanceOf(UncategorizedSQLException::class.java)
            .hasMessageContaining("host_session_lifecycle_audit_contract_check")
        assertThatThrownBy {
            insertLifecycleAudit(
                action = "DELETED",
                from = "DRAFT",
                to = null,
                reason = "ACCIDENTAL_TRANSITION",
            )
        }.isInstanceOf(UncategorizedSQLException::class.java)
            .hasMessageContaining("host_session_lifecycle_audit_contract_check")
        assertThatThrownBy {
            insertLifecycleAudit(
                action = "REOPENED",
                from = "CLOSED",
                to = "OPEN",
                reason = "NOT_A_REASON",
            )
        }.isInstanceOf(UncategorizedSQLException::class.java)
            .hasMessageContaining("host_session_lifecycle_audit_reason_check")
        try {
            insertLifecycleAudit(action = "OPENED", from = "DRAFT", to = "OPEN", reason = null)
            insertLifecycleAudit(
                action = "DELETED",
                from = "OPEN",
                to = null,
                reason = "EMPTY_SESSION_DELETED",
            )
            insertLifecycleAudit(
                action = "REOPENED",
                from = "CLOSED",
                to = "OPEN",
                reason = "ACCIDENTAL_TRANSITION",
            )
            assertEquals(
                3,
                jdbcTemplate.queryForObject(
                    "select count(*) from host_session_lifecycle_audit where club_id = ?",
                    Int::class.java,
                    LIFECYCLE_AUDIT_CLUB_ID,
                ),
            )
        } finally {
            jdbcTemplate.update(
                "delete from host_session_lifecycle_audit where club_id = ?",
                LIFECYCLE_AUDIT_CLUB_ID,
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql adds host session change snapshots without a self foreign key`() {
        assertThat(columns("host_session_change_audit")).contains(
            "before_snapshot_json",
            "after_snapshot_json",
            "restored_from_change_id",
        )
        assertEquals("YES", columnValue("host_session_change_audit", "before_snapshot_json", "is_nullable"))
        assertEquals("YES", columnValue("host_session_change_audit", "after_snapshot_json", "is_nullable"))
        assertEquals("YES", columnValue("host_session_change_audit", "restored_from_change_id", "is_nullable"))
        assertThat(checkConstraintClause("host_session_change_audit_before_json_check")).contains("json_valid")
        assertThat(checkConstraintClause("host_session_change_audit_after_json_check")).contains("json_valid")
        assertThat(foreignKeyedColumns("host_session_change_audit")).doesNotContain("restored_from_change_id")

        val auditId = "aaaaaaaa-0000-4000-8000-000000050001"
        try {
            jdbcTemplate.update(
                """
                insert into host_session_change_audit (
                  id, club_id, session_id, actor_membership_id, action_type, changed_fields_json
                ) values (?, ?, ?, ?, 'BASIC_INFO_UPDATED', '["title"]')
                """.trimIndent(),
                auditId,
                CHANGE_SNAPSHOT_CLUB_ID,
                CHANGE_SNAPSHOT_SESSION_ID,
                CHANGE_SNAPSHOT_ACTOR_ID,
            )
            val row =
                jdbcTemplate.queryForMap(
                    """
                    select before_snapshot_json, after_snapshot_json, restored_from_change_id, changed_fields_json
                    from host_session_change_audit
                    where id = ?
                    """.trimIndent(),
                    auditId,
                )
            assertThat(row["before_snapshot_json"]).isNull()
            assertThat(row["after_snapshot_json"]).isNull()
            assertThat(row["restored_from_change_id"]).isNull()
            assertThat(row["changed_fields_json"].toString()).isEqualTo("""["title"]""")
            assertThatThrownBy {
                jdbcTemplate.update(
                    """
                    insert into host_session_change_audit (
                      id, club_id, session_id, actor_membership_id, action_type,
                      changed_fields_json, before_snapshot_json
                    ) values (?, ?, ?, ?, 'BASIC_INFO_UPDATED', '["title"]', 'not-json')
                    """.trimIndent(),
                    "aaaaaaaa-0000-4000-8000-000000050002",
                    CHANGE_SNAPSHOT_CLUB_ID,
                    CHANGE_SNAPSHOT_SESSION_ID,
                    CHANGE_SNAPSHOT_ACTOR_ID,
                )
            }.isInstanceOf(UncategorizedSQLException::class.java)
                .hasMessageContaining("host_session_change_audit_before_json_check")
        } finally {
            jdbcTemplate.update(
                "delete from host_session_change_audit where id in (?, ?)",
                auditId,
                "aaaaaaaa-0000-4000-8000-000000050002",
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql adds host session trash columns view and restored lifecycle contract`() {
        assertThat(columns("sessions")).contains(
            "deleted_at",
            "deleted_by_membership_id",
            "purge_after",
        )
        assertEquals("YES", columnValue("sessions", "deleted_at", "is_nullable"))
        assertEquals("YES", columnValue("sessions", "deleted_by_membership_id", "is_nullable"))
        assertEquals("YES", columnValue("sessions", "purge_after", "is_nullable"))
        assertEquals("datetime", columnValue("sessions", "deleted_at", "data_type"))
        assertEquals("datetime", columnValue("sessions", "purge_after", "data_type"))
        assertEquals("6", columnValue("sessions", "deleted_at", "datetime_precision"))
        assertEquals("6", columnValue("sessions", "purge_after", "datetime_precision"))
        assertEquals("char", columnValue("sessions", "deleted_by_membership_id", "data_type"))
        assertEquals(
            "club_id,deleted_at,state,number",
            indexColumns("sessions", "sessions_club_deleted_state_number_idx"),
        )
        assertEquals("purge_after,id", indexColumns("sessions", "sessions_purge_after_idx"))
        assertThat(checkConstraintClause("sessions_trash_contract_check"))
            .contains("deleted_at", "deleted_by_membership_id", "purge_after")
        assertTrue(viewExists("active_sessions"))
        assertThat(viewDefinition("active_sessions")).containsIgnoringCase("deleted_at")

        val restoredDraftId = "aaaaaaaa-0000-4000-8000-000000051001"
        val restoredOpenId = "aaaaaaaa-0000-4000-8000-000000051002"
        try {
            jdbcTemplate.update(
                """
                update sessions
                set deleted_at = utc_timestamp(6),
                    deleted_by_membership_id = ?,
                    purge_after = date_add(utc_timestamp(6), interval 7 day)
                where id = ?
                """.trimIndent(),
                CHANGE_SNAPSHOT_ACTOR_ID,
                CHANGE_SNAPSHOT_SESSION_ID,
            )
            assertEquals(
                0,
                jdbcTemplate.queryForObject(
                    "select count(*) from active_sessions where id = ?",
                    Int::class.java,
                    CHANGE_SNAPSHOT_SESSION_ID,
                ),
            )
            assertEquals(
                1,
                jdbcTemplate.queryForObject(
                    "select count(*) from sessions where id = ?",
                    Int::class.java,
                    CHANGE_SNAPSHOT_SESSION_ID,
                ),
            )
            assertThatThrownBy {
                jdbcTemplate.update(
                    """
                    update sessions
                    set deleted_at = utc_timestamp(6),
                        deleted_by_membership_id = null,
                        purge_after = null
                    where id = ?
                    """.trimIndent(),
                    CHANGE_SNAPSHOT_SESSION_ID,
                )
            }.isInstanceOf(UncategorizedSQLException::class.java)
                .hasMessageContaining("sessions_trash_contract_check")

            insertLifecycleAudit(
                action = "RESTORED",
                from = "DRAFT",
                to = "DRAFT",
                reason = "OPERATIONAL_RECOVERY",
                id = restoredDraftId,
            )
            insertLifecycleAudit(
                action = "RESTORED",
                from = "OPEN",
                to = "OPEN",
                reason = "OPERATIONAL_RECOVERY",
                id = restoredOpenId,
            )
            assertThatThrownBy {
                insertLifecycleAudit(
                    action = "RESTORED",
                    from = "DRAFT",
                    to = "OPEN",
                    reason = "OPERATIONAL_RECOVERY",
                )
            }.isInstanceOf(UncategorizedSQLException::class.java)
                .hasMessageContaining("host_session_lifecycle_audit_contract_check")
            assertThatThrownBy {
                insertLifecycleAudit(
                    action = "RESTORED",
                    from = "CLOSED",
                    to = "CLOSED",
                    reason = "OPERATIONAL_RECOVERY",
                )
            }.isInstanceOf(UncategorizedSQLException::class.java)
                .hasMessageContaining("host_session_lifecycle_audit_contract_check")
            assertThatThrownBy {
                insertLifecycleAudit(
                    action = "RESTORED",
                    from = "DRAFT",
                    to = "DRAFT",
                    reason = "ACCIDENTAL_TRANSITION",
                )
            }.isInstanceOf(UncategorizedSQLException::class.java)
                .hasMessageContaining("host_session_lifecycle_audit_contract_check")
        } finally {
            jdbcTemplate.update(
                """
                update sessions
                set deleted_at = null,
                    deleted_by_membership_id = null,
                    purge_after = null
                where id = ?
                """.trimIndent(),
                CHANGE_SNAPSHOT_SESSION_ID,
            )
            jdbcTemplate.update(
                "delete from host_session_lifecycle_audit where id in (?, ?)",
                restoredDraftId,
                restoredOpenId,
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql migrates an empty schema through independent revision domains`() {
        FlywayUpgradeMySqlContainer().use { database ->
            database.start()
            val dataSource = DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
            val migrateResult =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .load()
                    .migrate()
            val jdbc = JdbcTemplate(dataSource)

            assertThat(migrateResult.targetSchemaVersion.toString()).isEqualTo("59")
            assertV52RevisionSchema(jdbc)
            assertV53IdempotencySchema(jdbc)
            assertV54PublicProjectionConvergenceSchema(jdbc)
            assertV55PlatformAdminPublicTakedownSchema(jdbc)
            assertV56PublicConvergenceWorkRetentionIndex(jdbc)
            assertV57PlatformAdminCommandIdempotencySchema(jdbc)
            assertV58PlatformAdminClubCommandEvidenceSchema(jdbc)
            assertV59PlatformAdminServiceCommandEvidenceSchema(jdbc)
            assertThat(countRows(jdbc, "sessions")).isZero()
            assertThat(countRows(jdbc, "session_publication_versions")).isZero()
            assertThat(countRows(jdbc, "club_host_list_epochs")).isZero()
            assertThat(countRows(jdbc, "session_participant_change_audit")).isZero()

            insertV52RevisionClubGraph(jdbc, V52_EMPTY_CLUB_ID, "empty-revision")
            insertV52RevisionSession(
                jdbc,
                V52_EMPTY_SESSION_ID,
                V52_EMPTY_CLUB_ID,
                number = 1,
                state = "DRAFT",
            )
            assertEquals(
                0L,
                jdbc.queryForObject(
                    """
                    select session_revision + exposure_revision + participant_set_revision
                    from sessions
                    where id = ?
                    """.trimIndent(),
                    Long::class.java,
                    V52_EMPTY_SESSION_ID,
                ),
            )
            jdbc.update(
                """
                insert into session_publication_versions (session_id, publication_revision)
                values (?, 0)
                """.trimIndent(),
                V52_EMPTY_SESSION_ID,
            )
            jdbc.update(
                """
                insert into club_host_list_epochs (club_id, meeting_epoch, record_epoch)
                values (?, 0, 0)
                """.trimIndent(),
                V52_EMPTY_CLUB_ID,
            )
            assertThat(countRows(jdbc, "public_session_publications")).isZero()
            assertEquals(
                0,
                jdbc.queryForObject(
                    "select publication_revision from session_publication_versions where session_id = ?",
                    Int::class.java,
                    V52_EMPTY_SESSION_ID,
                ),
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql upgrades populated v51 rows with revision backfill without changing publication content`() {
        FlywayUpgradeMySqlContainer().use { database ->
            database.start()
            val dataSource = DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
            val v51Flyway =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .target("51")
                    .load()
            assertThat(v51Flyway.migrate().targetSchemaVersion.toString()).isEqualTo("51")
            val upgradeJdbc = JdbcTemplate(dataSource)
            val fixtures = insertV51RevisionUpgradeFixtures(upgradeJdbc)
            val publicationCountBefore = countRows(upgradeJdbc, "public_session_publications")
            val publicSummaryBefore =
                upgradeJdbc.queryForObject(
                    "select public_summary from public_session_publications where session_id = ?",
                    String::class.java,
                    fixtures.publishedSessionId,
                )
            val sessionsWithoutPublication =
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from sessions
                    where id in (?, ?, ?, ?, ?)
                      and id not in (select session_id from public_session_publications)
                    """.trimIndent(),
                    Int::class.java,
                    fixtures.draftSessionId,
                    fixtures.openSessionId,
                    fixtures.closedSessionId,
                    fixtures.openWithoutPublicationSessionId,
                    fixtures.trashedSessionId,
                )

            val upgradeResult =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .load()
                    .migrate()

            assertThat(upgradeResult.migrationsExecuted).isEqualTo(8)
            assertThat(upgradeResult.targetSchemaVersion.toString()).isEqualTo("59")
            assertV52RevisionSchema(upgradeJdbc)
            assertV53IdempotencySchema(upgradeJdbc)
            assertV54PublicProjectionConvergenceSchema(upgradeJdbc)
            assertV55PlatformAdminPublicTakedownSchema(upgradeJdbc)
            assertV56PublicConvergenceWorkRetentionIndex(upgradeJdbc)
            assertV57PlatformAdminCommandIdempotencySchema(upgradeJdbc)
            assertV58PlatformAdminClubCommandEvidenceSchema(upgradeJdbc)
            assertV59PlatformAdminServiceCommandEvidenceSchema(upgradeJdbc)
            assertThat(
                upgradeJdbc.queryForMap(
                    """
                    select generation, live_record_revision, origin_readable
                    from public_projection_generations
                    where session_id = ?
                    """.trimIndent(),
                    fixtures.publishedSessionId,
                ),
            ).containsEntry("generation", 1L)
                .containsEntry("live_record_revision", null)
                .containsEntry("origin_readable", true)
            assertV52RevisionBackfill(upgradeJdbc)
            assertEquals(publicationCountBefore, countRows(upgradeJdbc, "public_session_publications"))
            assertEquals(5, sessionsWithoutPublication)
            assertEquals(
                publicSummaryBefore,
                upgradeJdbc.queryForObject(
                    "select public_summary from public_session_publications where session_id = ?",
                    String::class.java,
                    fixtures.publishedSessionId,
                ),
            )
            assertEquals(
                "V51 preserved public summary",
                publicSummaryBefore,
            )
            assertEquals(
                1,
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from sessions
                    where id = ?
                      and deleted_at is not null
                      and session_revision = 0
                    """.trimIndent(),
                    Int::class.java,
                    fixtures.trashedSessionId,
                ),
            )
            assertEquals(
                0,
                upgradeJdbc.queryForObject(
                    """
                    select attendance_revision
                    from session_participants
                    where session_id = ?
                    """.trimIndent(),
                    Int::class.java,
                    fixtures.openSessionId,
                ),
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql upgrades v56 with rotation safe admin command aliases and permits hard target deletion`() {
        FlywayUpgradeMySqlContainer().use { database ->
            database.start()
            val dataSource = DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
            val v56Flyway =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .target("56")
                    .load()
            assertThat(v56Flyway.migrate().targetSchemaVersion.toString()).isEqualTo("56")
            val upgradeJdbc = JdbcTemplate(dataSource)
            val targetClubId = "aaaaaaaa-0000-4000-8000-000000057001"
            upgradeJdbc.update(
                """
                insert into clubs (id, slug, name, tagline, about)
                values (?, 'v57-hard-delete-target', 'Migration target', 'Migration target', 'Migration target')
                """.trimIndent(),
                targetClubId,
            )

            val upgradeResult =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .load()
                    .migrate()

            assertThat(upgradeResult.migrationsExecuted).isEqualTo(3)
            assertThat(upgradeResult.targetSchemaVersion.toString()).isEqualTo("59")
            assertV57PlatformAdminCommandIdempotencySchema(upgradeJdbc)
            assertV58PlatformAdminClubCommandEvidenceSchema(upgradeJdbc)
            assertV59PlatformAdminServiceCommandEvidenceSchema(upgradeJdbc)

            val actorId = "aaaaaaaa-0000-4000-8000-000000057002"
            val claimId = "aaaaaaaa-0000-4000-8000-000000057003"
            val competingClaimId = "aaaaaaaa-0000-4000-8000-000000057004"
            val claimToken = "aaaaaaaa-0000-4000-8000-000000057005"
            val competingClaimToken = "aaaaaaaa-0000-4000-8000-000000057006"
            val keyHmacV1 = ByteArray(32) { 0x11 }
            val requestHmacV1 = ByteArray(32) { 0x21 }
            insertV57CommandClaim(
                upgradeJdbc,
                id = claimId,
                actorId = actorId,
                targetId = targetClubId,
                claimToken = claimToken,
            )
            insertV57CommandClaim(
                upgradeJdbc,
                id = competingClaimId,
                actorId = actorId,
                targetId = targetClubId,
                claimToken = competingClaimToken,
            )
            upgradeJdbc.update(
                """
                insert into platform_admin_command_digest_key_state (
                  digest_key_version, last_referenced_at, unreferenced_since
                ) values (1, '2026-08-24 00:00:00.000000', null),
                         (2, '2026-08-24 00:00:00.000000', null)
                """.trimIndent(),
            )
            insertV57CommandAlias(
                upgradeJdbc,
                claimId = claimId,
                actorId = actorId,
                targetId = targetClubId,
                digestKeyVersion = 1,
                idempotencyKeyHmac = keyHmacV1,
                requestHmac = requestHmacV1,
            )
            insertV57CommandAlias(
                upgradeJdbc,
                claimId = claimId,
                actorId = actorId,
                targetId = targetClubId,
                digestKeyVersion = 2,
                idempotencyKeyHmac = ByteArray(32) { 0x12 },
                requestHmac = ByteArray(32) { 0x22 },
            )
            assertEquals(
                2,
                upgradeJdbc.queryForObject(
                    "select count(*) from platform_admin_command_idempotency_keys where claim_id = ?",
                    Int::class.java,
                    claimId,
                ),
            )

            assertUniqueConstraintRejected("platform_admin_command_alias_identity_uk") {
                insertV57CommandAlias(
                    upgradeJdbc,
                    claimId = competingClaimId,
                    actorId = actorId,
                    targetId = targetClubId,
                    digestKeyVersion = 1,
                    idempotencyKeyHmac = keyHmacV1,
                    requestHmac = ByteArray(32) { 0x31 },
                )
            }
            assertUniqueConstraintRejected("platform_admin_command_alias_claim_version_uk") {
                insertV57CommandAlias(
                    upgradeJdbc,
                    claimId = claimId,
                    actorId = actorId,
                    targetId = targetClubId,
                    digestKeyVersion = 1,
                    idempotencyKeyHmac = ByteArray(32) { 0x13 },
                    requestHmac = ByteArray(32) { 0x23 },
                )
            }
            assertConstraintRejected {
                insertV57CommandAlias(
                    upgradeJdbc,
                    claimId = claimId,
                    actorId = actorId,
                    targetId = "different-target",
                    digestKeyVersion = 3,
                    idempotencyKeyHmac = ByteArray(32) { 0x14 },
                    requestHmac = ByteArray(32) { 0x24 },
                )
            }
            assertConstraintRejected {
                insertV57CommandAlias(
                    upgradeJdbc,
                    claimId = claimId,
                    actorId = actorId,
                    targetId = targetClubId,
                    digestKeyVersion = 3,
                    idempotencyKeyHmac = ByteArray(31) { 0x15 },
                    requestHmac = ByteArray(32) { 0x25 },
                )
            }
            assertConstraintRejected {
                insertV57CommandAlias(
                    upgradeJdbc,
                    claimId = claimId,
                    actorId = actorId,
                    targetId = targetClubId,
                    digestKeyVersion = 4,
                    idempotencyKeyHmac = ByteArray(32) { 0x16 },
                    requestHmac = ByteArray(31) { 0x26 },
                )
            }
            assertConstraintRejected {
                insertV57CommandAlias(
                    upgradeJdbc,
                    claimId = claimId,
                    actorId = actorId,
                    targetId = targetClubId,
                    digestKeyVersion = -1,
                    idempotencyKeyHmac = ByteArray(32) { 0x17 },
                    requestHmac = ByteArray(32) { 0x27 },
                )
            }
            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    insert into platform_admin_command_digest_key_state (
                      digest_key_version, last_referenced_at, unreferenced_since
                    ) values (-1, '2026-08-24 00:00:00.000000', null)
                    """.trimIndent(),
                )
            }

            assertConstraintRejected {
                insertV57CommandClaim(
                    upgradeJdbc,
                    id = UUID.randomUUID().toString(),
                    actorId = actorId,
                    targetId = "invalid-state",
                    claimToken = UUID.randomUUID().toString(),
                    state = "FAILED",
                )
            }
            assertConstraintRejected {
                insertV57CommandClaim(
                    upgradeJdbc,
                    id = UUID.randomUUID().toString(),
                    actorId = actorId,
                    targetId = "in-progress-with-receipt",
                    claimToken = UUID.randomUUID().toString(),
                    receiptType = "CLUB_COMMAND_RECEIPT",
                    receiptId = UUID.randomUUID().toString(),
                )
            }
            assertConstraintRejected {
                insertV57CommandClaim(
                    upgradeJdbc,
                    id = UUID.randomUUID().toString(),
                    actorId = actorId,
                    targetId = "completed-without-receipt",
                    claimToken = UUID.randomUUID().toString(),
                    state = "COMPLETED",
                )
            }
            assertThatThrownBy {
                insertV57CommandClaim(
                    upgradeJdbc,
                    id = UUID.randomUUID().toString(),
                    actorId = actorId,
                    targetId = "missing-token",
                    claimToken = null,
                )
            }.isInstanceOf(DataIntegrityViolationException::class.java)
                .hasMessageContaining("claim_token")
            insertV57CommandClaim(
                upgradeJdbc,
                id = UUID.randomUUID().toString(),
                actorId = actorId,
                targetId = "completed-with-cas-token",
                claimToken = UUID.randomUUID().toString(),
                state = "COMPLETED",
                receiptType = "CLUB_COMMAND_RECEIPT",
                receiptId = UUID.randomUUID().toString(),
            )

            assertThat(upgradeJdbc.update("delete from clubs where id = ?", targetClubId)).isEqualTo(1)
            assertEquals(
                2,
                upgradeJdbc.queryForObject(
                    "select count(*) from platform_admin_command_idempotency where target_id = ?",
                    Int::class.java,
                    targetClubId,
                ),
            )
            assertThat(
                upgradeJdbc.update("delete from platform_admin_command_idempotency where id = ?", claimId),
            ).isEqualTo(1)
            assertEquals(
                0,
                upgradeJdbc.queryForObject(
                    "select count(*) from platform_admin_command_idempotency_keys where claim_id = ?",
                    Int::class.java,
                    claimId,
                ),
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql upgrades v57 with club command evidence that survives hard club deletion`() {
        FlywayUpgradeMySqlContainer().use { database ->
            database.start()
            val dataSource = DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
            val v57Flyway =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .target("57")
                    .load()
            assertThat(v57Flyway.migrate().targetSchemaVersion.toString()).isEqualTo("57")
            val upgradeJdbc = JdbcTemplate(dataSource)
            val clubId = "aaaaaaaa-0000-4000-8000-000000058001"
            val actorId = "aaaaaaaa-0000-4000-8000-000000058002"
            val auditId = "aaaaaaaa-0000-4000-8000-000000058003"
            val previewId = "aaaaaaaa-0000-4000-8000-000000058004"
            val receiptId = "aaaaaaaa-0000-4000-8000-000000058005"
            val convergenceId = "aaaaaaaa-0000-4000-8000-000000058006"
            upgradeJdbc.update(
                """
                insert into clubs (id, slug, name, tagline, about)
                values (?, 'v58-hard-delete-target', 'V58 target', 'V58 target', 'V58 target')
                """.trimIndent(),
                clubId,
            )
            insertProfileUser(
                upgradeJdbc,
                actorId,
                "v58-actor" + "@" + "example" + "." + "test",
                "V58 Actor",
                "V58Actor",
            )
            upgradeJdbc.update(
                """
                insert into platform_audit_events (
                  id, actor_user_id, actor_platform_role, event_type, metadata_json, created_at
                ) values (?, ?, 'OWNER', 'CLUB_DOMAIN_PROVISIONING_STARTED', json_object(),
                          '2026-08-24 01:00:00.000000')
                """.trimIndent(),
                auditId,
                actorId,
            )

            val upgradeResult =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .load()
                    .migrate()

            assertThat(upgradeResult.migrationsExecuted).isEqualTo(2)
            assertThat(upgradeResult.targetSchemaVersion.toString()).isEqualTo("59")
            assertV58PlatformAdminClubCommandEvidenceSchema(upgradeJdbc)
            assertV59PlatformAdminServiceCommandEvidenceSchema(upgradeJdbc)
            assertEquals(
                0L,
                upgradeJdbc.queryForObject(
                    "select admin_revision from clubs where id = ?",
                    Long::class.java,
                    clubId,
                ),
            )

            insertV58ClubCommandPreview(upgradeJdbc, previewId, actorId, clubId)
            insertV58ClubCommandReceipt(upgradeJdbc, receiptId, previewId, actorId, clubId, auditId)
            assertUniqueConstraintRejected("platform_admin_club_receipts_preview_uk") {
                insertV58ClubCommandReceipt(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    previewId,
                    actorId,
                    clubId,
                    UUID.randomUUID().toString(),
                )
            }
            insertV58ClubCommandConvergence(upgradeJdbc, convergenceId, receiptId)
            listOf(
                "SUCCEEDED" to null,
                "FAILED" to "DNS_PROVIDER_UNAVAILABLE",
            ).forEach { (terminalState, safeErrorCode) ->
                assertConstraintRejected {
                    upgradeJdbc.update(
                        """
                        update platform_admin_club_command_convergence
                        set state = ?, last_safe_error_code = ?, available_at = null
                        where id = ?
                        """.trimIndent(),
                        terminalState,
                        safeErrorCode,
                        convergenceId,
                    )
                }
            }
            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    update platform_admin_club_command_convergence
                    set lease_owner = ?, lease_expires_at = '2026-08-24 01:03:00.000000'
                    where id = ?
                    """.trimIndent(),
                    "HTTPS:" + "/" + "/WORKER_INVALID",
                    convergenceId,
                )
            }
            assertConstraintRejected {
                insertV58ClubCommandConvergenceEvent(
                    upgradeJdbc,
                    convergenceId,
                    UUID.randomUUID().toString(),
                    attemptNo = 99,
                    eventSeq = 0,
                    state = "PENDING",
                    safeErrorCode = null,
                )
            }
            assertConstraintRejected {
                insertV58ClubCommandConvergenceEvent(
                    upgradeJdbc,
                    convergenceId,
                    receiptId,
                    attemptNo = 99,
                    eventSeq = 0,
                    state = "PENDING",
                    safeErrorCode = null,
                    effectType = "HOST_INVITATION",
                )
            }
            assertConstraintRejected {
                insertV58ClubCommandConvergenceEvent(
                    upgradeJdbc,
                    convergenceId,
                    receiptId,
                    attemptNo = 98,
                    eventSeq = 1,
                    state = "SUCCEEDED",
                    safeErrorCode = null,
                )
            }
            listOf("RAW\tERROR", "RAW\nERROR", "HTTPS:" + "/" + "/EXAMPLE_INVALID").forEach { unsafeCode ->
                assertConstraintRejected {
                    upgradeJdbc.update(
                        """
                        update platform_admin_club_command_convergence
                        set last_safe_error_code = ?
                        where id = ?
                        """.trimIndent(),
                        unsafeCode,
                        convergenceId,
                    )
                }
            }
            insertV58ClubCommandConvergenceEvent(
                upgradeJdbc,
                convergenceId,
                receiptId,
                attemptNo = 1,
                eventSeq = 0,
                state = "PENDING",
                safeErrorCode = null,
            )
            insertV58ClubCommandConvergenceEvent(
                upgradeJdbc,
                convergenceId,
                receiptId,
                attemptNo = 1,
                eventSeq = 1,
                state = "FAILED",
                safeErrorCode = "DNS_PROVIDER_UNAVAILABLE",
            )
            upgradeJdbc.update(
                """
                update platform_admin_club_command_convergence
                set state = 'FAILED', attempt_count = 1, next_attempt_no = 2,
                    last_safe_error_code = 'DNS_PROVIDER_UNAVAILABLE',
                    available_at = null,
                    updated_at = '2026-08-24 01:05:00.000000'
                where id = ?
                """.trimIndent(),
                convergenceId,
            )

            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    update platform_admin_club_command_previews
                    set consumed_at = '2026-08-24 01:02:00.000000'
                    where id = ?
                    """.trimIndent(),
                    previewId,
                )
            }
            assertThat(
                upgradeJdbc.update(
                    """
                    update platform_admin_club_command_previews
                    set consumed_at = '2026-08-24 01:02:00.000000',
                        consumed_receipt_id_snapshot = ?
                    where id = ?
                    """.trimIndent(),
                    receiptId,
                    previewId,
                ),
            ).isEqualTo(1)
            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    insert into platform_admin_club_command_previews (
                      id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
                      actor_capabilities_json, target_kind, club_id_snapshot, new_club_slot_id_snapshot,
                      canonical_schema_version, digest_key_version, request_hmac,
                      sanitized_impact_json, expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
                    ) values (?, 'club.onboarding', ?, 'OWNER', json_array('CREATE_CLUB'),
                              'NEW_CLUB', ?, ?, 'club-onboarding:v1', 1, ?, json_object('codes', json_array('CREATE')),
                              '2026-08-24 01:10:00.000000', null, null, '2026-08-24 01:00:00.000000')
                    """.trimIndent(),
                    UUID.randomUUID().toString(),
                    actorId,
                    clubId,
                    UUID.randomUUID().toString(),
                    ByteArray(32) { 0x41 },
                )
            }
            assertConstraintRejected {
                insertV58ClubCommandPreview(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    actorId,
                    clubId,
                    commandType = "CLUB_DOMAIN_PROVISION",
                )
            }
            assertConstraintRejected {
                insertV58ClubCommandPreview(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    actorId,
                    clubId,
                    commandType = "club/domain.provision",
                )
            }
            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    update platform_admin_club_command_previews
                    set canonical_schema_version = ?
                    where id = ?
                    """.trimIndent(),
                    "https:" + "/" + "/schema.invalid",
                    previewId,
                )
            }
            assertConstraintRejected {
                insertV58ClubCommandConvergenceEvent(
                    upgradeJdbc,
                    convergenceId,
                    receiptId,
                    attemptNo = 2,
                    eventSeq = 1,
                    state = "FAILED",
                    safeErrorCode = null,
                )
            }
            assertConstraintRejected {
                insertV58ClubCommandConvergenceEvent(
                    upgradeJdbc,
                    convergenceId,
                    receiptId,
                    attemptNo = 2,
                    eventSeq = 1,
                    state = "FAILED",
                    safeErrorCode = "lowercase_error",
                )
            }
            listOf("RAW\tERROR", "RAW\nERROR", "HTTPS:" + "/" + "/EXAMPLE_INVALID")
                .forEachIndexed { index, unsafeCode ->
                    assertConstraintRejected {
                        insertV58ClubCommandConvergenceEvent(
                            upgradeJdbc,
                            convergenceId,
                            receiptId,
                            attemptNo = index + 10,
                            eventSeq = 1,
                            state = "FAILED",
                            safeErrorCode = unsafeCode,
                        )
                    }
                }
            assertEquals(
                1,
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from platform_admin_club_command_receipts receipt
                    join platform_audit_events audit
                      on audit.id = receipt.platform_audit_event_id_snapshot
                    where receipt.id = ? and audit.id = ?
                    """.trimIndent(),
                    Int::class.java,
                    receiptId,
                    auditId,
                ),
            )
            assertThat(upgradeJdbc.update("delete from clubs where id = ?", clubId)).isEqualTo(1)
            assertEquals(
                1,
                upgradeJdbc.queryForObject(
                    "select count(*) from platform_admin_club_command_receipts where id = ? and club_id_snapshot = ?",
                    Int::class.java,
                    receiptId,
                    clubId,
                ),
            )
            assertEquals(
                2,
                upgradeJdbc.queryForObject(
                    "select count(*) from platform_admin_club_command_convergence_events where convergence_id = ?",
                    Int::class.java,
                    convergenceId,
                ),
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql upgrades v58 with typed service receipts and deletion safe convergence evidence`() {
        FlywayUpgradeMySqlContainer().use { database ->
            database.start()
            val dataSource = DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
            val v58Flyway =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .target("58")
                    .load()
            assertThat(v58Flyway.migrate().targetSchemaVersion.toString()).isEqualTo("58")
            val upgradeJdbc = JdbcTemplate(dataSource)
            val fixture = V59ServiceCommandFixture()
            insertV59LegacyNotificationSources(upgradeJdbc, fixture)
            val v58Checksum =
                upgradeJdbc.queryForObject(
                    "select checksum from flyway_schema_history where version = '58' and success = true",
                    Int::class.java,
                )

            val upgradeResult =
                Flyway
                    .configure()
                    .dataSource(dataSource)
                    .locations("classpath:db/mysql/migration")
                    .load()
                    .migrate()

            assertThat(upgradeResult.migrationsExecuted).isEqualTo(1)
            assertThat(upgradeResult.targetSchemaVersion.toString()).isEqualTo("59")
            assertThat(
                upgradeJdbc.queryForObject(
                    "select checksum from flyway_schema_history where version = '58' and success = true",
                    Int::class.java,
                ),
            ).isEqualTo(v58Checksum)
            assertV59PlatformAdminServiceCommandEvidenceSchema(upgradeJdbc)

            val legacyReceipt =
                upgradeJdbc.queryForMap(
                    """
                    select identity_mode, selection_hash, canonical_schema_version, digest_key_version,
                           request_hmac, command_type, target_kind, target_id_snapshot,
                           actor_capabilities_json, origin_outcome
                    from admin_notification_replay_confirmations
                    where id = ?
                    """.trimIndent(),
                    fixture.legacyNotificationReceiptId,
                )
            assertThat(legacyReceipt["IDENTITY_MODE"]).isEqualTo("LEGACY_SELECTION_SHA")
            assertThat(legacyReceipt["SELECTION_HASH"]).isEqualTo("a".repeat(64))
            assertThat(legacyReceipt["CANONICAL_SCHEMA_VERSION"]).isNull()
            assertThat(legacyReceipt["DIGEST_KEY_VERSION"]).isNull()
            assertThat(legacyReceipt["REQUEST_HMAC"]).isNull()
            assertThat(legacyReceipt["COMMAND_TYPE"]).isEqualTo("notification.replay")
            assertThat(legacyReceipt["TARGET_KIND"]).isEqualTo("NOTIFICATION_REPLAY_TARGET_SET")
            assertThat(legacyReceipt["TARGET_ID_SNAPSHOT"]).isEqualTo(fixture.legacyNotificationReceiptId)
            assertThat(legacyReceipt["ACTOR_CAPABILITIES_JSON"]).isNull()
            assertThat(legacyReceipt["ORIGIN_OUTCOME"]).isEqualTo("SUCCEEDED")
            assertEquals(
                0,
                upgradeJdbc.queryForObject(
                    "select count(*) from admin_notification_replay_confirmation_targets where confirmation_id = ?",
                    Int::class.java,
                    fixture.legacyNotificationReceiptId,
                ),
            )

            insertV59NotificationPreview(upgradeJdbc, fixture.notificationPreviewId, fixture)
            insertV59NotificationReceipt(upgradeJdbc, fixture.notificationReceiptId, fixture.notificationPreviewId, fixture)
            insertV59NotificationReceiptTarget(upgradeJdbc, fixture.notificationReceiptId, fixture.notificationDeliveryId)
            assertUniqueConstraintRejected("PRIMARY") {
                insertV59NotificationReceiptTarget(
                    upgradeJdbc,
                    fixture.notificationReceiptId,
                    fixture.notificationDeliveryId,
                )
            }
            assertConstraintRejected {
                insertV59NotificationReceiptTarget(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    UUID.randomUUID().toString(),
                )
            }
            assertEquals(
                1,
                upgradeJdbc.queryForObject(
                    """
                    select count(*)
                    from admin_notification_replay_confirmation_targets target
                    join admin_notification_replay_confirmations receipt on receipt.id = target.confirmation_id
                    where receipt.id = ? and receipt.replayed_count = 1
                    """.trimIndent(),
                    Int::class.java,
                    fixture.notificationReceiptId,
                ),
            )
            assertConstraintRejected {
                insertV59NotificationReceipt(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    UUID.randomUUID().toString(),
                    fixture,
                    digestKeyVersion = null,
                    auditId = UUID.randomUUID().toString(),
                )
            }
            assertConstraintRejected {
                insertV59NotificationReceipt(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    UUID.randomUUID().toString(),
                    fixture,
                    requestHmac = null,
                    auditId = UUID.randomUUID().toString(),
                )
            }
            assertConstraintRejected {
                insertV59NotificationReceipt(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    UUID.randomUUID().toString(),
                    fixture,
                    legacySelectionSha = "b".repeat(64),
                    auditId = UUID.randomUUID().toString(),
                )
            }
            assertUniqueConstraintRejected("admin_notification_confirmations_audit_uk") {
                insertV59NotificationReceipt(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    UUID.randomUUID().toString(),
                    fixture,
                )
            }

            insertV59AiPreview(upgradeJdbc, fixture.aiPreviewId, fixture)
            insertV59AiPreview(upgradeJdbc, fixture.mismatchedAiPreviewId, fixture)
            insertV59AiReceipt(upgradeJdbc, fixture.aiReceiptId, fixture.aiPreviewId, fixture)
            assertThat(
                upgradeJdbc.queryForObject(
                    """
                    select json_unquote(json_extract(actor_capabilities_json, '$[0]'))
                    from ai_generation_admin_command_receipts
                    where id = ?
                    """.trimIndent(),
                    String::class.java,
                    fixture.aiReceiptId,
                ),
            ).isEqualTo("MANAGE_AI_OPERATIONS")
            assertConstraintRejected {
                insertV59AiPreview(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    fixture,
                    requestHmac = ByteArray(31),
                )
            }
            assertConstraintRejected {
                insertV59AiReceipt(
                    upgradeJdbc,
                    UUID.randomUUID().toString(),
                    UUID.randomUUID().toString(),
                    fixture,
                    safeReasonCode = "https:" + "/" + "/private.invalid",
                )
            }
            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    update ai_generation_admin_command_previews
                    set consumed_at = '2026-08-24 02:02:00.000000', consumed_receipt_id_snapshot = ?
                    where id = ?
                    """.trimIndent(),
                    fixture.aiReceiptId,
                    fixture.mismatchedAiPreviewId,
                )
            }
            assertThat(
                upgradeJdbc.update(
                    """
                    update ai_generation_admin_command_previews
                    set consumed_at = '2026-08-24 02:02:00.000000', consumed_receipt_id_snapshot = ?
                    where id = ?
                    """.trimIndent(),
                    fixture.aiReceiptId,
                    fixture.aiPreviewId,
                ),
            ).isEqualTo(1)

            assertV59TypedConvergenceRejectsMismatches(upgradeJdbc, fixture)
            insertV59NotificationConvergence(upgradeJdbc, fixture.notificationConvergenceId, fixture)
            insertV59AiConvergence(upgradeJdbc, fixture.aiConvergenceId, fixture)
            assertUniqueConstraintRejected("admin_service_convergence_notification_effect_uk") {
                insertV59NotificationConvergence(upgradeJdbc, UUID.randomUUID().toString(), fixture)
            }
            assertUniqueConstraintRejected("admin_service_convergence_ai_effect_uk") {
                insertV59AiConvergence(upgradeJdbc, UUID.randomUUID().toString(), fixture)
            }
            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    update admin_service_command_convergence
                    set lease_owner = null, lease_expires_at = '2026-08-24 02:04:00.000000'
                    where id = ?
                    """.trimIndent(),
                    fixture.notificationConvergenceId,
                )
            }
            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    update admin_service_command_convergence
                    set lease_owner = 'worker-1', lease_expires_at = null
                    where id = ?
                    """.trimIndent(),
                    fixture.notificationConvergenceId,
                )
            }
            assertConstraintRejected {
                upgradeJdbc.update(
                    """
                    update admin_service_command_convergence
                    set state = 'SUCCEEDED', available_at = null
                    where id = ?
                    """.trimIndent(),
                    fixture.notificationConvergenceId,
                )
            }
            assertConstraintRejected {
                insertV59ConvergenceEvent(
                    upgradeJdbc,
                    fixture.notificationConvergenceId,
                    fixture.notificationReceiptId,
                    null,
                    "NOTIFICATION_REPLAY",
                    fixture.notificationReceiptId,
                    attemptNo = 1,
                    eventSeq = 1,
                    state = "SUCCEEDED",
                )
            }
            insertV59ConvergenceEvent(
                upgradeJdbc,
                fixture.notificationConvergenceId,
                fixture.notificationReceiptId,
                null,
                "NOTIFICATION_REPLAY",
                fixture.notificationReceiptId,
                attemptNo = 1,
                eventSeq = 0,
                state = "PENDING",
            )
            insertV59ConvergenceEvent(
                upgradeJdbc,
                fixture.notificationConvergenceId,
                fixture.notificationReceiptId,
                null,
                "NOTIFICATION_REPLAY",
                fixture.notificationReceiptId,
                attemptNo = 1,
                eventSeq = 1,
                state = "PENDING",
                safeErrorCode = "DELIVERIES_STILL_PENDING",
            )
            assertThat(
                upgradeJdbc.update(
                    """
                    update admin_service_command_convergence
                    set attempt_count = 1, next_attempt_no = 2,
                        last_safe_error_code = 'DELIVERIES_STILL_PENDING',
                        available_at = '2026-08-24 02:05:00.000000',
                        updated_at = '2026-08-24 02:03:00.000000'
                    where id = ?
                    """.trimIndent(),
                    fixture.notificationConvergenceId,
                ),
            ).isEqualTo(1)
            assertConstraintRejected {
                insertV59ConvergenceEvent(
                    upgradeJdbc,
                    fixture.notificationConvergenceId,
                    fixture.notificationReceiptId,
                    null,
                    "NOTIFICATION_REPLAY",
                    fixture.aiJobId,
                    attemptNo = 2,
                    eventSeq = 0,
                    state = "PENDING",
                )
            }

            assertThat(
                upgradeJdbc.update(
                    """
                    update admin_notification_replay_previews
                    set consumed_at = '2026-08-24 02:02:00.000000', consumed_confirmation_id = ?
                    where id = ?
                    """.trimIndent(),
                    fixture.notificationReceiptId,
                    fixture.notificationPreviewId,
                ),
            ).isEqualTo(1)
            assertThat(
                upgradeJdbc.update(
                    "delete from admin_notification_replay_previews where id in (?, ?)",
                    fixture.legacyNotificationPreviewId,
                    fixture.notificationPreviewId,
                ),
            ).isEqualTo(2)
            assertThat(
                upgradeJdbc.update("delete from notification_deliveries where id = ?", fixture.notificationDeliveryId),
            ).isEqualTo(1)
            assertThat(
                upgradeJdbc.update("delete from notification_event_outbox where id = ?", fixture.notificationEventId),
            ).isEqualTo(1)
            assertThat(
                upgradeJdbc.update("delete from memberships where id = ?", fixture.membershipId),
            ).isEqualTo(1)
            assertThat(upgradeJdbc.update("delete from platform_audit_events where id = ?", fixture.auditId)).isEqualTo(1)
            assertThat(upgradeJdbc.update("delete from users where id = ?", fixture.actorId)).isEqualTo(1)
            assertThat(upgradeJdbc.update("delete from clubs where id = ?", fixture.clubId)).isEqualTo(1)
            assertEquals(
                2,
                upgradeJdbc.queryForObject(
                    "select count(*) from admin_notification_replay_confirmations where actor_user_id = ?",
                    Int::class.java,
                    fixture.actorId,
                ),
            )
            assertEquals(
                1,
                upgradeJdbc.queryForObject(
                    "select count(*) from admin_notification_replay_confirmation_targets where confirmation_id = ?",
                    Int::class.java,
                    fixture.notificationReceiptId,
                ),
            )
            assertEquals(
                1,
                upgradeJdbc.queryForObject(
                    "select count(*) from ai_generation_admin_command_receipts where club_id_snapshot = ?",
                    Int::class.java,
                    fixture.clubId,
                ),
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mysql adds revision domains participant audit and application snapshot identity`() {
        assertV52RevisionSchema(jdbcTemplate)
        assertV53IdempotencySchema(jdbcTemplate)
        assertV54PublicProjectionConvergenceSchema(jdbcTemplate)
        assertV56PublicConvergenceWorkRetentionIndex(jdbcTemplate)
        assertV57PlatformAdminCommandIdempotencySchema(jdbcTemplate)
        assertV58PlatformAdminClubCommandEvidenceSchema(jdbcTemplate)
        val fixture = V52LiveRevisionFixture()
        try {
            insertV52RevisionClubGraph(
                jdbcTemplate,
                fixture.clubId,
                "live-revision-${fixture.suffix}",
                hostUserId = fixture.hostUserId,
                hostMembershipId = fixture.hostMembershipId,
                memberUserId = fixture.memberUserId,
                memberMembershipId = fixture.memberMembershipId,
            )
            insertV52RevisionSession(
                jdbcTemplate,
                fixture.sessionId,
                fixture.clubId,
                number = 1,
                state = "DRAFT",
            )
            insertV52RevisionParticipant(jdbcTemplate, fixture)
            jdbcTemplate.update(
                """
                insert into session_publication_versions (session_id, publication_revision)
                values (?, 0)
                """.trimIndent(),
                fixture.sessionId,
            )
            jdbcTemplate.update(
                """
                insert into club_host_list_epochs (club_id, meeting_epoch, record_epoch)
                values (?, 0, 0)
                """.trimIndent(),
                fixture.clubId,
            )
            assertEquals(
                "0:0:0:0",
                jdbcTemplate.queryForObject(
                    """
                    select concat(session_revision, ':', exposure_revision, ':',
                                  participant_set_revision, ':', attendance_revision)
                    from sessions
                    join session_participants on session_participants.session_id = sessions.id
                    where sessions.id = ?
                    """.trimIndent(),
                    String::class.java,
                    fixture.sessionId,
                ),
            )
            assertEquals(
                0,
                jdbcTemplate.queryForObject(
                    "select count(*) from public_session_publications where session_id = ?",
                    Int::class.java,
                    fixture.sessionId,
                ),
            )
            assertRevisionConstraintsRejected(fixture)
            insertParticipantChangeAudit(jdbcTemplate, fixture, before = "REMOVED", after = "ACTIVE")
            jdbcTemplate.update("delete from session_participants where session_id = ?", fixture.sessionId)
            jdbcTemplate.update("delete from sessions where id = ?", fixture.sessionId)
            assertEquals(
                0,
                jdbcTemplate.queryForObject(
                    "select count(*) from session_publication_versions where session_id = ?",
                    Int::class.java,
                    fixture.sessionId,
                ),
            )
            assertEquals(
                1,
                jdbcTemplate.queryForObject(
                    """
                    select count(*)
                    from session_participant_change_audit
                    where id = ? and session_id = ? and club_id = ? and membership_id = ?
                    """.trimIndent(),
                    Int::class.java,
                    fixture.auditId,
                    fixture.sessionId,
                    fixture.clubId,
                    fixture.memberMembershipId,
                ),
            )
            val retainedAudit =
                jdbcTemplate.queryForMap(
                    """
                    select actor_membership_id, before_status, after_status, participant_set_revision
                    from session_participant_change_audit
                    where id = ?
                    """.trimIndent(),
                    fixture.auditId,
                )
            assertEquals(fixture.hostMembershipId, retainedAudit["ACTOR_MEMBERSHIP_ID"].toString())
            assertEquals("REMOVED", retainedAudit["BEFORE_STATUS"].toString())
            assertEquals("ACTIVE", retainedAudit["AFTER_STATUS"].toString())
            assertEquals(0L, (retainedAudit["PARTICIPANT_SET_REVISION"] as Number).toLong())
        } finally {
            jdbcTemplate.update("delete from session_participant_change_audit where id = ?", fixture.auditId)
            jdbcTemplate.update("delete from session_participants where session_id = ?", fixture.sessionId)
            jdbcTemplate.update("delete from session_publication_versions where session_id = ?", fixture.sessionId)
            jdbcTemplate.update("delete from sessions where id = ?", fixture.sessionId)
            jdbcTemplate.update("delete from club_host_list_epochs where club_id = ?", fixture.clubId)
            jdbcTemplate.update(
                "delete from memberships where id in (?, ?)",
                fixture.hostMembershipId,
                fixture.memberMembershipId,
            )
            jdbcTemplate.update("delete from users where id in (?, ?)", fixture.hostUserId, fixture.memberUserId)
            jdbcTemplate.update("delete from clubs where id = ?", fixture.clubId)
        }
    }

    private fun assertHostNotificationComposerSchema() {
        assertThat(columns("session_record_apply_receipts"))
            .contains(
                "apply_request_id",
                "expected_draft_revision",
                "expected_live_revision",
                "draft_sha256",
                "composer_event_type",
                "revision_id",
            )
        assertThat(columns("club_notification_policies"))
            .contains("club_id", "session_reminder_enabled", "updated_by_membership_id")
        assertThat(columns("notification_manual_dispatches"))
            .contains("content_revision")
        assertThat(columns("notification_manual_dispatch_previews"))
            .contains("target_snapshot_hash")
        assertEquals(
            "id,club_id,session_id",
            indexColumns("session_record_revisions", "session_record_revisions_scope_uk"),
        )
        assertEquals(
            "revision_id,club_id,session_id",
            foreignKeyColumns("session_record_apply_receipts", "session_record_apply_receipts_revision_scope_fk"),
        )
        assertEquals(
            "session_record_revisions:id,club_id,session_id",
            foreignKeyReference("session_record_apply_receipts", "session_record_apply_receipts_revision_scope_fk"),
        )
    }

    private fun columns(table: String): Set<String> =
        jdbcTemplate
            .queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database() and table_name = ?
                """.trimIndent(),
                String::class.java,
                table,
            ).filterNotNull()
            .toSet()

    @Test
    fun `mysql baseline creates auth session and feedback document tables`() {
        val tableCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database()
                  and table_name in ('users', 'auth_sessions', 'session_feedback_documents')
                """.trimIndent(),
                Int::class.java,
            )

        assertEquals(3, tableCount)
        assertKafkaNotificationTablesExist(jdbcTemplate)
        assertKafkaNotificationForeignKeys()
        assertEquals("NO", columnValue("users", "short_name", "is_nullable"))
        assertEquals("NO", columnValue("memberships", "short_name", "is_nullable"))
        assertEquals("NO", columnValue("invitations", "invited_name", "is_nullable"))
        assertEquals("longtext", columnValue("session_feedback_documents", "source_text", "data_type"))
        assertEquals("YES", columnValue("session_feedback_documents", "document_title", "is_nullable"))
        assertEquals(
            "club_id,state,visibility,number,session_date",
            indexColumns("sessions", "sessions_club_state_visibility_number_idx"),
        )
        assertEquals(
            "club_id,session_id,participation_status,membership_id",
            indexColumns("session_participants", "session_participants_club_session_status_member_idx"),
        )
        assertEquals(
            "club_id,session_id,created_at,priority",
            indexColumns("questions", "questions_club_session_created_idx"),
        )
        assertEquals(
            "club_id,visibility,created_at,session_id",
            indexColumns("one_line_reviews", "one_line_reviews_club_visibility_created_idx"),
        )
        assertEquals(
            "club_id,visibility,created_at,session_id",
            indexColumns("long_reviews", "long_reviews_club_visibility_created_idx"),
        )
        assertEquals(
            "club_id,session_id,created_at,sort_order",
            indexColumns("highlights", "highlights_club_session_created_idx"),
        )
        assertEquals(
            "club_id,session_id,version,created_at",
            indexColumns("session_feedback_documents", "session_feedback_documents_club_session_version_idx"),
        )
        assertEquals(
            "club_id,status,updated_at,created_at",
            indexColumns("notification_outbox", "notification_outbox_club_status_updated_idx"),
        )
        assertEquals(
            "club_id,status,next_attempt_at,created_at",
            indexColumns("notification_outbox", "notification_outbox_club_status_next_idx"),
        )
        assertEquals(1, uniqueIndexCount("auth_sessions", "session_token_hash"))
        assertEquals(1, uniqueIndexCount("memberships", "short_name"))
        assertEquals("invited_by_membership_id,club_id", foreignKeyColumns("invitations", "invitations_inviter_fk"))
        assertEquals("memberships:id,club_id", foreignKeyReference("invitations", "invitations_inviter_fk"))

        val membershipStatuses =
            jdbcTemplate.queryForList(
                """
                select constraint_name, check_clause
                from information_schema.check_constraints
                where constraint_schema = database()
                  and constraint_name = 'memberships_status_check'
                """.trimIndent(),
            )
        assertTrue(
            membershipStatuses.any { row ->
                row["CHECK_CLAUSE"].toString().contains("VIEWER") &&
                    !row["CHECK_CLAUSE"].toString().contains("PENDING_APPROVAL") &&
                    row["CHECK_CLAUSE"].toString().contains("SUSPENDED") &&
                    row["CHECK_CLAUSE"].toString().contains("LEFT")
            },
        )

        val participantColumns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'session_participants'
                  and column_name = 'participation_status'
                """.trimIndent(),
            )
        assertEquals(1, participantColumns.size)

        val checkinNoteColumns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'reading_checkins'
                  and column_name = 'note'
                """.trimIndent(),
            )
        assertEquals(0, checkinNoteColumns.size)

        val oneLineVisibilityConstraints =
            jdbcTemplate.queryForList(
                """
                select constraint_name, check_clause
                from information_schema.check_constraints
                where constraint_schema = database()
                  and constraint_name = 'one_line_reviews_visibility_check'
                """.trimIndent(),
            )
        assertTrue(
            oneLineVisibilityConstraints.any { row ->
                row["CHECK_CLAUSE"].toString().contains("SESSION") &&
                    row["CHECK_CLAUSE"].toString().contains("PUBLIC") &&
                    row["CHECK_CLAUSE"].toString().contains("PRIVATE")
            },
        )

        val sessionVisibilityColumns =
            jdbcTemplate.queryForList(
                """
                select column_name, column_default, is_nullable
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'sessions'
                  and column_name = 'visibility'
                """.trimIndent(),
            )
        assertEquals(1, sessionVisibilityColumns.size)
        assertEquals("NO", sessionVisibilityColumns.first()["IS_NULLABLE"])

        val sessionVisibilityConstraints =
            jdbcTemplate.queryForList(
                """
                select constraint_name, check_clause
                from information_schema.check_constraints
                where constraint_schema = database()
                  and constraint_name = 'sessions_visibility_check'
                """.trimIndent(),
            )
        assertTrue(
            sessionVisibilityConstraints.any { row ->
                val clause = row["CHECK_CLAUSE"].toString()
                clause.contains("HOST_ONLY") &&
                    clause.contains("MEMBER") &&
                    clause.contains("PUBLIC")
            },
        )

        val publishedPublicSeedCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                where sessions.state = 'PUBLISHED'
                  and public_session_publications.visibility = 'PUBLIC'
                """.trimIndent(),
                Int::class.java,
            )
        assertTrue(requireNotNull(publishedPublicSeedCount) > 0)

        val publicSeedSessionVisibilityMismatchCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                where sessions.state = 'PUBLISHED'
                  and public_session_publications.visibility = 'PUBLIC'
                  and sessions.visibility <> 'PUBLIC'
                """.trimIndent(),
                Int::class.java,
            )
        assertEquals(0, publicSeedSessionVisibilityMismatchCount)
    }

    @Test
    fun `mysql notification pipeline prevents cross club ledger rows`() {
        val suffix = UUID.randomUUID().toString().take(8)
        val firstClubId = UUID.randomUUID().toString()
        val secondClubId = UUID.randomUUID().toString()
        val firstUserId = UUID.randomUUID().toString()
        val secondUserId = UUID.randomUUID().toString()
        val firstMembershipId = UUID.randomUUID().toString()
        val secondMembershipId = UUID.randomUUID().toString()
        val firstEventId = UUID.randomUUID().toString()
        val secondEventId = UUID.randomUUID().toString()
        val firstDeliveryId = UUID.randomUUID().toString()
        val secondDeliveryId = UUID.randomUUID().toString()
        val crossClubDeliveryId = UUID.randomUUID().toString()
        val crossClubMemberNotificationId = UUID.randomUUID().toString()

        try {
            insertClub(firstClubId, "ledger-a-$suffix")
            insertClub(secondClubId, "ledger-b-$suffix")
            insertProfileUser(firstUserId, "ledger-a-$suffix@example.com", "Ledger A", "LedgerA$suffix")
            insertProfileUser(secondUserId, "ledger-b-$suffix@example.com", "Ledger B", "LedgerB$suffix")
            insertMembership(firstMembershipId, firstClubId, firstUserId, "LedgerA$suffix")
            insertMembership(secondMembershipId, secondClubId, secondUserId, "LedgerB$suffix")
            insertNotificationEventOutbox(firstEventId, firstClubId, "ledger-event-a-$suffix")
            insertNotificationEventOutbox(secondEventId, secondClubId, "ledger-event-b-$suffix")

            assertThrows(DataIntegrityViolationException::class.java) {
                insertNotificationDelivery(
                    id = crossClubDeliveryId,
                    eventId = firstEventId,
                    clubId = secondClubId,
                    recipientMembershipId = secondMembershipId,
                    dedupeKey = "ledger-cross-delivery-$suffix",
                )
            }

            insertNotificationDelivery(
                id = firstDeliveryId,
                eventId = firstEventId,
                clubId = firstClubId,
                recipientMembershipId = firstMembershipId,
                dedupeKey = "ledger-delivery-a-$suffix",
            )
            insertNotificationDelivery(
                id = secondDeliveryId,
                eventId = secondEventId,
                clubId = secondClubId,
                recipientMembershipId = secondMembershipId,
                dedupeKey = "ledger-delivery-b-$suffix",
            )

            assertThrows(DataIntegrityViolationException::class.java) {
                insertMemberNotification(
                    id = crossClubMemberNotificationId,
                    eventId = firstEventId,
                    deliveryId = secondDeliveryId,
                    clubId = secondClubId,
                    recipientMembershipId = secondMembershipId,
                )
            }
        } finally {
            deleteWhereIn("member_notifications", "id", setOf(crossClubMemberNotificationId))
            deleteWhereIn(
                "notification_deliveries",
                "id",
                setOf(firstDeliveryId, secondDeliveryId, crossClubDeliveryId),
            )
            deleteWhereIn("notification_event_outbox", "id", setOf(firstEventId, secondEventId))
            deleteWhereIn("memberships", "id", setOf(firstMembershipId, secondMembershipId))
            deleteWhereIn("users", "id", setOf(firstUserId, secondUserId))
            deleteWhereIn("clubs", "id", setOf(firstClubId, secondClubId))
        }
    }

    @Test
    fun `mysql enforces unique short names within a club for out of band profile writes`() {
        val suffix = UUID.randomUUID().toString().take(8)
        val clubId = UUID.randomUUID().toString()
        val firstUserId = UUID.randomUUID().toString()
        val secondUserId = UUID.randomUUID().toString()
        val firstMembershipId = UUID.randomUUID().toString()
        val secondMembershipId = UUID.randomUUID().toString()
        val firstShortName = "ClaimA$suffix"
        val secondShortName = "ClaimB$suffix"

        try {
            jdbcTemplate.update(
                """
                insert into clubs (id, slug, name, tagline, about)
                values (?, ?, '테스트 클럽', '테스트 클럽', '테스트 클럽입니다.')
                """.trimIndent(),
                clubId,
                "claim-$suffix",
            )
            insertProfileUser(firstUserId, "claim-a-$suffix@example.com", "Claim A", firstShortName)
            insertProfileUser(secondUserId, "claim-b-$suffix@example.com", "Claim B", secondShortName)
            insertMembership(firstMembershipId, clubId, firstUserId, firstShortName)
            insertMembership(secondMembershipId, clubId, secondUserId, secondShortName)

            assertThrows(DataIntegrityViolationException::class.java) {
                jdbcTemplate.update(
                    """
                    update memberships
                    set short_name = ?,
                        updated_at = utc_timestamp(6)
                    where id = ?
                    """.trimIndent(),
                    firstShortName,
                    secondMembershipId,
                )
            }
        } finally {
            deleteWhereIn("memberships", "id", setOf(firstMembershipId, secondMembershipId))
            deleteWhereIn("users", "id", setOf(firstUserId, secondUserId))
            deleteWhereIn("clubs", "id", setOf(clubId))
        }
    }

    @Test
    fun `mysql creates notification preference and test mail audit tables`() {
        val tableCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database()
                  and table_name in ('notification_preferences', 'notification_test_mail_audit')
                """.trimIndent(),
                Int::class.java,
            )

        assertEquals(2, tableCount)

        assertEquals("NO", columnValue("notification_preferences", "membership_id", "is_nullable"))
        assertEquals("NO", columnValue("notification_preferences", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("notification_preferences", "email_enabled", "is_nullable"))
        assertEquals("NO", columnValue("notification_preferences", "review_published_enabled", "is_nullable"))
        assertEquals(
            "membership_id,club_id",
            foreignKeyColumns("notification_preferences", "notification_preferences_membership_fk"),
        )
        assertEquals(
            "memberships:id,club_id",
            foreignKeyReference("notification_preferences", "notification_preferences_membership_fk"),
        )

        assertEquals("NO", columnValue("notification_test_mail_audit", "id", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "host_membership_id", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "recipient_masked_email", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "recipient_email_hash", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "status", "is_nullable"))
        assertEquals("YES", columnValue("notification_test_mail_audit", "last_error", "is_nullable"))
        assertEquals(
            "club_id,created_at",
            indexColumns("notification_test_mail_audit", "notification_test_mail_audit_club_created_idx"),
        )
        assertEquals(
            "host_membership_id,club_id,created_at",
            indexColumns("notification_test_mail_audit", "notification_test_mail_audit_host_created_idx"),
        )
        assertEquals(
            "recipient_email_hash,created_at",
            indexColumns("notification_test_mail_audit", "notification_test_mail_audit_recipient_hash_idx"),
        )
        assertEquals(
            "club_id",
            foreignKeyColumns("notification_test_mail_audit", "notification_test_mail_audit_club_fk"),
        )
        assertEquals(
            "clubs:id",
            foreignKeyReference("notification_test_mail_audit", "notification_test_mail_audit_club_fk"),
        )
        assertEquals(
            "host_membership_id,club_id",
            foreignKeyColumns("notification_test_mail_audit", "notification_test_mail_audit_host_membership_fk"),
        )
        assertEquals(
            "memberships:id,club_id",
            foreignKeyReference("notification_test_mail_audit", "notification_test_mail_audit_host_membership_fk"),
        )
        assertTrue(checkConstraintClause("notification_test_mail_audit_status_check").contains("SENT"))
        assertTrue(checkConstraintClause("notification_test_mail_audit_status_check").contains("FAILED"))
        assertTrue(checkConstraintClause("notification_test_mail_audit_mask_check").contains("trim"))
        val hashCheckClause = checkConstraintClause("notification_test_mail_audit_hash_check")
        assertTrue(hashCheckClause.contains("regexp_like"))
        assertTrue(hashCheckClause.contains("^[0-9a-f]{64}$"))

        val suffix = UUID.randomUUID().toString().take(8)
        val clubId = UUID.randomUUID().toString()
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val shortName = "Notify$suffix"

        try {
            jdbcTemplate.update(
                """
                insert into clubs (id, slug, name, tagline, about)
                values (?, ?, '테스트 클럽', '테스트 클럽', '테스트 클럽입니다.')
                """.trimIndent(),
                clubId,
                "notify-$suffix",
            )
            insertProfileUser(userId, "notify-$suffix@example.com", "Notify User", shortName)
            insertMembership(membershipId, clubId, userId, shortName)

            jdbcTemplate.update(
                """
                insert into notification_preferences (membership_id, club_id)
                values (?, ?)
                """.trimIndent(),
                membershipId,
                clubId,
            )

            val preferences =
                jdbcTemplate.queryForMap(
                    """
                    select email_enabled,
                           next_book_published_enabled,
                           session_reminder_due_enabled,
                           feedback_document_published_enabled,
                           review_published_enabled
                    from notification_preferences
                    where membership_id = ?
                      and club_id = ?
                    """.trimIndent(),
                    membershipId,
                    clubId,
                )

            assertEquals(true, preferences["email_enabled"])
            assertEquals(true, preferences["next_book_published_enabled"])
            assertEquals(true, preferences["session_reminder_due_enabled"])
            assertEquals(true, preferences["feedback_document_published_enabled"])
            assertEquals(false, preferences["review_published_enabled"])

            insertTestMailAudit(
                id = UUID.randomUUID().toString(),
                clubId = clubId,
                hostMembershipId = membershipId,
                recipientEmailHash = "a".repeat(64),
            )

            val uppercaseHashError =
                assertThrows(UncategorizedSQLException::class.java) {
                    insertTestMailAudit(
                        id = UUID.randomUUID().toString(),
                        clubId = clubId,
                        hostMembershipId = membershipId,
                        recipientEmailHash = "A".repeat(64),
                    )
                }
            assertTrue(uppercaseHashError.message.orEmpty().contains("notification_test_mail_audit_hash_check"))
        } finally {
            deleteWhereIn("notification_test_mail_audit", "host_membership_id", setOf(membershipId))
            deleteWhereIn("notification_preferences", "membership_id", setOf(membershipId))
            deleteWhereIn("memberships", "id", setOf(membershipId))
            deleteWhereIn("users", "id", setOf(userId))
            deleteWhereIn("clubs", "id", setOf(clubId))
        }
    }

    @Test
    fun `mysql creates ai generation audit and club defaults tables`() {
        val tableCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database()
                  and table_name in ('ai_generation_audit_log', 'ai_generation_club_defaults', 'ai_generation_commit_receipts')
                """.trimIndent(),
                Int::class.java,
            )

        assertEquals(3, tableCount)

        assertEquals("NO", columnValue("ai_generation_audit_log", "job_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "session_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "host_user_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "kind", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "item", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "provider", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "model", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "status", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "created_at", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "pipeline_version", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "input_turn_count", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "speaker_count", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "grounding_status", "is_nullable"))
        assertAiGenerationAttemptAuditColumns()

        assertEquals(
            "session_id,created_at",
            indexColumns("ai_generation_audit_log", "idx_aigen_audit_session"),
        )
        assertEquals(
            "club_id,created_at",
            indexColumns("ai_generation_audit_log", "idx_aigen_audit_club"),
        )
        assertEquals(
            "host_user_id,created_at",
            indexColumns("ai_generation_audit_log", "idx_aigen_audit_host"),
        )

        assertEquals("NO", columnValue("ai_generation_club_defaults", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_club_defaults", "default_model", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_club_defaults", "updated_at", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_club_defaults", "updated_by", "is_nullable"))
        assertEquals(
            "clubs:id",
            foreignKeyReference("ai_generation_club_defaults", "fk_aigen_default_club"),
        )
        assertEquals("NO", columnValue("ai_generation_commit_receipts", "job_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_commit_receipts", "revision", "is_nullable"))
        assertEquals(
            "job_id,revision",
            indexColumns("ai_generation_commit_receipts", "uk_aigen_commit_receipt_job_revision"),
        )
    }

    private fun assertAiGenerationAttemptAuditColumns() {
        assertAiGenerationAttemptAuditColumnSet()

        assertEquals("char", columnValue("ai_generation_audit_log", "trace_id", "data_type"))
        assertEquals("32", columnValue("ai_generation_audit_log", "trace_id", "character_maximum_length"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "trace_id", "is_nullable"))
        assertEquals("tinyint unsigned", columnValue("ai_generation_audit_log", "provider_attempt", "column_type"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "provider_attempt", "is_nullable"))
        assertEquals("varchar", columnValue("ai_generation_audit_log", "provider_call_mode", "data_type"))
        assertEquals("32", columnValue("ai_generation_audit_log", "provider_call_mode", "character_maximum_length"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "provider_call_mode", "is_nullable"))
        assertEquals("varchar", columnValue("ai_generation_audit_log", "cost_basis", "data_type"))
        assertEquals("32", columnValue("ai_generation_audit_log", "cost_basis", "character_maximum_length"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "cost_basis", "is_nullable"))
        assertEquals("NONE", columnValue("ai_generation_audit_log", "cost_basis", "column_default"))
        assertEquals("int", columnValue("ai_generation_audit_log", "cache_write_input_tokens", "data_type"))
        assertEquals("int", columnValue("ai_generation_audit_log", "cache_write_input_tokens", "column_type"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "cache_write_input_tokens", "is_nullable"))
        assertEquals("0", columnValue("ai_generation_audit_log", "cache_write_input_tokens", "column_default"))

        val traceIndexes =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.statistics
                where table_schema = database()
                  and table_name = 'ai_generation_audit_log'
                  and column_name = 'trace_id'
                """.trimIndent(),
                Int::class.java,
            )
        val traceForeignKeys =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.key_column_usage
                where table_schema = database()
                  and table_name = 'ai_generation_audit_log'
                  and column_name = 'trace_id'
                  and referenced_table_name is not null
                """.trimIndent(),
                Int::class.java,
            )
        assertEquals(0, traceIndexes)
        assertEquals(0, traceForeignKeys)
    }

    private fun assertAiGenerationAttemptAuditColumnSet() {
        val migrationSql =
            checkNotNull(javaClass.classLoader.getResourceAsStream(V38_AI_PROVIDER_ATTEMPT_AUDIT))
                .bufferedReader()
                .use { it.readText() }
        val migrationDeclaredColumns =
            ADD_COLUMN_NAME_REGEX
                .findAll(migrationSql)
                .map { it.groupValues[1] }
                .toList()
        assertThat(migrationDeclaredColumns).containsExactly(
            "trace_id",
            "provider_attempt",
            "provider_call_mode",
            "cost_basis",
            "cache_write_input_tokens",
        )

        val v38Columns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'ai_generation_audit_log'
                  and column_name in (
                    'trace_id',
                    'provider_attempt',
                    'provider_call_mode',
                    'cost_basis',
                    'cache_write_input_tokens'
                  )
                """.trimIndent(),
                String::class.java,
            )
        assertEquals(5, v38Columns.size)
        assertThat(v38Columns).containsExactlyInAnyOrder(
            "trace_id",
            "provider_attempt",
            "provider_call_mode",
            "cost_basis",
            "cache_write_input_tokens",
        )
    }

    @Test
    fun `fk to clubs id requires explicit COLLATE when schema default differs`() {
        // Reproduces the v1.10.0 prod incident: schema default collation drifted
        // away from the existing clubs.id column collation, so a new FK column
        // created without an explicit COLLATE clause inherited the (wrong)
        // schema default and Flyway failed with errno 3780.
        val clubsIdCollation =
            jdbcTemplate.queryForObject(
                """
                select collation_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'clubs'
                  and column_name = 'id'
                """.trimIndent(),
                String::class.java,
            ) ?: error("clubs.id collation must be present")
        val originalSchemaDefault =
            jdbcTemplate.queryForObject(
                """
                select default_collation_name
                from information_schema.schemata
                where schema_name = database()
                """.trimIndent(),
                String::class.java,
            ) ?: error("schema default collation must be present")
        val mismatchedDefault =
            if (clubsIdCollation == "utf8mb4_0900_ai_ci") {
                "utf8mb4_unicode_ci"
            } else {
                "utf8mb4_0900_ai_ci"
            }

        try {
            jdbcTemplate.execute(
                "alter database default character set utf8mb4 collate $mismatchedDefault",
            )

            // No explicit COLLATE: the new column inherits the (mismatched)
            // schema default, so FK creation must fail.
            assertThrows(Exception::class.java) {
                jdbcTemplate.execute(
                    """
                    create table tmp_fk_collation_bad (
                      club_id char(36) not null,
                      constraint fk_tmp_collation_bad foreign key (club_id) references clubs(id)
                    )
                    """.trimIndent(),
                )
            }

            // Explicit COLLATE matching clubs.id: FK creation must succeed even
            // with a mismatched schema default. This is the pattern V31/V32 use.
            jdbcTemplate.execute(
                """
                create table tmp_fk_collation_ok (
                  club_id char(36) character set utf8mb4 collate $clubsIdCollation not null,
                  constraint fk_tmp_collation_ok foreign key (club_id) references clubs(id)
                )
                """.trimIndent(),
            )
        } finally {
            // Cleanup is critical: container reuse (~/.testcontainers.properties)
            // shares state across runs, so leaked tables or a non-default schema
            // collation would poison subsequent test invocations.
            runCatching { jdbcTemplate.execute("drop table if exists tmp_fk_collation_bad") }
            runCatching { jdbcTemplate.execute("drop table if exists tmp_fk_collation_ok") }
            jdbcTemplate.execute(
                "alter database default character set utf8mb4 collate $originalSchemaDefault",
            )
        }
    }

    @Test
    fun `mysql creates multi club platform metadata tables`() {
        val tableCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database()
                  and table_name in (
                    'club_domains',
                    'platform_admins',
                    'club_audit_events',
                    'platform_audit_events',
                    'support_access_grants'
                  )
                """.trimIndent(),
                Int::class.java,
            )

        assertEquals(5, tableCount)
        assertEquals("NO", columnValue("clubs", "status", "is_nullable"))
        assertTrue(checkConstraintClause("clubs_status_check").contains("ACTIVE"))
        assertTrue(checkConstraintClause("clubs_status_check").contains("ARCHIVED"))
        assertEquals("NO", columnValue("clubs", "public_visibility", "is_nullable"))
        assertTrue(checkConstraintClause("clubs_public_visibility_check").contains("PRIVATE"))
        assertTrue(checkConstraintClause("clubs_public_visibility_check").contains("PUBLIC"))
        assertEquals("status,public_visibility", indexColumns("clubs", "clubs_status_public_visibility_idx"))
        assertEquals("YES", columnValue("invitations", "invited_by_membership_id", "is_nullable"))
        assertEquals("YES", columnValue("invitations", "invited_by_platform_admin_user_id", "is_nullable"))
        assertEquals(
            "invited_by_platform_admin_user_id",
            foreignKeyColumns("invitations", "invitations_platform_admin_inviter_fk"),
        )
        assertEquals("users:id", foreignKeyReference("invitations", "invitations_platform_admin_inviter_fk"))
        val invitationSourceCheck = checkConstraintClause("invitations_inviter_source_check")
        assertTrue(invitationSourceCheck.contains("invited_by_membership_id"))
        assertTrue(invitationSourceCheck.contains("invited_by_platform_admin_user_id"))

        assertEquals("NO", columnValue("club_domains", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("club_domains", "hostname", "is_nullable"))
        assertEquals("NO", columnValue("club_domains", "status", "is_nullable"))
        assertEquals("club_id,status,is_primary", indexColumns("club_domains", "club_domains_club_status_idx"))
        assertEquals(1, uniqueIndexCount("club_domains", "hostname"))
        assertEquals("club_id", foreignKeyColumns("club_domains", "club_domains_club_fk"))
        assertEquals("clubs:id", foreignKeyReference("club_domains", "club_domains_club_fk"))
        assertTrue(checkConstraintClause("club_domains_kind_check").contains("CUSTOM_DOMAIN"))
        assertTrue(checkConstraintClause("club_domains_status_check").contains("ACTION_REQUIRED"))

        assertEquals("NO", columnValue("platform_admins", "user_id", "is_nullable"))
        assertEquals("NO", columnValue("platform_admins", "role", "is_nullable"))
        assertEquals("NO", columnValue("platform_admins", "status", "is_nullable"))
        assertEquals("user_id", foreignKeyColumns("platform_admins", "platform_admins_user_fk"))
        assertEquals("users:id", foreignKeyReference("platform_admins", "platform_admins_user_fk"))
        assertTrue(checkConstraintClause("platform_admins_role_check").contains("OWNER"))
        assertTrue(checkConstraintClause("platform_admins_status_check").contains("DISABLED"))

        assertEquals("club_id,created_at", indexColumns("club_audit_events", "club_audit_events_club_created_idx"))
        assertEquals("actor_user_id,created_at", indexColumns("club_audit_events", "club_audit_events_actor_created_idx"))
        assertEquals("actor_user_id", foreignKeyColumns("club_audit_events", "club_audit_events_actor_fk"))
        assertEquals("club_id", foreignKeyColumns("club_audit_events", "club_audit_events_club_fk"))
        assertEquals("NO", columnValue("club_audit_events", "metadata_json", "is_nullable"))

        assertEquals(
            "actor_user_id,created_at",
            indexColumns("platform_audit_events", "platform_audit_events_actor_created_idx"),
        )
        assertEquals(
            "target_user_id,created_at",
            indexColumns("platform_audit_events", "platform_audit_events_target_created_idx"),
        )
        assertEquals("actor_user_id", foreignKeyColumns("platform_audit_events", "platform_audit_events_actor_fk"))
        assertEquals("target_user_id", foreignKeyColumns("platform_audit_events", "platform_audit_events_target_fk"))
        assertEquals("NO", columnValue("platform_audit_events", "metadata_json", "is_nullable"))

        assertEquals(
            "club_id,expires_at",
            indexColumns("support_access_grants", "support_access_grants_club_expires_idx"),
        )
        assertEquals(
            "grantee_user_id,expires_at",
            indexColumns("support_access_grants", "support_access_grants_grantee_expires_idx"),
        )
        assertEquals("club_id", foreignKeyColumns("support_access_grants", "support_access_grants_club_fk"))
        assertEquals(
            "granted_by_user_id",
            foreignKeyColumns("support_access_grants", "support_access_grants_granted_by_fk"),
        )
        assertEquals("grantee_user_id", foreignKeyColumns("support_access_grants", "support_access_grants_grantee_fk"))
        assertTrue(checkConstraintClause("support_access_grants_scope_check").contains("HOST_SUPPORT_READ"))
    }

    private fun insertClub(
        clubId: String,
        slug: String,
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, '테스트 클럽', '테스트 클럽', '테스트 클럽입니다.')
            """.trimIndent(),
            clubId,
            slug,
        )
    }

    private fun insertProfileUser(
        userId: String,
        email: String,
        name: String,
        shortName: String,
    ) {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, ?, ?, ?, ?, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-claim-$userId",
            email,
            name,
            shortName,
        )
    }

    private fun insertMembership(
        membershipId: String,
        clubId: String,
        userId: String,
        shortName: String,
    ) {
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), ?, 'mushroom-green-book')
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
            shortName,
        )
    }

    private fun insertNotificationEventOutbox(
        id: String,
        clubId: String,
        dedupeKey: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id,
              club_id,
              event_type,
              aggregate_type,
              aggregate_id,
              payload_json,
              kafka_key,
              dedupe_key
            )
            values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('eventId', ?), ?, ?)
            """.trimIndent(),
            id,
            clubId,
            id,
            id,
            clubId,
            dedupeKey,
        )
    }

    private fun insertNotificationDelivery(
        id: String,
        eventId: String,
        clubId: String,
        recipientMembershipId: String,
        dedupeKey: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id,
              event_id,
              club_id,
              recipient_membership_id,
              channel,
              dedupe_key
            )
            values (?, ?, ?, ?, 'IN_APP', ?)
            """.trimIndent(),
            id,
            eventId,
            clubId,
            recipientMembershipId,
            dedupeKey,
        )
    }

    private fun insertMemberNotification(
        id: String,
        eventId: String,
        deliveryId: String,
        clubId: String,
        recipientMembershipId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into member_notifications (
              id,
              event_id,
              delivery_id,
              club_id,
              recipient_membership_id,
              event_type,
              title,
              body,
              deep_link_path
            )
            values (?, ?, ?, ?, ?, 'SESSION_REMINDER_DUE', 'Reminder', 'Body', '/clubs/test')
            """.trimIndent(),
            id,
            eventId,
            deliveryId,
            clubId,
            recipientMembershipId,
        )
    }

    private fun insertTestMailAudit(
        id: String,
        clubId: String,
        hostMembershipId: String,
        recipientEmailHash: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_test_mail_audit (
              id,
              club_id,
              host_membership_id,
              recipient_masked_email,
              recipient_email_hash,
              status
            )
            values (?, ?, ?, 'n***@example.com', ?, 'SENT')
            """.trimIndent(),
            id,
            clubId,
            hostMembershipId,
            recipientEmailHash,
        )
    }

    private fun assertKafkaNotificationTablesExist(jdbcTemplate: JdbcTemplate) {
        val tables =
            jdbcTemplate
                .queryForList(
                    """
                    select table_name
                    from information_schema.tables
                    where table_schema = database()
                      and table_name in (
                        'notification_event_outbox',
                        'notification_deliveries',
                        'member_notifications'
                      )
                    """.trimIndent(),
                    String::class.java,
                ).toSet()

        assertThat(tables).containsExactlyInAnyOrder(
            "notification_event_outbox",
            "notification_deliveries",
            "member_notifications",
        )
    }

    private fun assertKafkaNotificationForeignKeys() {
        assertEquals(
            "id,club_id",
            indexColumns("notification_event_outbox", "notification_event_outbox_id_club_uk"),
        )
        assertEquals(
            "id,event_id,club_id,recipient_membership_id",
            indexColumns("notification_deliveries", "notification_deliveries_id_context_uk"),
        )
        assertEquals(
            "event_id,club_id",
            foreignKeyColumns("notification_deliveries", "notification_deliveries_event_club_fk"),
        )
        assertEquals(
            "notification_event_outbox:id,club_id",
            foreignKeyReference("notification_deliveries", "notification_deliveries_event_club_fk"),
        )
        assertEquals(
            "delivery_id,event_id,club_id,recipient_membership_id",
            foreignKeyColumns("member_notifications", "member_notifications_delivery_context_fk"),
        )
        assertEquals(
            "notification_deliveries:id,event_id,club_id,recipient_membership_id",
            foreignKeyReference("member_notifications", "member_notifications_delivery_context_fk"),
        )
        assertEquals(
            "recipient_membership_id,created_at",
            indexColumns("member_notifications", "member_notifications_recipient_created_idx"),
        )
    }

    private fun columnValue(
        tableName: String,
        columnName: String,
        metadataColumn: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select $metadataColumn
            from information_schema.columns
            where table_schema = database()
              and table_name = ?
              and column_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            columnName,
        ) ?: error("Column $tableName.$columnName does not exist")

    companion object {
        private const val AVATAR_FIXTURE_FIRST_CLUB_ID = "20000000-0000-0000-0000-000000000001"
        private const val V38_AI_PROVIDER_ATTEMPT_AUDIT =
            "db/mysql/migration/V38__ai_generation_provider_attempt_audit.sql"
        private const val V43_MEMBERSHIP_AVATARS =
            "db/mysql/migration/V43__membership_book_club_avatars.sql"
        private const val V44_ANIMAL_AVATARS =
            "db/mysql/migration/V44__animal_avatar_selection.sql"
        private const val V46_INTEGRATED_AVATARS =
            "db/mysql/migration/V46__integrated_member_profile_avatar_catalog.sql"
        private val ADD_COLUMN_NAME_REGEX = Regex("(?i)\\bADD\\s+COLUMN\\s+`?([a-z0-9_]+)`?")
        private val V43_AVATAR_KEY_REGEX = Regex("'([a-z0-9-]+)'")
        private const val LIFECYCLE_AUDIT_CLUB_ID = "aaaaaaaa-0000-4000-8000-000000049002"
        private const val LIFECYCLE_AUDIT_SESSION_ID = "aaaaaaaa-0000-4000-8000-000000049003"
        private const val LIFECYCLE_AUDIT_ACTOR_ID = "aaaaaaaa-0000-4000-8000-000000049004"
        private const val CHANGE_SNAPSHOT_CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val CHANGE_SNAPSHOT_SESSION_ID = "00000000-0000-0000-0000-000000000301"
        private const val CHANGE_SNAPSHOT_ACTOR_ID = "00000000-0000-0000-0000-000000000201"
        private const val V52_EMPTY_CLUB_ID = "aaaaaaaa-0000-4000-8000-000000052001"
        private const val V52_EMPTY_SESSION_ID = "aaaaaaaa-0000-4000-8000-000000052010"
        private const val V52_EMPTY_HOST_USER_ID = "aaaaaaaa-0000-4000-8000-000000052002"
        private const val V52_EMPTY_HOST_MEMBERSHIP_ID = "aaaaaaaa-0000-4000-8000-000000052003"
    }

    private fun assertLifecycleAuditSchema() {
        assertThat(columns("host_session_lifecycle_audit")).containsExactlyInAnyOrder(
            "id",
            "club_id",
            "session_id",
            "actor_membership_id",
            "action_type",
            "from_state",
            "to_state",
            "reason_code",
            "reason_note",
            "request_id",
            "created_at",
        )
        listOf("action_type", "from_state", "to_state", "reason_code").forEach { column ->
            assertEquals("ascii", columnValue("host_session_lifecycle_audit", column, "character_set_name"))
            assertEquals("ascii_bin", columnValue("host_session_lifecycle_audit", column, "collation_name"))
        }
        assertEquals("NO", columnValue("host_session_lifecycle_audit", "from_state", "is_nullable"))
        assertEquals("YES", columnValue("host_session_lifecycle_audit", "to_state", "is_nullable"))
        assertEquals("YES", columnValue("host_session_lifecycle_audit", "reason_code", "is_nullable"))
        assertEquals("NO", columnValue("host_session_lifecycle_audit", "request_id", "is_nullable"))
        assertEquals("6", columnValue("host_session_lifecycle_audit", "created_at", "datetime_precision"))
        assertEquals(
            "club_id,session_id,created_at,id",
            indexColumns("host_session_lifecycle_audit", "host_session_lifecycle_audit_history_idx"),
        )
        assertEquals(
            "club_id,actor_membership_id,created_at",
            indexColumns("host_session_lifecycle_audit", "host_session_lifecycle_audit_actor_idx"),
        )
        assertThat(checkConstraintClause("host_session_lifecycle_audit_contract_check"))
            .contains(
                "OPENED",
                "CLOSED",
                "PUBLISHED",
                "REOPENED",
                "UNPUBLISHED",
                "RETURNED_TO_DRAFT",
                "DELETED",
                "RESTORED",
            )
        assertThat(checkConstraintClause("host_session_lifecycle_audit_reason_check"))
            .contains(
                "ACCIDENTAL_TRANSITION",
                "MEETING_RESCHEDULED",
                "CONTENT_CORRECTION",
                "OPERATIONAL_RECOVERY",
                "OTHER_OPERATIONAL_REASON",
                "LEGACY_UNSPECIFIED",
                "EMPTY_SESSION_DELETED",
            )
    }

    private fun tableExists(tableName: String): Boolean =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from information_schema.tables
            where table_schema = database()
              and table_name = ?
            """.trimIndent(),
            Int::class.java,
            tableName,
        ) == 1

    private fun viewExists(viewName: String): Boolean =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from information_schema.views
            where table_schema = database()
              and table_name = ?
            """.trimIndent(),
            Int::class.java,
            viewName,
        ) == 1

    private fun viewDefinition(viewName: String): String =
        jdbcTemplate.queryForObject(
            """
            select view_definition
            from information_schema.views
            where table_schema = database()
              and table_name = ?
            """.trimIndent(),
            String::class.java,
            viewName,
        ) ?: error("View $viewName does not exist")

    private fun importedKeys(tableName: String): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select referenced_table_name
                from information_schema.referential_constraints
                where constraint_schema = database()
                  and table_name = ?
                """.trimIndent(),
                String::class.java,
                tableName,
            ).filterNotNull()

    private fun foreignKeyedColumns(tableName: String): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select column_name
                from information_schema.key_column_usage
                where table_schema = database()
                  and table_name = ?
                  and referenced_table_name is not null
                """.trimIndent(),
                String::class.java,
                tableName,
            ).filterNotNull()

    private fun insertLifecycleAudit(
        action: String,
        from: String,
        to: String?,
        reason: String?,
        id: String = UUID.randomUUID().toString(),
    ) {
        jdbcTemplate.update(
            """
            insert into host_session_lifecycle_audit (
              id, club_id, session_id, actor_membership_id, action_type,
              from_state, to_state, reason_code, reason_note, request_id
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            LIFECYCLE_AUDIT_CLUB_ID,
            LIFECYCLE_AUDIT_SESSION_ID,
            LIFECYCLE_AUDIT_ACTOR_ID,
            action,
            from,
            to,
            reason,
            null,
            "lifecycle-audit-test",
        )
    }

    private fun uniqueIndexCount(
        tableName: String,
        columnName: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from information_schema.statistics
            where table_schema = database()
              and table_name = ?
              and column_name = ?
              and non_unique = 0
            """.trimIndent(),
            Int::class.java,
            tableName,
            columnName,
        ) ?: 0

    private fun indexColumns(
        tableName: String,
        indexName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select group_concat(column_name order by seq_in_index separator ',')
            from information_schema.statistics
            where table_schema = database()
              and table_name = ?
              and index_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            indexName,
        ) ?: error("Index $tableName.$indexName does not exist")

    private fun foreignKeyColumns(
        tableName: String,
        constraintName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select group_concat(column_name order by ordinal_position separator ',')
            from information_schema.key_column_usage
            where constraint_schema = database()
              and table_name = ?
              and constraint_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            constraintName,
        ) ?: error("Foreign key $tableName.$constraintName does not exist")

    private fun foreignKeyReference(
        tableName: String,
        constraintName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select concat(referenced_table_name, ':', group_concat(referenced_column_name order by ordinal_position separator ','))
            from information_schema.key_column_usage
            where constraint_schema = database()
              and table_name = ?
              and constraint_name = ?
            group by referenced_table_name
            """.trimIndent(),
            String::class.java,
            tableName,
            constraintName,
        ) ?: error("Foreign key $tableName.$constraintName does not exist")

    private fun checkConstraintClause(constraintName: String): String =
        jdbcTemplate.queryForObject(
            """
            select check_clause
            from information_schema.check_constraints
            where constraint_schema = database()
              and constraint_name = ?
            """.trimIndent(),
            String::class.java,
            constraintName,
        ) ?: error("Check constraint $constraintName does not exist")

    private fun indexColumns(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
        indexName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select group_concat(column_name order by seq_in_index separator ',')
            from information_schema.statistics
            where table_schema = database()
              and table_name = ?
              and index_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            indexName,
        ) ?: error("Index $tableName.$indexName does not exist")

    private fun foreignKeyColumns(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
        constraintName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select group_concat(column_name order by ordinal_position separator ',')
            from information_schema.key_column_usage
            where constraint_schema = database()
              and table_name = ?
              and constraint_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            constraintName,
        ) ?: error("Foreign key $tableName.$constraintName does not exist")

    private fun checkConstraintClause(
        jdbcTemplate: JdbcTemplate,
        constraintName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select check_clause
            from information_schema.check_constraints
            where constraint_schema = database()
              and constraint_name = ?
            """.trimIndent(),
            String::class.java,
            constraintName,
        ) ?: error("Check constraint $constraintName does not exist")

    private fun columns(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
    ): Set<String> =
        jdbcTemplate
            .queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database() and table_name = ?
                """.trimIndent(),
                String::class.java,
                tableName,
            ).filterNotNull()
            .toSet()

    private fun columnMetadata(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
        columnName: String,
    ): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select data_type, is_nullable, column_default, character_set_name, collation_name,
                   datetime_precision, character_maximum_length
            from information_schema.columns
            where table_schema = database() and table_name = ? and column_name = ?
            """.trimIndent(),
            tableName,
            columnName,
        )

    private fun indexNonUnique(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
        indexName: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select max(non_unique)
            from information_schema.statistics
            where table_schema = database() and table_name = ? and index_name = ?
            """.trimIndent(),
            Int::class.java,
            tableName,
            indexName,
        ) ?: error("Index $tableName.$indexName does not exist")

    private fun foreignKeyReference(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
        constraintName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select concat(referenced_table_name, ':', group_concat(referenced_column_name order by ordinal_position separator ','))
            from information_schema.key_column_usage
            where constraint_schema = database()
              and table_name = ?
              and constraint_name = ?
            group by referenced_table_name
            """.trimIndent(),
            String::class.java,
            tableName,
            constraintName,
        ) ?: error("Foreign key $tableName.$constraintName does not exist")

    private fun foreignKeyDeleteRule(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
        constraintName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select delete_rule
            from information_schema.referential_constraints
            where constraint_schema = database()
              and table_name = ?
              and constraint_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            constraintName,
        ) ?: error("Foreign key $tableName.$constraintName does not exist")

    @Suppress("LongMethod")
    private fun assertV52RevisionSchema(jdbcTemplate: JdbcTemplate) {
        assertThat(columns(jdbcTemplate, "sessions")).contains(
            "session_revision",
            "exposure_revision",
            "participant_set_revision",
        )
        assertThat(columns(jdbcTemplate, "active_sessions")).contains(
            "session_revision",
            "exposure_revision",
            "participant_set_revision",
        )
        assertThat(columns(jdbcTemplate, "sessions")).doesNotContain(
            "record_draft_revision",
            "live_record_revision",
            "publication_revision",
            "snapshot_id",
        )
        assertThat(columns(jdbcTemplate, "session_participants")).contains("attendance_revision")
        assertThat(columns(jdbcTemplate, "session_publication_versions")).containsExactlyInAnyOrder(
            "session_id",
            "publication_revision",
        )
        assertThat(columns(jdbcTemplate, "club_host_list_epochs")).containsExactlyInAnyOrder(
            "club_id",
            "meeting_epoch",
            "record_epoch",
        )
        assertThat(columns(jdbcTemplate, "session_participant_change_audit")).containsExactlyInAnyOrder(
            "id",
            "actor_membership_id",
            "club_id",
            "session_id",
            "membership_id",
            "before_status",
            "after_status",
            "participant_set_revision",
            "created_at",
        )
        listOf(
            Triple("sessions", "session_revision", "0"),
            Triple("sessions", "exposure_revision", "0"),
            Triple("sessions", "participant_set_revision", "0"),
            Triple("session_participants", "attendance_revision", "0"),
            Triple("session_publication_versions", "publication_revision", "0"),
            Triple("club_host_list_epochs", "meeting_epoch", "0"),
            Triple("club_host_list_epochs", "record_epoch", "0"),
        ).forEach { (table, column, defaultValue) ->
            val metadata = columnMetadata(jdbcTemplate, table, column)
            assertThat(metadata["IS_NULLABLE"]).isEqualTo("NO")
            assertThat(metadata["DATA_TYPE"].toString()).isEqualTo("bigint")
            assertThat(metadata["COLUMN_DEFAULT"].toString()).isEqualTo(defaultValue)
        }
        listOf(
            "session_publication_versions" to "session_id",
            "club_host_list_epochs" to "club_id",
            "session_participant_change_audit" to "id",
            "session_participant_change_audit" to "actor_membership_id",
            "session_participant_change_audit" to "club_id",
            "session_participant_change_audit" to "session_id",
            "session_participant_change_audit" to "membership_id",
        ).forEach { (table, column) ->
            val metadata = columnMetadata(jdbcTemplate, table, column)
            assertThat(metadata["DATA_TYPE"]).isEqualTo("char")
            assertThat(metadata["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("36")
        }
        assertThat(checkConstraintClause(jdbcTemplate, "sessions_session_revision_check")).contains(">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "sessions_exposure_revision_check")).contains(">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "sessions_participant_set_revision_check")).contains(">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "session_participants_attendance_revision_check"))
            .contains(">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "session_publication_versions_revision_check"))
            .contains(">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "club_host_list_epochs_meeting_epoch_check"))
            .contains(">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "club_host_list_epochs_record_epoch_check"))
            .contains(">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "session_participant_change_audit_status_check"))
            .contains("ACTIVE", "REMOVED")
        assertThat(checkConstraintClause(jdbcTemplate, "session_participant_change_audit_revision_check"))
            .contains(">= 0")
        assertEquals("session_id", indexColumns(jdbcTemplate, "session_publication_versions", "PRIMARY"))
        assertEquals("club_id", indexColumns(jdbcTemplate, "club_host_list_epochs", "PRIMARY"))
        assertThat(indexNonUnique(jdbcTemplate, "session_publication_versions", "PRIMARY")).isZero()
        assertThat(indexNonUnique(jdbcTemplate, "club_host_list_epochs", "PRIMARY")).isZero()
        assertEquals(
            "CASCADE",
            foreignKeyDeleteRule(
                jdbcTemplate,
                "session_publication_versions",
                "session_publication_versions_session_fk",
            ),
        )
        assertEquals(
            "sessions:id",
            foreignKeyReference(
                jdbcTemplate,
                "session_publication_versions",
                "session_publication_versions_session_fk",
            ),
        )
        assertThat(importedKeys(jdbcTemplate, "session_participant_change_audit")).isEmpty()
        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.columns
                where table_schema = database()
                  and table_name in (
                    'sessions',
                    'session_participants',
                    'session_publication_versions',
                    'club_host_list_epochs',
                    'session_participant_change_audit'
                  )
                  and column_name in ('snapshot_id', 'projection_snapshot_id')
                """.trimIndent(),
                Int::class.java,
            ),
        )
    }

    @Suppress("LongMethod")
    private fun assertV53IdempotencySchema(jdbcTemplate: JdbcTemplate) {
        assertThat(columns(jdbcTemplate, "mutation_idempotency_keys")).containsExactlyInAnyOrder(
            "club_id",
            "actor_membership_id",
            "operation",
            "resource_slot",
            "idempotency_key",
            "canonical_schema_version",
            "digest_key_version",
            "request_hmac",
            "status",
            "receipt_id",
            "created_at",
            "updated_at",
            "expires_at",
        )
        assertThat(columns(jdbcTemplate, "mutation_digest_key_state")).containsExactlyInAnyOrder(
            "digest_key_version",
            "last_referenced_at",
            "unreferenced_since",
        )
        assertThat(columns(jdbcTemplate, "host_session_mutation_receipts")).containsExactlyInAnyOrder(
            "id",
            "club_id",
            "actor_membership_id",
            "operation",
            "resource_id",
            "session_revision",
            "exposure_revision",
            "participant_set_revision",
            "record_draft_revision",
            "live_record_revision",
            "publication_revision",
            "notification_decision",
            "dispatch_receipt_id",
            "created_at",
        )
        val hmac = columnMetadata(jdbcTemplate, "mutation_idempotency_keys", "request_hmac")
        assertThat(hmac["DATA_TYPE"].toString()).isEqualTo("binary")
        assertThat(hmac["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("32")
        assertThat(hmac["IS_NULLABLE"]).isEqualTo("NO")
        assertEquals(
            "club_id,actor_membership_id,operation,resource_slot,idempotency_key",
            indexColumns(jdbcTemplate, "mutation_idempotency_keys", "PRIMARY"),
        )
        assertThat(indexNonUnique(jdbcTemplate, "mutation_idempotency_keys", "PRIMARY")).isZero()
        assertThat(importedKeys(jdbcTemplate, "mutation_idempotency_keys")).isEmpty()
        assertThat(importedKeys(jdbcTemplate, "mutation_digest_key_state")).isEmpty()
        assertThat(importedKeys(jdbcTemplate, "host_session_mutation_receipts")).isEmpty()
        assertThat(columns(jdbcTemplate, "mutation_idempotency_keys"))
            .doesNotContain("meeting_url", "meeting_passcode", "canonical_payload", "request_sha256")
        assertThat(columns(jdbcTemplate, "host_session_mutation_receipts"))
            .doesNotContain("meeting_url", "meeting_passcode", "canonical_payload", "request_sha256")
        assertThat(checkConstraintClause(jdbcTemplate, "mutation_idempotency_keys_status_check"))
            .contains("IN_PROGRESS", "COMPLETED")
        assertThat(checkConstraintClause(jdbcTemplate, "host_session_mutation_receipts_decision_check"))
            .contains("NOT_SENT", "DISPATCH_REFERENCED")
    }

    @Suppress("LongMethod")
    private fun assertV54PublicProjectionConvergenceSchema(jdbcTemplate: JdbcTemplate) {
        assertThat(columns(jdbcTemplate, "public_projection_generations")).contains(
            "publication_id",
            "club_id",
            "session_id",
            "generation",
            "live_record_revision",
            "origin_readable",
            "updated_at",
        )
        assertThat(columns(jdbcTemplate, "public_mutation_convergence_receipts")).containsExactlyInAnyOrder(
            "mutation_receipt_id",
            "convergence_id",
            "publication_id_snapshot",
            "session_id_snapshot",
            "committed_generation",
            "origin_readable",
            "created_at",
        )
        assertThat(columns(jdbcTemplate, "public_convergence_work")).containsExactlyInAnyOrder(
            "convergence_id",
            "next_attempt_no",
            "lease_owner",
            "lease_expires_at",
            "available_at",
            "created_at",
            "updated_at",
        )
        assertThat(columns(jdbcTemplate, "public_convergence_events")).containsExactlyInAnyOrder(
            "convergence_id",
            "publication_id_snapshot",
            "session_id_snapshot",
            "attempt_no",
            "event_seq",
            "status",
            "observed_at",
            "result_category",
        )
        assertThat(importedKeys(jdbcTemplate, "public_mutation_convergence_receipts")).isEmpty()
        assertThat(importedKeys(jdbcTemplate, "public_convergence_events")).isEmpty()
        assertThat(columns(jdbcTemplate, "public_mutation_convergence_receipts"))
            .doesNotContain("provider_response", "provider_error", "private_body", "reason")
        assertThat(columns(jdbcTemplate, "public_convergence_events"))
            .doesNotContain("provider_response", "provider_error", "private_body", "reason")
        assertThat(checkConstraintClause(jdbcTemplate, "public_convergence_events_status_check"))
            .contains("PENDING", "SUCCEEDED", "FAILED")
    }

    private fun assertV56PublicConvergenceWorkRetentionIndex(jdbcTemplate: JdbcTemplate) {
        assertEquals(
            "created_at,convergence_id,lease_expires_at",
            indexColumns(jdbcTemplate, "public_convergence_work", "public_convergence_work_retention_idx"),
        )
    }

    @Suppress("LongMethod")
    private fun assertV57PlatformAdminCommandIdempotencySchema(jdbcTemplate: JdbcTemplate) {
        val claimTable = "platform_admin_command_idempotency"
        val aliasTable = "platform_admin_command_idempotency_keys"
        val keyStateTable = "platform_admin_command_digest_key_state"
        assertThat(columns(jdbcTemplate, claimTable)).containsExactlyInAnyOrder(
            "id",
            "platform_admin_user_id",
            "command_type",
            "target_type",
            "target_id",
            "canonical_schema_version",
            "state",
            "claim_token",
            "receipt_type",
            "receipt_id",
            "created_at",
            "updated_at",
            "expires_at",
        )
        assertThat(columns(jdbcTemplate, aliasTable)).containsExactlyInAnyOrder(
            "claim_id",
            "platform_admin_user_id",
            "command_type",
            "target_type",
            "target_id",
            "digest_key_version",
            "idempotency_key_hmac",
            "request_hmac",
            "created_at",
        )
        assertThat(columns(jdbcTemplate, keyStateTable)).containsExactlyInAnyOrder(
            "digest_key_version",
            "last_referenced_at",
            "unreferenced_since",
        )

        listOf(
            claimTable to "id",
            claimTable to "platform_admin_user_id",
            claimTable to "claim_token",
            aliasTable to "claim_id",
            aliasTable to "platform_admin_user_id",
        ).forEach { (table, column) ->
            val metadata = columnMetadata(jdbcTemplate, table, column)
            assertThat(metadata["DATA_TYPE"]).isEqualTo("char")
            assertThat(metadata["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("36")
            assertThat(metadata["CHARACTER_SET_NAME"]).isEqualTo("ascii")
            assertThat(metadata["COLLATION_NAME"]).isEqualTo("ascii_bin")
        }
        listOf(
            claimTable to "command_type",
            claimTable to "target_type",
            claimTable to "target_id",
            claimTable to "canonical_schema_version",
            claimTable to "state",
            claimTable to "receipt_type",
            claimTable to "receipt_id",
            aliasTable to "command_type",
            aliasTable to "target_type",
            aliasTable to "target_id",
        ).forEach { (table, column) ->
            val metadata = columnMetadata(jdbcTemplate, table, column)
            assertThat(metadata["CHARACTER_SET_NAME"]).isEqualTo("ascii")
            assertThat(metadata["COLLATION_NAME"]).isEqualTo("ascii_bin")
        }
        assertThat(columnMetadata(jdbcTemplate, claimTable, "receipt_type")["CHARACTER_MAXIMUM_LENGTH"].toString())
            .isEqualTo("96")
        assertThat(columnMetadata(jdbcTemplate, claimTable, "receipt_id")["CHARACTER_MAXIMUM_LENGTH"].toString())
            .isEqualTo("128")
        assertThat(
            columnMetadata(jdbcTemplate, claimTable, "canonical_schema_version")["CHARACTER_MAXIMUM_LENGTH"].toString(),
        ).isEqualTo("64")
        listOf("idempotency_key_hmac", "request_hmac").forEach { column ->
            val metadata = columnMetadata(jdbcTemplate, aliasTable, column)
            assertThat(metadata["DATA_TYPE"]).isEqualTo("varbinary")
            assertThat(metadata["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("32")
            assertThat(metadata["IS_NULLABLE"]).isEqualTo("NO")
        }
        listOf(
            claimTable to "created_at",
            claimTable to "updated_at",
            claimTable to "expires_at",
            aliasTable to "created_at",
            keyStateTable to "last_referenced_at",
            keyStateTable to "unreferenced_since",
        ).forEach { (table, column) ->
            assertThat(columnMetadata(jdbcTemplate, table, column)["DATETIME_PRECISION"]).isEqualTo(6L)
        }

        assertEquals("id", indexColumns(jdbcTemplate, claimTable, "PRIMARY"))
        assertEquals(
            "id,platform_admin_user_id,command_type,target_type,target_id",
            indexColumns(jdbcTemplate, claimTable, "platform_admin_command_scope_uk"),
        )
        assertThat(indexNonUnique(jdbcTemplate, claimTable, "platform_admin_command_scope_uk")).isZero()
        assertEquals(
            "state,expires_at,id",
            indexColumns(jdbcTemplate, claimTable, "platform_admin_command_expiry_idx"),
        )
        assertEquals(
            "platform_admin_user_id,command_type,target_type,target_id,digest_key_version,idempotency_key_hmac",
            indexColumns(jdbcTemplate, aliasTable, "platform_admin_command_alias_identity_uk"),
        )
        assertThat(indexNonUnique(jdbcTemplate, aliasTable, "platform_admin_command_alias_identity_uk")).isZero()
        assertEquals(
            "claim_id,digest_key_version",
            indexColumns(jdbcTemplate, aliasTable, "platform_admin_command_alias_claim_version_uk"),
        )
        assertThat(indexNonUnique(jdbcTemplate, aliasTable, "platform_admin_command_alias_claim_version_uk"))
            .isZero()

        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_command_schema_version_check"))
            .contains("char_length", "canonical_schema_version", "1", "64")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_command_state_check"))
            .contains("IN_PROGRESS", "COMPLETED")
            .doesNotContain("FAILED")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_command_receipt_check"))
            .contains("IN_PROGRESS", "COMPLETED", "receipt_type", "receipt_id")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_command_expiry_check"))
            .contains("expires_at", "created_at")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_command_alias_version_check"))
            .contains(">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_command_alias_hmac_check"))
            .contains("idempotency_key_hmac", "request_hmac", "32")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_command_digest_key_version_check"))
            .contains(">= 0")

        assertThat(importedKeys(jdbcTemplate, claimTable)).isEmpty()
        assertThat(importedKeys(jdbcTemplate, keyStateTable)).isEmpty()
        assertThat(importedKeys(jdbcTemplate, aliasTable)).containsExactly(claimTable)
        assertEquals(
            "claim_id,platform_admin_user_id,command_type,target_type,target_id",
            foreignKeyColumns(jdbcTemplate, aliasTable, "platform_admin_command_alias_claim_fk"),
        )
        assertEquals(
            "$claimTable:id,platform_admin_user_id,command_type,target_type,target_id",
            foreignKeyReference(jdbcTemplate, aliasTable, "platform_admin_command_alias_claim_fk"),
        )
        assertEquals(
            "CASCADE",
            foreignKeyDeleteRule(jdbcTemplate, aliasTable, "platform_admin_command_alias_claim_fk"),
        )
        assertThat(columns(jdbcTemplate, claimTable)).doesNotContain(
            "reason",
            "email",
            "name",
            "url",
            "request_json",
            "canonical_input",
            "idempotency_key",
            "terminal_error_code",
            "lease_expires_at",
        )
        assertThat(columns(jdbcTemplate, aliasTable)).doesNotContain(
            "reason",
            "email",
            "name",
            "url",
            "request_json",
            "canonical_input",
            "idempotency_key",
        )
    }

    private fun insertV57CommandClaim(
        jdbcTemplate: JdbcTemplate,
        id: String,
        actorId: String,
        targetId: String,
        claimToken: String?,
        state: String = "IN_PROGRESS",
        receiptType: String? = null,
        receiptId: String? = null,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency (
              id, platform_admin_user_id, command_type, target_type, target_id,
              canonical_schema_version, state, claim_token, receipt_type, receipt_id,
              created_at, updated_at, expires_at
            ) values (?, ?, 'CLUB_ARCHIVE', 'CLUB', ?, 'club-archive:v1', ?, ?, ?, ?,
                      '2026-08-24 00:00:00.000000', '2026-08-24 00:00:00.000000',
                      '2026-08-26 00:00:00.000000')
            """.trimIndent(),
            id,
            actorId,
            targetId,
            state,
            claimToken,
            receiptType,
            receiptId,
        )
    }

    private fun insertV57CommandAlias(
        jdbcTemplate: JdbcTemplate,
        claimId: String,
        actorId: String,
        targetId: String,
        digestKeyVersion: Int,
        idempotencyKeyHmac: ByteArray,
        requestHmac: ByteArray,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency_keys (
              claim_id, platform_admin_user_id, command_type, target_type, target_id,
              digest_key_version, idempotency_key_hmac, request_hmac, created_at
            ) values (?, ?, 'CLUB_ARCHIVE', 'CLUB', ?, ?, ?, ?, '2026-08-24 00:00:00.000000')
            """.trimIndent(),
            claimId,
            actorId,
            targetId,
            digestKeyVersion,
            idempotencyKeyHmac,
            requestHmac,
        )
    }

    @Suppress("LongMethod")
    private fun assertV59PlatformAdminServiceCommandEvidenceSchema(jdbcTemplate: JdbcTemplate) {
        val notificationReceiptTable = "admin_notification_replay_confirmations"
        val notificationTargetTable = "admin_notification_replay_confirmation_targets"
        val aiPreviewTable = "ai_generation_admin_command_previews"
        val aiReceiptTable = "ai_generation_admin_command_receipts"
        val convergenceTable = "admin_service_command_convergence"
        val eventTable = "admin_service_command_convergence_events"

        assertThat(columns(jdbcTemplate, aiPreviewTable)).containsExactlyInAnyOrder(
            "id",
            "action",
            "actor_user_id_snapshot",
            "actor_platform_role_snapshot",
            "actor_capabilities_json",
            "job_id_snapshot",
            "club_id_snapshot",
            "job_status_snapshot",
            "job_revision_snapshot",
            "canonical_schema_version",
            "digest_key_version",
            "request_hmac",
            "sanitized_impact_json",
            "expires_at",
            "consumed_at",
            "consumed_receipt_id_snapshot",
            "created_at",
        )
        assertThat(columns(jdbcTemplate, notificationTargetTable)).containsExactlyInAnyOrder(
            "confirmation_id",
            "delivery_id_snapshot",
        )
        assertThat(columns(jdbcTemplate, aiReceiptTable)).containsExactlyInAnyOrder(
            "id",
            "preview_id_snapshot",
            "action",
            "effect_type_snapshot",
            "actor_user_id_snapshot",
            "actor_platform_role_snapshot",
            "actor_capabilities_json",
            "job_id_snapshot",
            "club_id_snapshot",
            "before_job_status_snapshot",
            "before_job_revision_snapshot",
            "after_job_status_snapshot",
            "after_job_revision_snapshot",
            "origin_outcome",
            "canonical_schema_version",
            "digest_key_version",
            "request_hmac",
            "safe_reason_code",
            "safe_result_json",
            "platform_audit_event_id_snapshot",
            "origin_at",
        )
        assertThat(columns(jdbcTemplate, convergenceTable)).containsExactlyInAnyOrder(
            "id",
            "notification_receipt_id_snapshot",
            "ai_receipt_id_snapshot",
            "effect_type",
            "effect_target_id_snapshot",
            "state",
            "attempt_count",
            "next_attempt_no",
            "lease_owner",
            "lease_expires_at",
            "last_safe_error_code",
            "available_at",
            "created_at",
            "updated_at",
        )
        assertThat(columns(jdbcTemplate, eventTable)).containsExactlyInAnyOrder(
            "convergence_id",
            "notification_receipt_id_snapshot",
            "ai_receipt_id_snapshot",
            "effect_type",
            "effect_target_id_snapshot",
            "attempt_no",
            "event_seq",
            "start_event_seq",
            "state",
            "safe_error_code",
            "observed_at",
        )

        listOf(
            notificationReceiptTable to "id",
            notificationReceiptTable to "target_id_snapshot",
            notificationTargetTable to "confirmation_id",
            notificationTargetTable to "delivery_id_snapshot",
            aiPreviewTable to "id",
            aiPreviewTable to "job_id_snapshot",
            aiReceiptTable to "id",
            aiReceiptTable to "job_id_snapshot",
            convergenceTable to "id",
            convergenceTable to "notification_receipt_id_snapshot",
            convergenceTable to "ai_receipt_id_snapshot",
            convergenceTable to "effect_target_id_snapshot",
            eventTable to "convergence_id",
            eventTable to "notification_receipt_id_snapshot",
            eventTable to "ai_receipt_id_snapshot",
            eventTable to "effect_target_id_snapshot",
        ).forEach { (table, column) ->
            val metadata = columnMetadata(jdbcTemplate, table, column)
            assertThat(metadata["DATA_TYPE"]).isEqualTo("char")
            assertThat(metadata["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("36")
            assertThat(metadata["CHARACTER_SET_NAME"]).isEqualTo("ascii")
            assertThat(metadata["COLLATION_NAME"]).isEqualTo("ascii_bin")
        }
        listOf(
            notificationReceiptTable to "request_hmac",
            aiPreviewTable to "request_hmac",
            aiReceiptTable to "request_hmac",
        ).forEach { (table, column) ->
            val metadata = columnMetadata(jdbcTemplate, table, column)
            assertThat(metadata["DATA_TYPE"]).isEqualTo("varbinary")
            assertThat(metadata["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("32")
        }

        assertEquals(
            "platform_audit_event_id",
            indexColumns(jdbcTemplate, notificationReceiptTable, "admin_notification_confirmations_audit_uk"),
        )
        assertThat(
            indexNonUnique(jdbcTemplate, notificationReceiptTable, "admin_notification_confirmations_audit_uk"),
        ).isZero()
        assertEquals(
            "platform_audit_event_id_snapshot",
            indexColumns(jdbcTemplate, aiReceiptTable, "ai_generation_admin_receipts_audit_uk"),
        )
        assertThat(indexNonUnique(jdbcTemplate, aiReceiptTable, "ai_generation_admin_receipts_audit_uk")).isZero()
        assertEquals(
            "id,notification_receipt_id_snapshot,effect_type,effect_target_id_snapshot",
            indexColumns(jdbcTemplate, convergenceTable, "admin_service_convergence_notification_identity_uk"),
        )
        assertEquals(
            "id,ai_receipt_id_snapshot,effect_type,effect_target_id_snapshot",
            indexColumns(jdbcTemplate, convergenceTable, "admin_service_convergence_ai_identity_uk"),
        )
        assertEquals(
            "notification_receipt_id_snapshot,effect_type,effect_target_id_snapshot",
            indexColumns(jdbcTemplate, convergenceTable, "admin_service_convergence_notification_effect_uk"),
        )
        assertEquals(
            "ai_receipt_id_snapshot,effect_type,effect_target_id_snapshot",
            indexColumns(jdbcTemplate, convergenceTable, "admin_service_convergence_ai_effect_uk"),
        )
        assertEquals(
            "convergence_id,attempt_no,event_seq",
            indexColumns(jdbcTemplate, eventTable, "PRIMARY"),
        )

        assertThat(checkConstraintClause(jdbcTemplate, "admin_notification_confirmations_identity_check"))
            .contains("LEGACY_SELECTION_SHA", "HMAC", "selection_hash", "canonical_schema_version", "request_hmac")
        assertThat(checkConstraintClause(jdbcTemplate, "admin_notification_confirmations_json_check"))
            .contains("actor_capabilities_json", "skipped_reason_counts_json", "4096", "8192")
        assertThat(checkConstraintClause(jdbcTemplate, "ai_generation_admin_previews_json_check"))
            .contains("actor_capabilities_json", "sanitized_impact_json", "4096", "8192")
        assertThat(checkConstraintClause(jdbcTemplate, "ai_generation_admin_receipts_json_check"))
            .contains("actor_capabilities_json", "safe_result_json", "4096", "8192")
        assertThat(checkConstraintClause(jdbcTemplate, "admin_service_convergence_parent_check"))
            .contains("notification_receipt_id_snapshot", "ai_receipt_id_snapshot", "NOTIFICATION_REPLAY")
            .contains("AI_JOB_CANCEL", "AI_COMMIT_RETRY", "effect_target_id_snapshot")
        assertThat(checkConstraintClause(jdbcTemplate, "admin_service_convergence_attempt_check"))
            .contains("PENDING", "attempt_count", "next_attempt_no", "> 0")
        assertThat(checkConstraintClause(jdbcTemplate, "admin_service_convergence_events_contract_check"))
            .contains("event_seq", "PENDING", "SUCCEEDED", "FAILED", "safe_error_code")

        assertThat(importedKeys(jdbcTemplate, notificationReceiptTable)).isEmpty()
        assertThat(importedKeys(jdbcTemplate, notificationTargetTable)).containsExactly(notificationReceiptTable)
        assertEquals(
            "confirmation_id",
            foreignKeyColumns(
                jdbcTemplate,
                notificationTargetTable,
                "admin_notification_confirmation_targets_receipt_fk",
            ),
        )
        assertEquals(
            "RESTRICT",
            foreignKeyDeleteRule(
                jdbcTemplate,
                notificationTargetTable,
                "admin_notification_confirmation_targets_receipt_fk",
            ),
        )
        assertThat(importedKeys(jdbcTemplate, aiReceiptTable)).isEmpty()
        assertThat(importedKeys(jdbcTemplate, aiPreviewTable)).containsExactly(aiReceiptTable)
        assertThat(importedKeys(jdbcTemplate, convergenceTable))
            .containsExactlyInAnyOrder(notificationReceiptTable, aiReceiptTable)
        assertThat(importedKeys(jdbcTemplate, eventTable))
            .containsExactlyInAnyOrder(convergenceTable, convergenceTable, eventTable)
        assertEquals(
            "notification_receipt_id_snapshot",
            foreignKeyColumns(jdbcTemplate, convergenceTable, "admin_service_convergence_notification_receipt_fk"),
        )
        assertEquals(
            "ai_receipt_id_snapshot,effect_type,effect_target_id_snapshot",
            foreignKeyColumns(jdbcTemplate, convergenceTable, "admin_service_convergence_ai_receipt_fk"),
        )
        listOf(
            "admin_service_convergence_notification_receipt_fk",
            "admin_service_convergence_ai_receipt_fk",
        ).forEach { constraint ->
            assertEquals("RESTRICT", foreignKeyDeleteRule(jdbcTemplate, convergenceTable, constraint))
        }
        assertEquals(
            "convergence_id,attempt_no,start_event_seq",
            foreignKeyColumns(jdbcTemplate, eventTable, "admin_service_convergence_events_start_fk"),
        )
        assertEquals(
            "$eventTable:convergence_id,attempt_no,event_seq",
            foreignKeyReference(jdbcTemplate, eventTable, "admin_service_convergence_events_start_fk"),
        )

        val forbiddenColumns =
            arrayOf(
                "prompt",
                "prompt_text",
                "completion",
                "provider",
                "provider_payload",
                "email",
                "email_body",
                "token",
                "url",
                "reason_text",
                "message",
                "raw_error",
                "error_message",
                "request_json",
                "canonical_payload",
            )
        listOf(
            notificationReceiptTable,
            notificationTargetTable,
            aiPreviewTable,
            aiReceiptTable,
            convergenceTable,
            eventTable,
        ).forEach { table ->
            assertThat(columns(jdbcTemplate, table)).doesNotContain(*forbiddenColumns)
        }
        assertThat(columns(jdbcTemplate, notificationReceiptTable)).doesNotContain("updated_at", "deleted_at")
        assertThat(columns(jdbcTemplate, aiReceiptTable)).doesNotContain("updated_at", "deleted_at")
        assertThat(columns(jdbcTemplate, eventTable)).doesNotContain("updated_at", "deleted_at")
    }

    @Suppress("LongMethod")
    private fun assertV58PlatformAdminClubCommandEvidenceSchema(jdbcTemplate: JdbcTemplate) {
        val previewTable = "platform_admin_club_command_previews"
        val receiptTable = "platform_admin_club_command_receipts"
        val convergenceTable = "platform_admin_club_command_convergence"
        val eventTable = "platform_admin_club_command_convergence_events"

        val adminRevision = columnMetadata(jdbcTemplate, "clubs", "admin_revision")
        assertThat(adminRevision["DATA_TYPE"]).isEqualTo("bigint")
        assertThat(adminRevision["IS_NULLABLE"]).isEqualTo("NO")
        assertThat(adminRevision["COLUMN_DEFAULT"].toString()).isEqualTo("0")
        assertThat(checkConstraintClause(jdbcTemplate, "clubs_admin_revision_check")).contains(">= 0")

        assertThat(columns(jdbcTemplate, previewTable)).containsExactlyInAnyOrder(
            "id",
            "command_type",
            "actor_user_id_snapshot",
            "actor_platform_role_snapshot",
            "actor_capabilities_json",
            "target_kind",
            "club_id_snapshot",
            "new_club_slot_id_snapshot",
            "canonical_schema_version",
            "digest_key_version",
            "request_hmac",
            "sanitized_impact_json",
            "expires_at",
            "consumed_at",
            "consumed_receipt_id_snapshot",
            "created_at",
        )
        assertThat(columns(jdbcTemplate, receiptTable)).containsExactlyInAnyOrder(
            "id",
            "command_type",
            "actor_user_id_snapshot",
            "actor_platform_role_snapshot",
            "actor_capabilities_json",
            "club_id_snapshot",
            "preview_id_snapshot",
            "before_admin_revision",
            "after_admin_revision",
            "outcome",
            "canonical_schema_version",
            "digest_key_version",
            "request_hmac",
            "platform_audit_event_id_snapshot",
            "origin_at",
            "safe_result_json",
        )
        assertThat(columns(jdbcTemplate, convergenceTable)).containsExactlyInAnyOrder(
            "id",
            "receipt_id_snapshot",
            "effect_type",
            "effect_target_id_snapshot",
            "state",
            "attempt_count",
            "next_attempt_no",
            "lease_owner",
            "lease_expires_at",
            "last_safe_error_code",
            "available_at",
            "created_at",
            "updated_at",
        )
        assertThat(columns(jdbcTemplate, eventTable)).containsExactlyInAnyOrder(
            "convergence_id",
            "receipt_id_snapshot",
            "effect_type",
            "effect_target_id_snapshot",
            "attempt_no",
            "event_seq",
            "start_event_seq",
            "state",
            "safe_error_code",
            "observed_at",
        )

        listOf(
            previewTable to "id",
            previewTable to "actor_user_id_snapshot",
            previewTable to "club_id_snapshot",
            previewTable to "new_club_slot_id_snapshot",
            previewTable to "consumed_receipt_id_snapshot",
            receiptTable to "id",
            receiptTable to "actor_user_id_snapshot",
            receiptTable to "club_id_snapshot",
            receiptTable to "preview_id_snapshot",
            receiptTable to "platform_audit_event_id_snapshot",
            convergenceTable to "id",
            convergenceTable to "receipt_id_snapshot",
            convergenceTable to "effect_target_id_snapshot",
            eventTable to "convergence_id",
            eventTable to "receipt_id_snapshot",
            eventTable to "effect_target_id_snapshot",
        ).forEach { (table, column) ->
            val metadata = columnMetadata(jdbcTemplate, table, column)
            assertThat(metadata["DATA_TYPE"]).isEqualTo("char")
            assertThat(metadata["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("36")
            assertThat(metadata["CHARACTER_SET_NAME"]).isEqualTo("ascii")
            assertThat(metadata["COLLATION_NAME"]).isEqualTo("ascii_bin")
        }
        listOf(previewTable, receiptTable).forEach { table ->
            val hmac = columnMetadata(jdbcTemplate, table, "request_hmac")
            assertThat(hmac["DATA_TYPE"]).isEqualTo("varbinary")
            assertThat(hmac["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("32")
            assertThat(hmac["IS_NULLABLE"]).isEqualTo("NO")
        }

        assertEquals("id", indexColumns(jdbcTemplate, previewTable, "PRIMARY"))
        assertEquals(
            "expires_at,id",
            indexColumns(jdbcTemplate, previewTable, "platform_admin_club_previews_expiry_idx"),
        )
        assertEquals(
            "club_id_snapshot,created_at,id",
            indexColumns(jdbcTemplate, previewTable, "platform_admin_club_previews_target_idx"),
        )
        assertEquals("id", indexColumns(jdbcTemplate, receiptTable, "PRIMARY"))
        assertEquals(
            "platform_audit_event_id_snapshot",
            indexColumns(jdbcTemplate, receiptTable, "platform_admin_club_receipts_audit_uk"),
        )
        assertThat(indexNonUnique(jdbcTemplate, receiptTable, "platform_admin_club_receipts_audit_uk")).isZero()
        assertEquals(
            "preview_id_snapshot",
            indexColumns(jdbcTemplate, receiptTable, "platform_admin_club_receipts_preview_uk"),
        )
        assertThat(indexNonUnique(jdbcTemplate, receiptTable, "platform_admin_club_receipts_preview_uk")).isZero()
        assertEquals(
            "club_id_snapshot,origin_at,id",
            indexColumns(jdbcTemplate, receiptTable, "platform_admin_club_receipts_target_idx"),
        )
        assertEquals("id", indexColumns(jdbcTemplate, convergenceTable, "PRIMARY"))
        assertEquals(
            "id,receipt_id_snapshot,effect_type,effect_target_id_snapshot",
            indexColumns(jdbcTemplate, convergenceTable, "platform_admin_club_convergence_identity_uk"),
        )
        assertThat(
            indexNonUnique(jdbcTemplate, convergenceTable, "platform_admin_club_convergence_identity_uk"),
        ).isZero()
        assertEquals(
            "receipt_id_snapshot,effect_type",
            indexColumns(jdbcTemplate, convergenceTable, "platform_admin_club_convergence_receipt_effect_uk"),
        )
        assertThat(
            indexNonUnique(jdbcTemplate, convergenceTable, "platform_admin_club_convergence_receipt_effect_uk"),
        ).isZero()
        assertEquals(
            "state,available_at,lease_expires_at,id",
            indexColumns(jdbcTemplate, convergenceTable, "platform_admin_club_convergence_available_idx"),
        )
        assertEquals(
            "convergence_id,attempt_no,event_seq",
            indexColumns(jdbcTemplate, eventTable, "PRIMARY"),
        )
        assertEquals(
            "receipt_id_snapshot,observed_at,convergence_id,attempt_no,event_seq",
            indexColumns(jdbcTemplate, eventTable, "platform_admin_club_convergence_events_receipt_idx"),
        )

        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_previews_role_check"))
            .contains("OWNER", "OPERATOR", "SUPPORT")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_previews_command_check"))
            .contains("regexp_like", "^[a-z0-9._:-]{1,96}$")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_previews_target_check"))
            .contains("EXISTING_CLUB", "NEW_CLUB", "club_id_snapshot", "new_club_slot_id_snapshot")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_previews_hmac_check"))
            .contains("digest_key_version", "request_hmac", "32")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_previews_schema_check"))
            .contains("regexp_like", "^[A-Za-z0-9._:-]{1,64}$")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_previews_json_check"))
            .contains("actor_capabilities_json", "sanitized_impact_json", "8192")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_previews_consumption_check"))
            .contains("consumed_at", "consumed_receipt_id_snapshot")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_receipts_role_check"))
            .contains("OWNER", "OPERATOR", "SUPPORT")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_receipts_command_check"))
            .contains("regexp_like", "^[a-z0-9._:-]{1,96}$")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_receipts_revision_check"))
            .contains("before_admin_revision", "after_admin_revision", ">= 0")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_receipts_outcome_check"))
            .contains("SUCCEEDED", "PARTIAL", "FAILED")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_receipts_hmac_check"))
            .contains("digest_key_version", "request_hmac", "32")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_receipts_schema_check"))
            .contains("regexp_like", "^[A-Za-z0-9._:-]{1,64}$")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_receipts_json_check"))
            .contains("actor_capabilities_json", "safe_result_json", "139264")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_convergence_effect_check"))
            .contains("HOST_INVITATION", "DOMAIN_PROVISIONING")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_convergence_state_check"))
            .contains("PENDING", "SUCCEEDED", "FAILED", "last_safe_error_code")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_convergence_attempt_check"))
            .contains("PENDING", "attempt_count", "next_attempt_no", "> 0")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_convergence_lease_check"))
            .contains("lease_owner", "lease_expires_at", "regexp_like", "^[A-Za-z0-9._:-]{1,128}$")
        assertThat(checkConstraintClause(jdbcTemplate, "platform_admin_club_convergence_events_contract_check"))
            .contains("PENDING", "SUCCEEDED", "FAILED", "event_seq", "safe_error_code")

        assertThat(importedKeys(jdbcTemplate, previewTable)).containsExactly(receiptTable)
        assertThat(importedKeys(jdbcTemplate, receiptTable)).isEmpty()
        assertThat(importedKeys(jdbcTemplate, convergenceTable)).containsExactly(receiptTable)
        assertThat(importedKeys(jdbcTemplate, eventTable)).containsExactlyInAnyOrder(convergenceTable, eventTable)
        assertEquals(
            "consumed_receipt_id_snapshot,id",
            foreignKeyColumns(jdbcTemplate, previewTable, "platform_admin_club_previews_consumed_receipt_fk"),
        )
        assertEquals(
            "RESTRICT",
            foreignKeyDeleteRule(jdbcTemplate, previewTable, "platform_admin_club_previews_consumed_receipt_fk"),
        )
        assertEquals(
            "receipt_id_snapshot",
            foreignKeyColumns(jdbcTemplate, convergenceTable, "platform_admin_club_convergence_receipt_fk"),
        )
        assertEquals(
            "RESTRICT",
            foreignKeyDeleteRule(jdbcTemplate, convergenceTable, "platform_admin_club_convergence_receipt_fk"),
        )
        assertEquals(
            "convergence_id,receipt_id_snapshot,effect_type,effect_target_id_snapshot",
            foreignKeyColumns(jdbcTemplate, eventTable, "platform_admin_club_convergence_events_identity_fk"),
        )
        assertEquals(
            "RESTRICT",
            foreignKeyDeleteRule(jdbcTemplate, eventTable, "platform_admin_club_convergence_events_identity_fk"),
        )
        assertEquals(
            "convergence_id,attempt_no,start_event_seq",
            foreignKeyColumns(jdbcTemplate, eventTable, "platform_admin_club_convergence_events_start_fk"),
        )
        assertEquals(
            "$eventTable:convergence_id,attempt_no,event_seq",
            foreignKeyReference(jdbcTemplate, eventTable, "platform_admin_club_convergence_events_start_fk"),
        )
        assertEquals(
            "RESTRICT",
            foreignKeyDeleteRule(jdbcTemplate, eventTable, "platform_admin_club_convergence_events_start_fk"),
        )

        listOf(previewTable, receiptTable, convergenceTable, eventTable).forEach { table ->
            assertThat(columns(jdbcTemplate, table)).doesNotContain(
                "accept_url",
                "invitation_token",
                "dns_secret",
                "hostname",
                "email",
                "reason",
                "note",
                "message",
                "provider_error",
                "provider_response",
                "raw_error",
                "request_json",
                "canonical_payload",
                "request_sha256",
            )
        }
        assertThat(columns(jdbcTemplate, receiptTable)).doesNotContain("updated_at", "deleted_at")
    }

    private data class V59ServiceCommandFixture(
        val clubId: String = "aaaaaaaa-0000-4000-8000-000000059001",
        val actorId: String = "aaaaaaaa-0000-4000-8000-000000059002",
        val auditId: String = "aaaaaaaa-0000-4000-8000-000000059003",
        val legacyNotificationPreviewId: String = "aaaaaaaa-0000-4000-8000-000000059004",
        val legacyNotificationReceiptId: String = "aaaaaaaa-0000-4000-8000-000000059005",
        val notificationPreviewId: String = "aaaaaaaa-0000-4000-8000-000000059006",
        val notificationReceiptId: String = "aaaaaaaa-0000-4000-8000-000000059007",
        val notificationAuditId: String = "aaaaaaaa-0000-4000-8000-000000059008",
        val notificationConvergenceId: String = "aaaaaaaa-0000-4000-8000-000000059009",
        val notificationDeliveryId: String = "aaaaaaaa-0000-4000-8000-000000059016",
        val notificationEventId: String = "aaaaaaaa-0000-4000-8000-000000059017",
        val membershipId: String = "aaaaaaaa-0000-4000-8000-000000059018",
        val aiPreviewId: String = "aaaaaaaa-0000-4000-8000-000000059010",
        val mismatchedAiPreviewId: String = "aaaaaaaa-0000-4000-8000-000000059011",
        val aiReceiptId: String = "aaaaaaaa-0000-4000-8000-000000059012",
        val aiAuditId: String = "aaaaaaaa-0000-4000-8000-000000059013",
        val aiJobId: String = "aaaaaaaa-0000-4000-8000-000000059014",
        val aiConvergenceId: String = "aaaaaaaa-0000-4000-8000-000000059015",
    )

    private fun insertV59LegacyNotificationSources(
        jdbcTemplate: JdbcTemplate,
        fixture: V59ServiceCommandFixture,
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'v59-hard-delete-target', 'V59 target', 'V59 target', 'V59 target')
            """.trimIndent(),
            fixture.clubId,
        )
        insertProfileUser(
            jdbcTemplate,
            fixture.actorId,
            "v59-actor" + "@" + "example" + "." + "test",
            "V59 Actor",
            "V59Actor",
        )
        insertMembership(
            jdbcTemplate,
            fixture.membershipId,
            fixture.clubId,
            fixture.actorId,
            "V59Member",
            "MEMBER",
        )
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
              kafka_key, dedupe_key
            ) values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('eventId', ?), ?, ?)
            """.trimIndent(),
            fixture.notificationEventId,
            fixture.clubId,
            fixture.notificationEventId,
            fixture.notificationEventId,
            fixture.clubId,
            "v59-event-${fixture.notificationEventId}",
        )
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status,
              dedupe_key, attempt_count, last_error
            ) values (?, ?, ?, ?, 'EMAIL', 'FAILED', ?, 1, 'MAIL_RETRYABLE')
            """.trimIndent(),
            fixture.notificationDeliveryId,
            fixture.notificationEventId,
            fixture.clubId,
            fixture.membershipId,
            "v59-delivery-${fixture.notificationDeliveryId}",
        )
        jdbcTemplate.update(
            """
            insert into platform_audit_events (
              id, actor_user_id, actor_platform_role, event_type, metadata_json, created_at
            ) values (?, ?, 'OWNER', 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED', json_object(),
                      '2026-08-24 02:01:00.000000')
            """.trimIndent(),
            fixture.auditId,
            fixture.actorId,
        )
        insertV2ReplayPreview(
            jdbcTemplate,
            fixture.legacyNotificationPreviewId,
            fixture.actorId,
            fixture.clubId,
            "OWNER",
        )
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_confirmations (
              id, preview_id, actor_user_id, actor_platform_role, club_id, selection_hash,
              replayed_count, skipped_count, platform_audit_event_id, confirmed_at
            ) values (?, ?, ?, 'OWNER', ?, ?, 1, 0, ?, '2026-08-24 02:01:00.000000')
            """.trimIndent(),
            fixture.legacyNotificationReceiptId,
            fixture.legacyNotificationPreviewId,
            fixture.actorId,
            fixture.clubId,
            "a".repeat(64),
            fixture.auditId,
        )
    }

    private fun insertV59NotificationPreview(
        jdbcTemplate: JdbcTemplate,
        previewId: String,
        fixture: V59ServiceCommandFixture,
    ) {
        insertV2ReplayPreview(jdbcTemplate, previewId, fixture.actorId, fixture.clubId, "OWNER")
    }

    private fun insertV59NotificationReceipt(
        jdbcTemplate: JdbcTemplate,
        receiptId: String,
        previewId: String,
        fixture: V59ServiceCommandFixture,
        legacySelectionSha: String? = null,
        digestKeyVersion: Int? = 1,
        requestHmac: ByteArray? = ByteArray(32) { 0x61 },
        auditId: String = fixture.notificationAuditId,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_confirmations (
              id, preview_id, actor_user_id, actor_platform_role, actor_capabilities_json, club_id,
              command_type, target_kind, target_id_snapshot, selection_hash, identity_mode,
              canonical_schema_version, digest_key_version, request_hmac,
              replayed_count, skipped_count, skipped_reason_counts_json, origin_outcome,
              platform_audit_event_id, confirmed_at
            ) values (?, ?, ?, 'OWNER', json_array('REPLAY_NOTIFICATIONS'), ?,
                      'notification.replay', 'NOTIFICATION_REPLAY_TARGET_SET', ?, ?, 'HMAC',
                      'notification-replay:v1', ?, ?, 1, 0, json_object(), 'SUCCEEDED', ?,
                      '2026-08-24 02:01:00.000000')
            """.trimIndent(),
            receiptId,
            previewId,
            fixture.actorId,
            fixture.clubId,
            receiptId,
            legacySelectionSha,
            digestKeyVersion,
            requestHmac,
            auditId,
        )
    }

    private fun insertV59NotificationReceiptTarget(
        jdbcTemplate: JdbcTemplate,
        receiptId: String,
        deliveryId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_confirmation_targets (
              confirmation_id, delivery_id_snapshot
            ) values (?, ?)
            """.trimIndent(),
            receiptId,
            deliveryId,
        )
    }

    private fun insertV59AiPreview(
        jdbcTemplate: JdbcTemplate,
        previewId: String,
        fixture: V59ServiceCommandFixture,
        requestHmac: ByteArray = ByteArray(32) { 0x62 },
    ) {
        jdbcTemplate.update(
            """
            insert into ai_generation_admin_command_previews (
              id, action, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, job_id_snapshot, club_id_snapshot,
              job_status_snapshot, job_revision_snapshot, canonical_schema_version,
              digest_key_version, request_hmac, sanitized_impact_json,
              expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
            ) values (?, 'FORCE_CANCEL', ?, 'OWNER', json_array('MANAGE_AI_OPERATIONS'), ?, ?,
                      'RUNNING', 7, 'ai-force-cancel:v1', 1, ?,
                      json_object('impactCodes', json_array('JOB_CANCEL_REQUESTED')),
                      '2026-08-24 02:10:00.000000', null, null, '2026-08-24 02:00:00.000000')
            """.trimIndent(),
            previewId,
            fixture.actorId,
            fixture.aiJobId,
            fixture.clubId,
            requestHmac,
        )
    }

    private fun insertV59AiReceipt(
        jdbcTemplate: JdbcTemplate,
        receiptId: String,
        previewId: String,
        fixture: V59ServiceCommandFixture,
        safeReasonCode: String? = null,
    ) {
        jdbcTemplate.update(
            """
            insert into ai_generation_admin_command_receipts (
              id, preview_id_snapshot, action, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, job_id_snapshot, club_id_snapshot,
              before_job_status_snapshot, before_job_revision_snapshot,
              after_job_status_snapshot, after_job_revision_snapshot, origin_outcome,
              canonical_schema_version, digest_key_version, request_hmac, safe_reason_code,
              safe_result_json, platform_audit_event_id_snapshot, origin_at
            ) values (?, ?, 'FORCE_CANCEL', ?, 'OWNER', json_array('MANAGE_AI_OPERATIONS'), ?, ?,
                      'RUNNING', 7, 'RUNNING', 7, 'ACCEPTED', 'ai-force-cancel:v1', 1, ?, ?,
                      json_object('resultCode', 'AI_CANCEL_ACCEPTED'), ?,
                      '2026-08-24 02:01:00.000000')
            """.trimIndent(),
            receiptId,
            previewId,
            fixture.actorId,
            fixture.aiJobId,
            fixture.clubId,
            ByteArray(32) { 0x63 },
            safeReasonCode,
            fixture.aiAuditId,
        )
    }

    private fun insertV59NotificationConvergence(
        jdbcTemplate: JdbcTemplate,
        convergenceId: String,
        fixture: V59ServiceCommandFixture,
    ) {
        insertV59Convergence(
            jdbcTemplate,
            convergenceId,
            fixture.notificationReceiptId,
            null,
            "NOTIFICATION_REPLAY",
            fixture.notificationReceiptId,
        )
    }

    private fun insertV59AiConvergence(
        jdbcTemplate: JdbcTemplate,
        convergenceId: String,
        fixture: V59ServiceCommandFixture,
    ) {
        insertV59Convergence(
            jdbcTemplate,
            convergenceId,
            null,
            fixture.aiReceiptId,
            "AI_JOB_CANCEL",
            fixture.aiJobId,
        )
    }

    private fun insertV59Convergence(
        jdbcTemplate: JdbcTemplate,
        convergenceId: String,
        notificationReceiptId: String?,
        aiReceiptId: String?,
        effectType: String,
        effectTargetId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_service_command_convergence (
              id, notification_receipt_id_snapshot, ai_receipt_id_snapshot,
              effect_type, effect_target_id_snapshot, state, attempt_count, next_attempt_no,
              lease_owner, lease_expires_at, last_safe_error_code, available_at, created_at, updated_at
            ) values (?, ?, ?, ?, ?, 'PENDING', 0, 1, null, null, null,
                      '2026-08-24 02:01:00.000000', '2026-08-24 02:01:00.000000',
                      '2026-08-24 02:01:00.000000')
            """.trimIndent(),
            convergenceId,
            notificationReceiptId,
            aiReceiptId,
            effectType,
            effectTargetId,
        )
    }

    private fun assertV59TypedConvergenceRejectsMismatches(
        jdbcTemplate: JdbcTemplate,
        fixture: V59ServiceCommandFixture,
    ) {
        listOf(
            arrayOf(null, null, "NOTIFICATION_REPLAY", fixture.notificationReceiptId),
            arrayOf(
                fixture.notificationReceiptId,
                fixture.aiReceiptId,
                "NOTIFICATION_REPLAY",
                fixture.notificationReceiptId,
            ),
            arrayOf(fixture.notificationReceiptId, null, "AI_JOB_CANCEL", fixture.notificationReceiptId),
            arrayOf(fixture.notificationReceiptId, null, "NOTIFICATION_REPLAY", fixture.aiJobId),
            arrayOf(null, fixture.aiReceiptId, "AI_COMMIT_RETRY", fixture.aiJobId),
            arrayOf(null, fixture.aiReceiptId, "AI_JOB_CANCEL", fixture.notificationReceiptId),
            arrayOf(UUID.randomUUID().toString(), null, "NOTIFICATION_REPLAY", UUID.randomUUID().toString()),
        ).forEach { values ->
            assertConstraintRejected {
                insertV59Convergence(
                    jdbcTemplate,
                    UUID.randomUUID().toString(),
                    values[0],
                    values[1],
                    values[2] ?: error("effect type"),
                    values[3] ?: error("effect target"),
                )
            }
        }
    }

    private fun insertV59ConvergenceEvent(
        jdbcTemplate: JdbcTemplate,
        convergenceId: String,
        notificationReceiptId: String?,
        aiReceiptId: String?,
        effectType: String,
        effectTargetId: String,
        attemptNo: Int,
        eventSeq: Int,
        state: String,
        safeErrorCode: String? = null,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_service_command_convergence_events (
              convergence_id, notification_receipt_id_snapshot, ai_receipt_id_snapshot,
              effect_type, effect_target_id_snapshot, attempt_no, event_seq,
              state, safe_error_code, observed_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?,
                      timestampadd(second, ?, timestamp('2026-08-24 02:01:00.000000')))
            """.trimIndent(),
            convergenceId,
            notificationReceiptId,
            aiReceiptId,
            effectType,
            effectTargetId,
            attemptNo,
            eventSeq,
            state,
            safeErrorCode,
            attemptNo + eventSeq,
        )
    }

    private fun insertV58ClubCommandPreview(
        jdbcTemplate: JdbcTemplate,
        previewId: String,
        actorId: String,
        clubId: String,
        commandType: String = "club.domain.provision",
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_previews (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, target_kind, club_id_snapshot, new_club_slot_id_snapshot,
              canonical_schema_version, digest_key_version, request_hmac, sanitized_impact_json,
              expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
            ) values (?, ?, ?, 'OWNER', json_array('MANAGE_CLUB_DOMAINS'),
                      'EXISTING_CLUB', ?, null, 'club-domain-provision:v1', 1, ?,
                      json_object('codes', json_array('DOMAIN_PROVISIONING')),
                      '2026-08-24 01:10:00.000000', null, null, '2026-08-24 01:00:00.000000')
            """.trimIndent(),
            previewId,
            commandType,
            actorId,
            clubId,
            ByteArray(32) { 0x31 },
        )
    }

    private fun insertV58ClubCommandReceipt(
        jdbcTemplate: JdbcTemplate,
        receiptId: String,
        previewId: String,
        actorId: String,
        clubId: String,
        auditId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_receipts (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, club_id_snapshot, preview_id_snapshot,
              before_admin_revision, after_admin_revision,
              outcome, canonical_schema_version, digest_key_version, request_hmac,
              platform_audit_event_id_snapshot, origin_at, safe_result_json
            ) values (?, 'club.domain.provision', ?, 'OWNER', json_array('MANAGE_CLUB_DOMAINS'), ?, ?, 0, 1,
                      'SUCCEEDED', 'club-domain-provision:v1', 1, ?, ?, '2026-08-24 01:01:00.000000',
                      json_object('resultCode', 'DOMAIN_ORIGIN_COMMITTED'))
            """.trimIndent(),
            receiptId,
            actorId,
            clubId,
            previewId,
            ByteArray(32) { 0x32 },
            auditId,
        )
    }

    private fun insertV58ClubCommandConvergence(
        jdbcTemplate: JdbcTemplate,
        convergenceId: String,
        receiptId: String,
        effectTargetId: String = convergenceId,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_convergence (
              id, receipt_id_snapshot, effect_type, effect_target_id_snapshot, state, attempt_count, next_attempt_no,
              lease_owner, lease_expires_at, last_safe_error_code, available_at, created_at, updated_at
            ) values (?, ?, 'DOMAIN_PROVISIONING', ?, 'PENDING', 0, 1, null, null, null,
                      '2026-08-24 01:01:00.000000', '2026-08-24 01:01:00.000000',
                      '2026-08-24 01:01:00.000000')
            """.trimIndent(),
            convergenceId,
            receiptId,
            effectTargetId,
        )
    }

    private fun insertV58ClubCommandConvergenceEvent(
        jdbcTemplate: JdbcTemplate,
        convergenceId: String,
        receiptId: String,
        attemptNo: Int,
        eventSeq: Int,
        state: String,
        safeErrorCode: String?,
        effectType: String = "DOMAIN_PROVISIONING",
        effectTargetId: String = convergenceId,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_convergence_events (
              convergence_id, receipt_id_snapshot, effect_type, effect_target_id_snapshot, attempt_no, event_seq,
              state, safe_error_code, observed_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?,
                      timestampadd(second, ?, timestamp('2026-08-24 01:01:00.000000')))
            """.trimIndent(),
            convergenceId,
            receiptId,
            effectType,
            effectTargetId,
            attemptNo,
            eventSeq,
            state,
            safeErrorCode,
            attemptNo + eventSeq,
        )
    }

    private fun assertV55PlatformAdminPublicTakedownSchema(jdbcTemplate: JdbcTemplate) {
        assertThat(columns(jdbcTemplate, "public_projection_generations")).contains("emergency_denied")
        assertThat(checkConstraintClause(jdbcTemplate, "public_projection_generations_emergency_deny_check"))
            .contains("emergency_denied", "origin_readable")
        assertV55PreviewAndReceiptSchema(jdbcTemplate)
        assertV55IdempotencyAndPrivacySchema(jdbcTemplate)
    }

    private fun assertV55PreviewAndReceiptSchema(jdbcTemplate: JdbcTemplate) {
        assertThat(columns(jdbcTemplate, "admin_public_takedown_previews")).containsExactlyInAnyOrder(
            "id",
            "actor_user_id_snapshot",
            "actor_platform_role_snapshot",
            "club_id_snapshot",
            "session_id_snapshot",
            "publication_id_snapshot",
            "target_generation",
            "current_surfaces_json",
            "expires_at",
            "created_at",
        )
        assertThat(columns(jdbcTemplate, "admin_public_takedown_receipts")).containsExactlyInAnyOrder(
            "id",
            "convergence_id",
            "actor_user_id_snapshot",
            "actor_platform_role_snapshot",
            "reason_category",
            "reason_redacted",
            "club_id_snapshot",
            "session_id_snapshot",
            "publication_id_snapshot",
            "committed_generation",
            "origin_result",
            "current_surfaces_json",
            "remote_copy_limitation_code",
            "created_at",
        )
        assertThat(
            columnMetadata(jdbcTemplate, "admin_public_takedown_previews", "expires_at")["DATETIME_PRECISION"],
        ).isEqualTo(6L)
        assertV55ReasonCategoryConstraint(jdbcTemplate)
    }

    private fun assertV55ReasonCategoryConstraint(jdbcTemplate: JdbcTemplate) {
        fun insertReceipt(category: String) {
            jdbcTemplate.update(
                """
                insert into admin_public_takedown_receipts (
                  id, convergence_id, actor_user_id_snapshot, actor_platform_role_snapshot,
                  reason_category, reason_redacted, club_id_snapshot, session_id_snapshot,
                  publication_id_snapshot, committed_generation, origin_result,
                  current_surfaces_json, remote_copy_limitation_code, created_at
                ) values (?, ?, ?, 'OWNER', ?, true, ?, ?, ?, 2, 'DENIED', json_array('ORIGIN'),
                          'REMOTE_STORED_OR_OFFLINE_COPY_NOT_ERASABLE', utc_timestamp(6))
                """.trimIndent(),
                UUID.randomUUID().toString(),
                UUID.randomUUID().toString(),
                UUID.randomUUID().toString(),
                category,
                UUID.randomUUID().toString(),
                UUID.randomUUID().toString(),
                UUID.randomUUID().toString(),
            )
        }
        insertReceipt("PRIVATE_DATA")
        assertConstraintRejected { insertReceipt("MEMBER_EMAIL_EXPOSURE") }
        jdbcTemplate.update("delete from admin_public_takedown_receipts")
    }

    private fun assertV55IdempotencyAndPrivacySchema(jdbcTemplate: JdbcTemplate) {
        assertThat(columns(jdbcTemplate, "admin_public_takedown_idempotency")).containsExactlyInAnyOrder(
            "actor_user_id",
            "operation",
            "club_id",
            "publication_id",
            "idempotency_key",
            "request_hmac",
            "canonical_schema_version",
            "digest_key_version",
            "receipt_id",
            "created_at",
            "completed_at",
            "expires_at",
        )
        assertThat(importedKeys(jdbcTemplate, "admin_public_takedown_previews")).isEmpty()
        assertThat(importedKeys(jdbcTemplate, "admin_public_takedown_receipts")).isEmpty()
        assertThat(importedKeys(jdbcTemplate, "admin_public_takedown_idempotency")).isEmpty()
        assertEquals(
            "actor_user_id,operation,club_id,publication_id,idempotency_key",
            indexColumns(jdbcTemplate, "admin_public_takedown_idempotency", "PRIMARY"),
        )
        val hmac = columnMetadata(jdbcTemplate, "admin_public_takedown_idempotency", "request_hmac")
        assertThat(hmac["DATA_TYPE"].toString()).isEqualTo("binary")
        assertThat(hmac["CHARACTER_MAXIMUM_LENGTH"].toString()).isEqualTo("32")
        listOf(
            "admin_public_takedown_previews",
            "admin_public_takedown_receipts",
            "admin_public_takedown_idempotency",
        ).forEach { table ->
            assertThat(columns(jdbcTemplate, table)).doesNotContain(
                "reason",
                "private_body",
                "provider_error",
                "provider_response",
                "canonical_payload",
                "request_sha256",
            )
        }
    }

    @Suppress("LongMethod")
    private fun assertV52RevisionBackfill(jdbcTemplate: JdbcTemplate) {
        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                where session_revision <> 0
                   or exposure_revision <> 0
                   or participant_set_revision <> 0
                """.trimIndent(),
                Int::class.java,
            ),
        )
        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from session_participants
                where attendance_revision <> 0
                """.trimIndent(),
                Int::class.java,
            ),
        )
        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                left join session_publication_versions
                  on session_publication_versions.session_id = sessions.id
                where session_publication_versions.session_id is null
                   or session_publication_versions.publication_revision <> 0
                """.trimIndent(),
                Int::class.java,
            ),
        )
        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from session_publication_versions
                left join sessions on sessions.id = session_publication_versions.session_id
                where sessions.id is null
                """.trimIndent(),
                Int::class.java,
            ),
        )
        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from clubs
                left join club_host_list_epochs on club_host_list_epochs.club_id = clubs.id
                where club_host_list_epochs.club_id is null
                   or club_host_list_epochs.meeting_epoch <> 0
                   or club_host_list_epochs.record_epoch <> 0
                """.trimIndent(),
                Int::class.java,
            ),
        )
    }

    private data class V51RevisionUpgradeFixtures(
        val draftSessionId: String,
        val openSessionId: String,
        val closedSessionId: String,
        val publishedSessionId: String,
        val openWithoutPublicationSessionId: String,
        val trashedSessionId: String,
    )

    @Suppress("LongMethod")
    private fun insertV51RevisionUpgradeFixtures(jdbcTemplate: JdbcTemplate): V51RevisionUpgradeFixtures {
        val clubId = "aaaaaaaa-0000-4000-8000-000000052101"
        val hostUserId = "aaaaaaaa-0000-4000-8000-000000052102"
        val hostMembershipId = "aaaaaaaa-0000-4000-8000-000000052103"
        val memberUserId = "aaaaaaaa-0000-4000-8000-000000052104"
        val memberMembershipId = "aaaaaaaa-0000-4000-8000-000000052105"
        val fixtures =
            V51RevisionUpgradeFixtures(
                draftSessionId = "aaaaaaaa-0000-4000-8000-000000052110",
                openSessionId = "aaaaaaaa-0000-4000-8000-000000052111",
                closedSessionId = "aaaaaaaa-0000-4000-8000-000000052112",
                publishedSessionId = "aaaaaaaa-0000-4000-8000-000000052113",
                openWithoutPublicationSessionId = "aaaaaaaa-0000-4000-8000-000000052114",
                trashedSessionId = "aaaaaaaa-0000-4000-8000-000000052115",
            )
        insertV52RevisionClubGraph(
            jdbcTemplate,
            clubId,
            "v51-revision",
            hostUserId = hostUserId,
            hostMembershipId = hostMembershipId,
            memberUserId = memberUserId,
            memberMembershipId = memberMembershipId,
        )
        listOf(
            Triple(fixtures.draftSessionId, 1, "DRAFT"),
            Triple(fixtures.openSessionId, 2, "OPEN"),
            Triple(fixtures.closedSessionId, 3, "CLOSED"),
            Triple(fixtures.publishedSessionId, 4, "PUBLISHED"),
            Triple(fixtures.openWithoutPublicationSessionId, 5, "OPEN"),
            Triple(fixtures.trashedSessionId, 6, "DRAFT"),
        ).forEach { (sessionId, number, state) ->
            insertV52RevisionSession(jdbcTemplate, sessionId, clubId, number, state)
        }
        jdbcTemplate.update(
            """
            update sessions
            set deleted_at = '2026-08-14 00:00:00.000000',
                deleted_by_membership_id = ?,
                purge_after = '2026-08-21 00:00:00.000000'
            where id = ?
            """.trimIndent(),
            hostMembershipId,
            fixtures.trashedSessionId,
        )
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            ) values (?, ?, ?, ?, 'GOING', 'UNKNOWN', 'ACTIVE')
            """.trimIndent(),
            "aaaaaaaa-0000-4000-8000-000000052120",
            clubId,
            fixtures.openSessionId,
            memberMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, site_visibility, published_at
            ) values (?, ?, ?, 'V51 preserved public summary', true, 'PUBLIC', 'PUBLIC_RECORD',
                      '2026-08-21 22:00:00.000000')
            """.trimIndent(),
            "aaaaaaaa-0000-4000-8000-000000052130",
            clubId,
            fixtures.publishedSessionId,
        )
        return fixtures
    }

    private data class V52LiveRevisionFixture(
        val suffix: String = UUID.randomUUID().toString().take(8),
        val clubId: String = UUID.randomUUID().toString(),
        val hostUserId: String = UUID.randomUUID().toString(),
        val memberUserId: String = UUID.randomUUID().toString(),
        val hostMembershipId: String = UUID.randomUUID().toString(),
        val memberMembershipId: String = UUID.randomUUID().toString(),
        val sessionId: String = UUID.randomUUID().toString(),
        val participantId: String = UUID.randomUUID().toString(),
        val auditId: String = UUID.randomUUID().toString(),
    )

    private fun insertV52RevisionClubGraph(
        jdbcTemplate: JdbcTemplate,
        clubId: String,
        slug: String,
        hostUserId: String = V52_EMPTY_HOST_USER_ID,
        hostMembershipId: String = V52_EMPTY_HOST_MEMBERSHIP_ID,
        memberUserId: String = "aaaaaaaa-0000-4000-8000-000000052004",
        memberMembershipId: String = "aaaaaaaa-0000-4000-8000-000000052005",
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, ?, 'Revision Fixture Club', 'Revision migration fixture',
                    'Synthetic revision domain fixture.', 'ACTIVE', 'PRIVATE')
            """.trimIndent(),
            clubId,
            slug,
        )
        insertProfileUser(jdbcTemplate, hostUserId, "revision-host-$slug@example.test", "Revision Host", "RevHost$slug")
        insertProfileUser(
            jdbcTemplate,
            memberUserId,
            "revision-member-$slug@example.test",
            "Revision Member",
            "RevMem$slug",
        )
        insertMembership(jdbcTemplate, hostMembershipId, clubId, hostUserId, "RevHost$slug", "HOST")
        insertMembership(jdbcTemplate, memberMembershipId, clubId, memberUserId, "RevMem$slug", "MEMBER")
    }

    private fun insertV52RevisionSession(
        jdbcTemplate: JdbcTemplate,
        sessionId: String,
        clubId: String,
        number: Int,
        state: String,
    ) {
        val visibility = if (state == "PUBLISHED") "PUBLIC" else "HOST_ONLY"
        val accessScope = if (state == "PUBLISHED") "GUEST_READABLE" else "HOST_ONLY"
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility, access_scope
            ) values (?, ?, ?, 'Revision fixture session', 'Revision fixture book', 'Example Author',
                      '2026-08-22', '20:00:00', '22:00:00', '온라인', '2026-08-21 12:00:00.000000', ?, ?, ?)
            """.trimIndent(),
            sessionId,
            clubId,
            number,
            state,
            visibility,
            accessScope,
        )
    }

    private fun insertV52RevisionParticipant(
        jdbcTemplate: JdbcTemplate,
        fixture: V52LiveRevisionFixture,
    ) {
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            ) values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
            """.trimIndent(),
            fixture.participantId,
            fixture.clubId,
            fixture.sessionId,
            fixture.memberMembershipId,
        )
    }

    private fun insertParticipantChangeAudit(
        jdbcTemplate: JdbcTemplate,
        fixture: V52LiveRevisionFixture,
        before: String,
        after: String,
    ) {
        jdbcTemplate.update(
            """
            insert into session_participant_change_audit (
              id, actor_membership_id, club_id, session_id, membership_id,
              before_status, after_status, participant_set_revision
            ) values (?, ?, ?, ?, ?, ?, ?, 0)
            """.trimIndent(),
            fixture.auditId,
            fixture.hostMembershipId,
            fixture.clubId,
            fixture.sessionId,
            fixture.memberMembershipId,
            before,
            after,
        )
    }

    private fun assertRevisionConstraintsRejected(fixture: V52LiveRevisionFixture) {
        assertConstraintRejected {
            jdbcTemplate.update("update sessions set session_revision = -1 where id = ?", fixture.sessionId)
        }
        assertConstraintRejected {
            jdbcTemplate.update("update sessions set exposure_revision = -1 where id = ?", fixture.sessionId)
        }
        assertConstraintRejected {
            jdbcTemplate.update(
                "update sessions set participant_set_revision = -1 where id = ?",
                fixture.sessionId,
            )
        }
        assertConstraintRejected {
            jdbcTemplate.update(
                "update session_participants set attendance_revision = -1 where session_id = ?",
                fixture.sessionId,
            )
        }
        assertConstraintRejected {
            jdbcTemplate.update(
                "update session_publication_versions set publication_revision = -1 where session_id = ?",
                fixture.sessionId,
            )
        }
        assertUniqueConstraintRejected("PRIMARY") {
            jdbcTemplate.update(
                "insert into session_publication_versions (session_id, publication_revision) values (?, 0)",
                fixture.sessionId,
            )
        }
        assertUniqueConstraintRejected("PRIMARY") {
            jdbcTemplate.update(
                "insert into club_host_list_epochs (club_id, meeting_epoch, record_epoch) values (?, 0, 0)",
                fixture.clubId,
            )
        }
        assertConstraintRejected {
            insertParticipantChangeAudit(
                jdbcTemplate,
                fixture.copy(auditId = UUID.randomUUID().toString()),
                "PENDING",
                "ACTIVE",
            )
        }
        assertConstraintRejected {
            jdbcTemplate.update(
                "update club_host_list_epochs set meeting_epoch = -1 where club_id = ?",
                fixture.clubId,
            )
        }
    }

    private fun insertProfileUser(
        jdbcTemplate: JdbcTemplate,
        userId: String,
        email: String,
        name: String,
        shortName: String,
    ) {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, ?, ?, ?, ?, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-claim-$userId",
            email,
            name,
            shortName,
        )
    }

    private fun insertMembership(
        jdbcTemplate: JdbcTemplate,
        membershipId: String,
        clubId: String,
        userId: String,
        shortName: String,
        role: String,
    ) {
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, ?, 'ACTIVE', utc_timestamp(6), ?, 'mushroom-green-book')
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
            role,
            shortName,
        )
    }

    private fun countRows(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
    ): Int = jdbcTemplate.queryForObject("select count(*) from $tableName", Int::class.java) ?: 0

    private fun importedKeys(
        jdbcTemplate: JdbcTemplate,
        tableName: String,
    ): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select referenced_table_name
                from information_schema.referential_constraints
                where constraint_schema = database()
                  and table_name = ?
                """.trimIndent(),
                String::class.java,
                tableName,
            ).filterNotNull()

    private fun deleteWhereIn(
        tableName: String,
        columnName: String,
        values: Set<String>,
    ) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }
}

private class FlywayUpgradeMySqlContainer :
    MySQLContainer(
        DockerImageName.parse("mysql:8.4"),
    ) {
    init {
        withDatabaseName("readmates_upgrade")
        withUsername("readmates_upgrade")
        withPassword("readmates_upgrade")
        withCommand(
            "--log-bin-trust-function-creators=1",
            "--innodb-buffer-pool-size=32M",
            "--performance-schema=OFF",
            "--key-buffer-size=8M",
            "--max-connections=50",
        )
    }
}
