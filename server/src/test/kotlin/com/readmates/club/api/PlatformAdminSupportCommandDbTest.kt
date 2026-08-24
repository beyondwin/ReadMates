package com.readmates.club.api

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.ConfirmSupportGrantCreateCommand
import com.readmates.club.application.model.ConfirmSupportGrantRevokeCommand
import com.readmates.club.application.model.PreviewSupportGrantCreateCommand
import com.readmates.club.application.model.PreviewSupportGrantRevokeCommand
import com.readmates.club.application.model.SupportGrantReasonCategory
import com.readmates.club.application.service.SupportAccessGrantService
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.club.domain.SupportAccessGrantScope
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.toPlatformActor
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
@Transactional
class PlatformAdminSupportCommandDbTest(
    @param:Autowired private val service: SupportAccessGrantService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Suppress("LongMethod")
    @Test
    fun `create stores one redacted origin and response loss replays the same receipt`() {
        val actor = CurrentPlatformAdmin(OWNER_ID, "owner@example.com", PlatformAdminRole.OWNER).toPlatformActor()
        val expiry = OffsetDateTime.now(ZoneOffset.UTC).plusHours(2)
        val previewCommand =
            PreviewSupportGrantCreateCommand(
                CLUB_ID,
                GRANTEE_ID,
                SupportAccessGrantScope.HOST_SUPPORT_READ,
                expiry,
                SupportGrantReasonCategory.MEMBER_ASSISTANCE,
                PRIVATE_NOTE,
            )
        val preview = service.previewCreate(actor, previewCommand)
        val confirm =
            ConfirmSupportGrantCreateCommand(
                preview.previewId,
                IDEMPOTENCY_KEY,
                CLUB_ID,
                GRANTEE_ID,
                SupportAccessGrantScope.HOST_SUPPORT_READ,
                expiry,
                SupportGrantReasonCategory.MEMBER_ASSISTANCE,
                PRIVATE_NOTE,
                true,
            )

        val first = service.confirmCreate(actor, confirm)
        val replay = service.confirmCreate(actor, confirm)

        assertThat(replay.receiptId).isEqualTo(first.receiptId)
        assertThat(first.notePresent).isTrue()
        val grant =
            jdbcTemplate.queryForMap(
                "select * from support_access_grants where id = ?",
                first.grantId.toString(),
            )
        assertThat(grant["reason"]).isEqualTo("[REDACTED]")
        assertThat(grant["reason_category"]).isEqualTo("MEMBER_ASSISTANCE")
        assertThat((grant["active_slot"] as Number).toInt()).isOne()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_admin_support_command_receipts where id = ?",
                Int::class.java,
                first.receiptId.toString(),
            ),
        ).isOne()

        val evidence =
            jdbcTemplate
                .queryForMap(
                    """
                    select cast(p.safe_impact_json as char) preview_impact,
                           cast(r.actor_capabilities_json as char) receipt_capabilities,
                           cast(a.metadata_json as char) audit_metadata
                    from platform_admin_support_command_previews p
                    join platform_admin_support_command_receipts r on r.preview_id_snapshot = p.id
                    join platform_audit_events a on a.id = r.platform_audit_event_id_snapshot
                    where r.id = ?
                    """.trimIndent(),
                    first.receiptId.toString(),
                ).values
                .joinToString("|")
        assertThat(evidence).doesNotContain(PRIVATE_NOTE).doesNotContain(GRANTEE_ID.toString())
    }

    @Test
    fun `active slot rejects a second create and revoke clears the slot atomically`() {
        val actor = CurrentPlatformAdmin(OWNER_ID, "owner@example.com", PlatformAdminRole.OWNER).toPlatformActor()
        val expiry = OffsetDateTime.now(ZoneOffset.UTC).plusHours(2)
        val firstPreview = preview(actor, expiry)
        val first = service.confirmCreate(actor, confirm(firstPreview.previewId, expiry, "support-key-0002"))
        val duplicatePreview = preview(actor, expiry)

        assertThatThrownBy {
            service.confirmCreate(actor, confirm(duplicatePreview.previewId, expiry, "support-key-0003"))
        }.isInstanceOfSatisfying(PlatformAdminException::class.java) {
            assertThat(it.error).isEqualTo(PlatformAdminError.GRANT_DUPLICATE_ACTIVE)
        }

        val revokePreview =
            service.previewRevoke(
                actor,
                first.grantId,
                PreviewSupportGrantRevokeCommand(SupportGrantReasonCategory.SECURITY_REVIEW, "  revoke note  "),
            )
        val revoked =
            service.confirmRevoke(
                actor,
                first.grantId,
                ConfirmSupportGrantRevokeCommand(
                    revokePreview.previewId,
                    "support-key-0004",
                    CLUB_ID,
                    SupportAccessGrantScope.HOST_SUPPORT_READ,
                    expiry,
                    SupportGrantReasonCategory.SECURITY_REVIEW,
                    "revoke note",
                    true,
                ),
            )

        assertThat(revoked.afterStatus).isEqualTo("REVOKED")
        val state =
            jdbcTemplate.queryForMap(
                "select revoked_at, active_slot from support_access_grants where id = ?",
                first.grantId.toString(),
            )
        assertThat(state["revoked_at"]).isNotNull()
        assertThat(state["active_slot"]).isNull()
    }

    private fun preview(
        actor: com.readmates.shared.security.PlatformActor,
        expiry: OffsetDateTime,
    ) = service.previewCreate(
        actor,
        PreviewSupportGrantCreateCommand(
            CLUB_ID,
            GRANTEE_ID,
            SupportAccessGrantScope.HOST_SUPPORT_READ,
            expiry,
            SupportGrantReasonCategory.INCIDENT_INVESTIGATION,
            null,
        ),
    )

    private fun confirm(
        previewId: UUID,
        expiry: OffsetDateTime,
        key: String,
    ) = ConfirmSupportGrantCreateCommand(
        previewId,
        key,
        CLUB_ID,
        GRANTEE_ID,
        SupportAccessGrantScope.HOST_SUPPORT_READ,
        expiry,
        SupportGrantReasonCategory.INCIDENT_INVESTIGATION,
        null,
        true,
    )

    private companion object {
        val OWNER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000901")
        val GRANTEE_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000903")
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        const val IDEMPOTENCY_KEY = "support-key-0001"
        const val PRIVATE_NOTE = "private member escalation note"
    }
}
