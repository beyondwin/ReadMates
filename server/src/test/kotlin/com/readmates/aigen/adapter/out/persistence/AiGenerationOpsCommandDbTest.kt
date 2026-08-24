package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceAcquisition
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceOutcome
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandPort
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOrigin
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOriginResult
import com.readmates.aigen.application.port.out.StoredAiGenerationAdminCommandPreview
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

@SpringBootTest(
    properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"],
)
@Tag("integration")
@Suppress("LongMethod", "MaxLineLength")
class AiGenerationOpsCommandDbTest(
    @param:Autowired private val commandPort: AiGenerationAdminCommandPort,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val transactions: TransactionTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val actorId = UUID.randomUUID()
    private val clubId = UUID.randomUUID()

    @BeforeEach
    fun prepare() {
        cleanupEvidence()
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'AI Admin', 'Admin', 'GOOGLE')
            """.trimIndent(),
            actorId.toString(),
            "ai-admin-${UUID.randomUUID()}@example.test",
        )
        jdbcTemplate.update(
            "insert into platform_admins (user_id, role, status) values (?, 'OWNER', 'ACTIVE')",
            actorId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility, admin_revision)
            values (?, ?, 'AI Ops Club', 'Safe tagline', 'Safe public description', 'ACTIVE', 'PRIVATE', 0)
            """.trimIndent(),
            clubId.toString(),
            "ai-ops-${UUID.randomUUID().toString().take(12)}",
        )
    }

    @AfterEach
    fun cleanup() {
        cleanupEvidence()
        jdbcTemplate.update("delete from platform_admins where user_id = ?", actorId.toString())
        jdbcTemplate.update("delete from users where id = ?", actorId.toString())
        jdbcTemplate.update("delete from clubs where id = ?", clubId.toString())
    }

    @Test
    fun `origin transaction stores one audit accepted receipt pending convergence and paired consumption`() {
        val preview = preview()
        commandPort.savePreview(preview)
        val origin = origin(preview)

        val stored = checkNotNull(transactions.execute { commandPort.storeOrigin(origin) })

        assertThat(stored).isInstanceOf(StoreAiGenerationAdminCommandOriginResult.Stored::class.java)
        val receipt = (stored as StoreAiGenerationAdminCommandOriginResult.Stored).receipt
        assertThat(receipt.originStatus).isEqualTo("ACCEPTED")
        assertThat(receipt.effectStatus).isEqualTo("PENDING")
        assertThat(receipt.beforeJobRevision).isEqualTo(receipt.afterJobRevision)
        assertThat(receipt.beforeJobStatus).isEqualTo(receipt.afterJobStatus)
        val projection =
            jdbcTemplate.queryForMap(
                """
                select r.origin_outcome, r.before_job_revision_snapshot, r.after_job_revision_snapshot,
                       c.state, c.attempt_count, c.next_attempt_no,
                       p.consumed_receipt_id_snapshot, p.consumed_at is not null consumed
                from ai_generation_admin_command_receipts r
                join admin_service_command_convergence c on c.ai_receipt_id_snapshot = r.id
                join ai_generation_admin_command_previews p on p.id = r.preview_id_snapshot
                where r.id = ?
                """.trimIndent(),
                origin.receiptId.toString(),
            )
        assertThat(projection)
            .containsEntry("origin_outcome", "ACCEPTED")
            .containsEntry("state", "PENDING")
            .containsEntry("consumed_receipt_id_snapshot", origin.receiptId.toString())
        assertThat((projection["attempt_count"] as Number).toInt()).isZero()
        assertThat((projection["next_attempt_no"] as Number).toInt()).isOne()
        assertThat((projection["consumed"] as Number).toInt()).isOne()
        assertThat(count("platform_audit_events", "id", origin.auditEventId)).isOne()

        val duplicate =
            checkNotNull(
                transactions.execute {
                    commandPort.storeOrigin(origin.copy(receiptId = UUID.randomUUID()))
                },
            )
        assertThat(duplicate).isEqualTo(StoreAiGenerationAdminCommandOriginResult.PreviewConsumed)
        assertThat(count("ai_generation_admin_command_receipts")).isOne()
    }

    @Test
    fun `receipt insert failure rolls audit convergence and preview consumption back together`() {
        val preview = preview()
        commandPort.savePreview(preview)
        val origin = origin(preview)
        jdbcTemplate.execute(
            """
            create trigger task4_fail_ai_receipt before insert on ai_generation_admin_command_receipts
            for each row signal sqlstate '45000' set message_text = 'synthetic ai receipt failure'
            """.trimIndent(),
        )
        try {
            assertThatThrownBy {
                transactions.execute { commandPort.storeOrigin(origin) }
            }.hasRootCauseMessage("synthetic ai receipt failure")
        } finally {
            jdbcTemplate.execute("drop trigger if exists task4_fail_ai_receipt")
        }

        assertThat(count("platform_audit_events", "id", origin.auditEventId)).isZero()
        assertThat(count("ai_generation_admin_command_receipts")).isZero()
        assertThat(count("admin_service_command_convergence", "id", origin.convergenceId)).isZero()
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select consumed_at is null and consumed_receipt_id_snapshot is null
                from ai_generation_admin_command_previews where id = ?
                """.trimIndent(),
                Boolean::class.java,
                preview.previewId.toString(),
            ),
        ).isTrue()
    }

    @Test
    fun `lease start and outcome are attempt owned CAS with immutable event sequence`() {
        val preview = preview()
        commandPort.savePreview(preview)
        val origin = origin(preview)
        checkNotNull(transactions.execute { commandPort.storeOrigin(origin) })
        val owner = "ai-worker-1"
        val startedAt = NOW.plusSeconds(1)
        val acquisition =
            checkNotNull(
                transactions.execute {
                    commandPort.tryAcquireConvergence(
                        origin.convergenceId,
                        owner,
                        startedAt,
                        startedAt.plusSeconds(60),
                    )
                },
            )
        val lease = (acquisition as AiGenerationAdminCommandConvergenceAcquisition.Acquired).lease

        val finished =
            checkNotNull(
                transactions.execute {
                    commandPort.finishConvergence(
                        lease,
                        owner,
                        AiGenerationAdminCommandConvergenceOutcome("SUCCEEDED", null, null),
                        startedAt.plusSeconds(2),
                    )
                },
            )
        val staleFinish =
            checkNotNull(
                transactions.execute {
                    commandPort.finishConvergence(
                        lease,
                        "stale-worker",
                        AiGenerationAdminCommandConvergenceOutcome("FAILED", "AI_EFFECT_RETRY_EXHAUSTED", null),
                        startedAt.plusSeconds(3),
                    )
                },
            )

        assertThat(finished).isTrue()
        assertThat(staleFinish).isFalse()
        assertThat(
            jdbcTemplate.queryForList(
                "select event_seq, state from admin_service_command_convergence_events order by event_seq",
            ),
        ).containsExactly(
            mapOf("event_seq" to 0, "state" to "PENDING"),
            mapOf("event_seq" to 1, "state" to "SUCCEEDED"),
        )
        assertThat(
            jdbcTemplate.queryForMap(
                """
                select state, attempt_count, next_attempt_no, lease_owner, lease_expires_at
                from admin_service_command_convergence
                """.trimIndent(),
            ),
        ).containsEntry("state", "SUCCEEDED")
            .containsEntry("attempt_count", 1)
            .containsEntry("next_attempt_no", 2)
            .containsEntry("lease_owner", null)
            .containsEntry("lease_expires_at", null)
    }

    private fun preview() =
        StoredAiGenerationAdminCommandPreview(
            previewId = UUID.randomUUID(),
            action = AiOpsAction.FORCE_CANCEL,
            actorAdminId = actorId,
            actorRoleSnapshot = "OWNER",
            actorCapabilities = listOf("MANAGE_AI_OPERATIONS"),
            jobId = UUID.randomUUID(),
            clubId = clubId,
            jobStatus = JobStatus.RUNNING,
            jobRevision = 7,
            canonicalSchemaVersion = "readmates:ai-admin-command:v1",
            digestKeyVersion = 1,
            requestHmac = ByteArray(32) { 2 },
            sanitizedImpact =
                mapOf(
                    "effectType" to "AI_JOB_CANCEL",
                    "impactCodes" to listOf("CANCEL_JOB", "DELETE_TRANSIENT_PAYLOAD"),
                    "providerCancellation" to false,
                ),
            expiresAt = NOW.plusSeconds(600),
            consumedAt = null,
            consumedReceiptId = null,
            createdAt = NOW,
        )

    private fun origin(preview: StoredAiGenerationAdminCommandPreview) =
        StoreAiGenerationAdminCommandOrigin(
            preview = preview,
            receiptId = UUID.randomUUID(),
            convergenceId = UUID.randomUUID(),
            auditEventId = UUID.randomUUID(),
            actorAdminId = actorId,
            actorRoleSnapshot = "OWNER",
            actorCapabilities = preview.actorCapabilities,
            digest =
                AdminCommandDigest(
                    "readmates:ai-admin-command:v1",
                    1,
                    ByteArray(32) { 1 },
                    ByteArray(32) { 2 },
                ),
            beforeJobStatus = JobStatus.RUNNING,
            beforeJobRevision = 7,
            afterJobStatus = JobStatus.RUNNING,
            afterJobRevision = 7,
            safeResult = mapOf("resultCode" to "EFFECT_PENDING", "effectStatus" to "PENDING"),
            occurredAt = NOW,
        )

    private fun count(table: String): Int = jdbcTemplate.queryForObject("select count(*) from $table", Int::class.java) ?: 0

    private fun count(
        table: String,
        idColumn: String,
        id: UUID,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $table where $idColumn = ?",
            Int::class.java,
            id.toString(),
        ) ?: 0

    private fun cleanupEvidence() {
        jdbcTemplate.execute("drop trigger if exists task4_fail_ai_receipt")
        jdbcTemplate.update(
            """
            delete from admin_service_command_convergence_events
            where ai_receipt_id_snapshot is not null and event_seq = 1
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            delete from admin_service_command_convergence_events
            where ai_receipt_id_snapshot is not null and event_seq = 0
            """.trimIndent(),
        )
        jdbcTemplate.update("delete from admin_service_command_convergence where ai_receipt_id_snapshot is not null")
        jdbcTemplate.update(
            "update ai_generation_admin_command_previews set consumed_at = null, consumed_receipt_id_snapshot = null",
        )
        jdbcTemplate.update("delete from ai_generation_admin_command_receipts")
        jdbcTemplate.update("delete from ai_generation_admin_command_previews")
        jdbcTemplate.update(
            "delete from platform_audit_events where event_type = 'ADMIN_AI_GENERATION_COMMAND_ACCEPTED'",
        )
    }

    private companion object {
        val NOW: Instant = Instant.parse("2026-08-24T04:00:00Z")
    }
}
