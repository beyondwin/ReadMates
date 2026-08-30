package com.readmates.support

import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [HostClubSettingsMigrationContractTest.CLEANUP], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostClubSettingsMigrationContractTest(
    @param:Autowired private val jdbc: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `history rejects actions outside the lifecycle allowlist`() {
        assertThatThrownBy {
            jdbc.update(
                """
                insert into host_club_settings_history
                  (id, club_id, revision, action, actor_membership_id, before_settings_json, after_settings_json, occurred_at)
                values (?, ?, 9001, 'UNSAFE_ACTION', ?, json_object(), json_object(), utc_timestamp(6))
                """.trimIndent(),
                HISTORY_ID,
                CLUB_ONE,
                HOST_MEMBERSHIP,
            )
        }.isInstanceOf(DataAccessException::class.java)
    }

    @Test
    fun `close preview rejects a consumed receipt from another club`() {
        jdbc.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), '교차 클럽 호스트', 'mushroom-green-book')
            """.trimIndent(),
            CLUB_TWO_MEMBERSHIP,
            CLUB_TWO,
            HOST_USER,
        )
        jdbc.update(
            """
            insert into host_club_command_receipts
              (id, club_id, actor_membership_id, action, idempotency_key_hash, request_hash, result_revision, safe_result_json, occurred_at)
            values (?, ?, ?, 'CLUB_ENDED', ?, ?, 1, json_object('status', 'ARCHIVED'), utc_timestamp(6))
            """.trimIndent(),
            RECEIPT_ID,
            CLUB_ONE,
            HOST_MEMBERSHIP,
            "a".repeat(64),
            "b".repeat(64),
        )

        assertThatThrownBy {
            jdbc.update(
                """
                insert into host_club_close_previews
                  (id, club_id, actor_membership_id, club_revision, effect_hash, effects_json, expires_at, consumed_receipt_id, created_at)
                values (?, ?, ?, 0, ?, json_object('clubStatus', 'ARCHIVED'),
                        timestampadd(hour, 1, utc_timestamp(6)), ?, utc_timestamp(6))
                """.trimIndent(),
                PREVIEW_ID,
                CLUB_TWO,
                CLUB_TWO_MEMBERSHIP,
                "c".repeat(64),
                RECEIPT_ID,
            )
        }.isInstanceOf(DataAccessException::class.java)
    }

    companion object {
        private const val CLUB_ONE = "00000000-0000-0000-0000-000000000001"
        private const val CLUB_TWO = "00000000-0000-0000-0000-000000000002"
        private const val HOST_USER = "00000000-0000-0000-0000-000000000101"
        private const val HOST_MEMBERSHIP = "00000000-0000-0000-0000-000000000201"
        private const val CLUB_TWO_MEMBERSHIP = "97000000-0000-0000-0000-000000000001"
        private const val RECEIPT_ID = "97000000-0000-0000-0000-000000000002"
        private const val PREVIEW_ID = "97000000-0000-0000-0000-000000000003"
        private const val HISTORY_ID = "97000000-0000-0000-0000-000000000004"
        const val CLEANUP = """
            delete from host_club_close_previews where id = '$PREVIEW_ID';
            delete from host_club_command_receipts where id = '$RECEIPT_ID';
            delete from host_club_settings_history where id = '$HISTORY_ID';
            delete from memberships where id = '$CLUB_TWO_MEMBERSHIP';
        """
    }
}
