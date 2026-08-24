package com.readmates.admin.audit.application.service

import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditListQuery
import com.readmates.admin.audit.application.model.AdminAuditSourceQuery
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import com.readmates.admin.audit.config.AdminAuditCursorProperties
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
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
        val service = service(readPort)

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
        val service = service(readPort)

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
        val service = service(readPort)

        val item = service.listLedger(owner(), query()).items.single()

        assertThat(item.metadataState.name).isEqualTo("UNAVAILABLE")
        assertThat(item.safeMetadata).isEmpty()
        assertThat(item.summary).doesNotContain("previewId")
    }

    @Test
    fun `public takedown audit exposes only immutable redacted evidence`() {
        val readPort =
            FakeAdminAuditLedgerReadPort(
                platformRows =
                    listOf(
                        platformRow(
                            id = "takedown",
                            occurredAt = "2026-05-27T00:01:00Z",
                            eventType = "EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED",
                            metadataJson = publicTakedownMetadata(),
                        ),
                    ),
            )
        val item = service(readPort).listLedger(owner(), query()).items.single()

        assertThat(item.target.eventId).isEqualTo("receipt-1")
        assertThat(item.summary).contains("origin")
        assertThat(item.safeMetadata.map { it.label })
            .contains("receiptId", "convergenceId", "reasonCategory", "reasonRedacted")
            .doesNotContain("reason", "privateBody", "providerError")
        assertThat(item.safeMetadata.joinToString())
            .doesNotContain("SENSITIVE_REASON", "SENSITIVE_BODY", "EDGE_FAILURE")
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

    @Test
    fun `continues after the last visible tuple without duplicates`() {
        val readPort =
            FakeAdminAuditLedgerReadPort(
                platformRows =
                    listOf(
                        platformRow("00000000-0000-0000-0000-000000000003", "2026-05-27T00:03:00Z"),
                        platformRow("00000000-0000-0000-0000-000000000002", "2026-05-27T00:02:00Z"),
                        platformRow("00000000-0000-0000-0000-000000000001", "2026-05-27T00:01:00Z"),
                    ),
            )
        val service = service(readPort)
        val first = service.listLedger(owner(), query(limit = 2))
        val second = service.listLedger(owner(), query(limit = 2, cursor = first.nextCursor))

        assertThat(first.items.map { it.id }).doesNotContainAnyElementsOf(second.items.map { it.id })
        assertThat(second.items.map { it.id }).containsExactly(
            "platform_audit_events:00000000-0000-0000-0000-000000000001",
        )
    }

    @Test
    fun `notification convergence cursor removes full source prefix`() {
        assertConvergenceContinuation(AdminAuditSourceType.NOTIFICATION_CONVERGENCE_ATTEMPT)
    }

    @Test
    fun `AI convergence cursor removes full source prefix`() {
        assertConvergenceContinuation(AdminAuditSourceType.AI_CONVERGENCE_ATTEMPT)
    }

    private fun assertConvergenceContinuation(source: AdminAuditSourceType) {
        val receiptId = "00000000-0000-0000-0000-000000000801"
        val readPort =
            FakeAdminAuditLedgerReadPort(
                convergenceRows =
                    mapOf(
                        source to
                            listOf(
                                convergenceRow(source, "$receiptId:0000000002:001"),
                                convergenceRow(source, "$receiptId:0000000001:001"),
                            ),
                    ),
            )
        val service = service(readPort)

        val first = service.listLedger(owner(), query(limit = 1))
        val second = service.listLedger(owner(), query(limit = 1, cursor = first.nextCursor))

        assertThat(first.items.map { it.id }).containsExactly("${source.tableName}:$receiptId:0000000002:001")
        assertThat(second.items.map { it.id }).containsExactly("${source.tableName}:$receiptId:0000000001:001")
    }

    @Test
    fun `pins page one unavailable source and never silently adds it on continuation`() {
        val failures = mutableSetOf(AdminAuditSourceType.CLUB)
        val readPort =
            FakeAdminAuditLedgerReadPort(
                platformRows =
                    listOf(
                        platformRow("00000000-0000-0000-0000-000000000003", "2026-05-27T00:03:00Z"),
                        platformRow("00000000-0000-0000-0000-000000000002", "2026-05-27T00:02:00Z"),
                    ),
                failingSources = failures,
            )
        val service = service(readPort)
        val first = service.listLedger(owner(), query(limit = 1))
        failures.clear()
        readPort.calls.clear()

        val second = service.listLedger(owner(), query(limit = 1, cursor = first.nextCursor))

        assertThat(first.summary.unavailableSources).containsExactly(AdminAuditSourceType.CLUB)
        assertThat(second.summary.unavailableSources).containsExactly(AdminAuditSourceType.CLUB)
        assertThat(readPort.calls).doesNotContain(AdminAuditSourceType.CLUB)
    }

    @Test
    fun `fails continuation retriably when an included source becomes unavailable`() {
        val failures = mutableSetOf<AdminAuditSourceType>()
        val readPort =
            FakeAdminAuditLedgerReadPort(
                platformRows =
                    listOf(
                        platformRow("00000000-0000-0000-0000-000000000003", "2026-05-27T00:03:00Z"),
                        platformRow("00000000-0000-0000-0000-000000000002", "2026-05-27T00:02:00Z"),
                    ),
                failingSources = failures,
            )
        val service = service(readPort)
        val first = service.listLedger(owner(), query(limit = 1))
        failures += AdminAuditSourceType.PLATFORM

        assertThatThrownBy { service.listLedger(owner(), query(limit = 1, cursor = first.nextCursor)) }
            .isInstanceOfSatisfying(com.readmates.admin.audit.application.AdminAuditException::class.java) {
                assertThat(it.error).isEqualTo(com.readmates.admin.audit.application.AdminAuditError.SOURCE_UNAVAILABLE)
            }
    }

    private fun query(
        limit: Int,
        cursor: String?,
    ): AdminAuditListQuery =
        AdminAuditListQuery(
            filter = AdminAuditFilter.defaultNow(now = NOW),
            pageRequest = PageRequest.cursor(limit, null, 25, 50),
            rawCursor = cursor,
        )

    private fun service(readPort: AdminAuditLedgerReadPort): AdminAuditLedgerService =
        AdminAuditLedgerService(
            readPort = readPort,
            cursorSigner =
                AdminAuditCursorSigner(
                    AdminCommandIdentityProperties(currentKey = "audit-test-key", currentKeyVersion = 7),
                    AdminAuditCursorProperties(),
                    Clock.fixed(NOW.toInstant(), ZoneOffset.UTC),
                ),
            clock = Clock.fixed(NOW.toInstant(), ZoneOffset.UTC),
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
    private val convergenceRows: Map<AdminAuditSourceType, List<AdminAuditSourceRow>> = emptyMap(),
    private val failingSources: MutableSet<AdminAuditSourceType> = mutableSetOf(),
) : AdminAuditLedgerReadPort {
    val calls = mutableListOf<AdminAuditSourceType>()

    override fun listSource(
        source: AdminAuditSourceType,
        query: AdminAuditSourceQuery,
    ): List<AdminAuditSourceRow> =
        when {
            source in failingSources -> throw IllegalStateException("source unavailable")
            else -> {
                calls += source
                rows(source)
            }
        }.filter { row -> row.isAfter(query) }
            .take(query.limit)

    private fun rows(source: AdminAuditSourceType): List<AdminAuditSourceRow> =
        convergenceRows[source] ?: when (source) {
            AdminAuditSourceType.PLATFORM -> platformRows
            AdminAuditSourceType.CLUB -> clubRows
            AdminAuditSourceType.AI_GENERATION -> aiRows
            AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW -> replayPreviewRows
            else -> emptyList()
        }
}

private fun convergenceRow(
    source: AdminAuditSourceType,
    id: String,
): AdminAuditSourceRow =
    AdminAuditSourceRow(
        sourceType = source,
        sourceId = id,
        occurredAt = OffsetDateTime.parse("2026-05-27T00:02:00Z"),
        actorUserId = ADMIN_USER_ID,
        actorRole = "OWNER",
        clubId = CLUB_ID,
        targetUserId = null,
        actionType = "SERVICE_CONVERGENCE_REPLAY",
        outcomeHint = "SUCCEEDED",
        metadataJson = "{}",
    )

private fun AdminAuditSourceRow.isAfter(query: AdminAuditSourceQuery): Boolean {
    val after = query.after ?: return occurredAt >= query.filter.from && occurredAt < query.snapshotTo
    return occurredAt.isBefore(after.occurredAt) ||
        (
            occurredAt == after.occurredAt &&
                (
                    sourceType.rank > after.sourceRank ||
                        (sourceType.rank == after.sourceRank && sourceId < after.immutableSourceId)
                )
        )
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

private fun publicTakedownMetadata(): String =
    """
    {
      "receiptId":"receipt-1",
      "convergenceId":"convergence-1",
      "publicationId":"publication-1",
      "committedGeneration":8,
      "originResult":"DENIED",
      "reasonCategory":"PRIVATE_DATA",
      "reasonRedacted":true,
      "remoteCopyLimitationCode":"REMOTE_STORED_OR_OFFLINE_COPY_NOT_ERASABLE",
      "reason":"SENSITIVE_REASON",
      "privateBody":"SENSITIVE_BODY",
      "providerError":"EDGE_FAILURE"
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
