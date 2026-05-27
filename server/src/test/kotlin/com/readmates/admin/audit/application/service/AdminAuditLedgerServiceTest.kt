package com.readmates.admin.audit.application.service

import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class AdminAuditLedgerServiceTest {
    @Test
    fun `merges source rows in reverse chronological order and returns opaque cursor`() {
        val readPort =
            FakeAdminAuditLedgerReadPort(
                platformRows = listOf(platformRow("platform-1", "2026-05-27T00:01:00Z")),
                clubRows = listOf(clubRow("club-1", "2026-05-27T00:02:00Z")),
                aiRows = listOf(aiRow("ai-1", "2026-05-27T00:00:00Z")),
                replayPreviewRows = listOf(replayPreviewRow("preview-1", "2026-05-27T00:03:00Z")),
            )
        val service = AdminAuditLedgerService(readPort)

        val page = service.listLedger(owner(), query(limit = 2))

        assertThat(page.items.map { it.id })
            .containsExactly(
                "admin_notification_replay_previews:preview-1",
                "club_audit_events:club-1",
            )
        assertThat(page.nextCursor).isNotBlank()
        assertThat(page.summary.visibleCount).isEqualTo(2)
    }

    @Test
    fun `support receives masked target labels for support grant rows`() {
        val readPort =
            FakeAdminAuditLedgerReadPort(
                platformRows =
                    listOf(
                        platformRow(
                            id = "support-create",
                            occurredAt = "2026-05-27T00:01:00Z",
                            eventType = "SUPPORT_ACCESS_GRANT_CREATED",
                            metadataJson = supportGrantMetadata(),
                        ),
                    ),
            )
        val service = AdminAuditLedgerService(readPort)

        val item = service.listLedger(support(), query()).items.single()

        assertThat(item.summary).contains("support grant")
        assertThat(item.target.label).isEqualTo("사용자 숨김")
        assertThat(item.safeMetadata.map { it.label }).contains("scope", "expiryBucket")
        assertThat(item.safeMetadata.map { it.value }).doesNotContain("00000000-0000-0000-0000-000000000202")
    }

    @Test
    fun `malformed metadata keeps row visible without raw json`() {
        val readPort =
            FakeAdminAuditLedgerReadPort(
                platformRows =
                    listOf(
                        platformRow(
                            id = "broken",
                            occurredAt = "2026-05-27T00:01:00Z",
                            eventType = "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
                            metadataJson = """{"previewId":""",
                        ),
                    ),
            )
        val service = AdminAuditLedgerService(readPort)

        val item = service.listLedger(owner(), query()).items.single()

        assertThat(item.metadataState.name).isEqualTo("UNAVAILABLE")
        assertThat(item.safeMetadata).isEmpty()
        assertThat(item.summary).doesNotContain("previewId")
    }

    private fun query(limit: Int = 25): AdminAuditListQuery =
        AdminAuditListQuery(
            filter = AdminAuditFilter.defaultNow(now = NOW),
            pageRequest =
                PageRequest.cursor(
                    requestedLimit = limit,
                    rawCursor = null,
                    defaultLimit = 25,
                    maxLimit = 50,
                ),
        )

    @Suppress("ktlint:standard:function-expression-body")
    private fun owner(): CurrentPlatformAdmin {
        return CurrentPlatformAdmin(ADMIN_USER_ID, "owner@example.com", PlatformAdminRole.OWNER)
    }

    @Suppress("ktlint:standard:function-expression-body")
    private fun support(): CurrentPlatformAdmin {
        return CurrentPlatformAdmin(SUPPORT_USER_ID, "support@example.com", PlatformAdminRole.SUPPORT)
    }
}

private class FakeAdminAuditLedgerReadPort(
    private val platformRows: List<AdminAuditSourceRow> = emptyList(),
    private val clubRows: List<AdminAuditSourceRow> = emptyList(),
    private val aiRows: List<AdminAuditSourceRow> = emptyList(),
    private val replayPreviewRows: List<AdminAuditSourceRow> = emptyList(),
) : AdminAuditLedgerReadPort {
    override fun listPlatformEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow> = platformRows

    override fun listClubEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow> = clubRows

    override fun listAiGenerationEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow> = aiRows

    override fun listNotificationReplayPreviews(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow> = replayPreviewRows
}

private fun platformRow(
    id: String,
    occurredAt: String,
    eventType: String = "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
    metadataJson: String = replayConfirmedMetadata(),
): AdminAuditSourceRow =
    AdminAuditSourceRow(
        sourceType = AdminAuditSourceType.PLATFORM,
        sourceId = id,
        occurredAt = OffsetDateTime.parse(occurredAt),
        actorUserId = ADMIN_USER_ID,
        actorRole = "OWNER",
        clubId = CLUB_ID,
        targetUserId = MEMBER_USER_ID,
        actionType = eventType,
        outcomeHint = null,
        metadataJson = metadataJson,
    )

private fun clubRow(
    id: String,
    occurredAt: String,
): AdminAuditSourceRow =
    AdminAuditSourceRow(
        AdminAuditSourceType.CLUB,
        id,
        OffsetDateTime.parse(occurredAt),
        ADMIN_USER_ID,
        "OPERATOR",
        CLUB_ID,
        null,
        "CLUB_STATUS_CHANGED",
        null,
        "{}",
    )

private fun aiRow(
    id: String,
    occurredAt: String,
): AdminAuditSourceRow =
    AdminAuditSourceRow(
        AdminAuditSourceType.AI_GENERATION,
        id,
        OffsetDateTime.parse(occurredAt),
        HOST_USER_ID,
        "HOST",
        CLUB_ID,
        null,
        "AI_GENERATION_AUDIT",
        "SUCCEEDED",
        aiMetadata(),
    )

private fun replayPreviewRow(
    id: String,
    occurredAt: String,
): AdminAuditSourceRow =
    AdminAuditSourceRow(
        AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW,
        id,
        OffsetDateTime.parse(occurredAt),
        ADMIN_USER_ID,
        "OWNER",
        CLUB_ID,
        null,
        "ADMIN_NOTIFICATION_REPLAY_PREVIEW",
        "PREPARED",
        """{"matchedCount":2,"selectionHash":"aaaaaaaa","expiresAt":"2026-05-27T00:10:00Z"}""",
    )

private fun supportGrantMetadata(): String =
    """
    {
      "grantId":"grant-1",
      "clubId":"00000000-0000-0000-0000-000000000001",
      "granteeUserId":"00000000-0000-0000-0000-000000000202",
      "scope":"METADATA_READ",
      "expiresAt":"2026-05-28T00:00:00Z"
    }
    """.compactJson()

private fun replayConfirmedMetadata(): String =
    """
    {
      "previewId":"preview-1",
      "selectionHash":"aaaaaaaa",
      "reason":"provider recovered",
      "replayedCount":2,
      "skippedCount":0
    }
    """.compactJson()

private fun aiMetadata(): String =
    """
    {
      "jobId":"$AI_JOB_ID",
      "provider":"openai",
      "model":"gpt-safe",
      "status":"SUCCEEDED",
      "costEstimateUsd":"0.0100",
      "latencyMs":1200
    }
    """.compactJson()

private fun String.compactJson(): String = trimIndent().replace("\n", "")

private val NOW: OffsetDateTime = OffsetDateTime.parse("2026-05-27T00:05:00Z")
private val ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000901")
private val SUPPORT_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000903")
private val MEMBER_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000202")
private val HOST_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val AI_JOB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000a111")
