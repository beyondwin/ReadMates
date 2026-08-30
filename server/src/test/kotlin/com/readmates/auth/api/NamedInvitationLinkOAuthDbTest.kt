package com.readmates.auth.api

import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.model.CreateHostInvitationLinkCommand
import com.readmates.auth.application.model.HostInvitationLinkStatus
import com.readmates.auth.application.model.UpdateHostInvitationLinkCommand
import com.readmates.auth.application.port.`in`.AcceptGoogleInvitationUseCase
import com.readmates.auth.application.port.`in`.PreviewInvitationUseCase
import com.readmates.auth.application.service.HostInvitationLinkService
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [NamedInvitationLinkOAuthDbTest.CLEANUP], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class NamedInvitationLinkOAuthDbTest(
    @param:Autowired private val links: HostInvitationLinkService,
    @param:Autowired private val preview: PreviewInvitationUseCase,
    @param:Autowired private val accept: AcceptGoogleInvitationUseCase,
    @param:Autowired private val jdbc: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `named link preview is redacted and oauth acceptance creates member once without redisclosure`() {
        val actor = hostActor()
        val created =
            links.create(
                actor,
                CreateHostInvitationLinkCommand("신규 멤버 링크", 1, OffsetDateTime.now(ZoneOffset.UTC).plusDays(2), "named-oauth-create"),
            )
        val token = created.oneTimeSharePath!!.substringAfterLast('/')

        val publicPreview = preview.previewInvitation(token, "reading-sai")
        assertThat(publicPreview.invitationType).isEqualTo("NAMED_LINK")
        assertThat(publicPreview.email).isNull()
        assertThat(publicPreview.emailHint).isNull()
        assertThat(publicPreview.canonicalPath).isEqualTo("/clubs/reading-sai/invite/$token")

        val first = accept.acceptGoogleInvitation(token, "task4-named-google", "task4.named@example.com", "새 멤버", null, "reading-sai")
        val replay = accept.acceptGoogleInvitation(token, "task4-named-google", "task4.named@example.com", "새 멤버", null, "reading-sai")

        assertThat(first.role.name).isEqualTo("MEMBER")
        assertThat(replay.membershipId).isEqualTo(first.membershipId)
        assertThat(
            jdbc.queryForObject(
                "select used_count from host_invitation_links where id = ?",
                Int::class.java,
                created.link.linkId.toString(),
            ),
        ).isEqualTo(1)
        assertThat(
            jdbc.queryForObject(
                "select count(*) from host_invitation_link_events where link_id = ? and action = 'ACCEPTED'",
                Int::class.java,
                created.link.linkId.toString(),
            ),
        ).isEqualTo(1)
        val acceptedHashes =
            jdbc.queryForMap(
                "select idempotency_key_hash, request_hash from host_invitation_link_events where link_id = ? and action = 'ACCEPTED'",
                created.link.linkId.toString(),
            )
        assertThat(acceptedHashes.values.map { it.toString() })
            .doesNotContain(
                com.readmates.shared.security.TokenHashing.sha256("named-accept:${created.link.linkId}:task4-named-google"),
                com.readmates.shared.security.TokenHashing.sha256("named-accept:${created.link.linkId}:task4.named@example.com"),
            )
    }

    @Test
    fun `concurrent identical create commands converge to one event and one disclosed path`() {
        val actor = hostActor()
        val command = CreateHostInvitationLinkCommand("동시 생성 링크", 3, OffsetDateTime.now(ZoneOffset.UTC).plusDays(2), "same-create-key")
        val results = concurrently { links.create(actor, command) }

        assertThat(results).allMatch { it.isSuccess }
        val values = results.map { it.getOrThrow() }
        assertThat(values.map { it.receipt.receiptId }.distinct()).hasSize(1)
        assertThat(values.count { it.oneTimeSharePath != null }).isEqualTo(1)
        assertThat(jdbc.queryForObject("select count(*) from host_invitation_links where name = '동시 생성 링크'", Int::class.java)).isEqualTo(1)
        assertThat(jdbc.queryForObject("select count(*) from host_invitation_link_events where link_id = ?", Int::class.java, values.first().link.linkId.toString())).isEqualTo(1)
    }

    @Test
    fun `concurrent identical updates converge while conflicting canonical command conflicts`() {
        val actor = hostActor()
        val created = links.create(actor, CreateHostInvitationLinkCommand("동시 수정 링크", 3, OffsetDateTime.now(ZoneOffset.UTC).plusDays(2), "update-race-create"))
        val command = UpdateHostInvitationLinkCommand(0, "동시 수정 완료", 5, created.link.expiresAt.plusDays(1), HostInvitationLinkStatus.PAUSED, "same-update-key")
        val results = concurrently { links.update(actor, created.link.linkId, command) }

        assertThat(results).allMatch { it.isSuccess }
        val values = results.map { it.getOrThrow() }
        assertThat(values.map { it.receipt.receiptId }.distinct()).hasSize(1)
        assertThat(values.map { it.link.revision }).containsOnly(1L)
        assertThat(jdbc.queryForObject("select count(*) from host_invitation_link_events where link_id = ? and action = 'UPDATED'", Int::class.java, created.link.linkId.toString())).isEqualTo(1)

        assertThatThrownBy {
            links.update(actor, created.link.linkId, command.copy(name = "충돌", idempotencyKey = "same-update-key"))
        }.isInstanceOf(InvitationDomainException::class.java).extracting("code").isEqualTo("INVITATION_LINK_IDEMPOTENCY_CONFLICT")
    }

    @Test
    fun `paused and cross club named links fail before identity or membership mutation`() {
        val actor = hostActor()
        val created =
            links.create(
                actor,
                CreateHostInvitationLinkCommand("차단 링크", 2, OffsetDateTime.now(ZoneOffset.UTC).plusDays(2), "named-denial-create"),
            )
        val token = created.oneTimeSharePath!!.substringAfterLast('/')
        links.update(
            actor,
            created.link.linkId,
            UpdateHostInvitationLinkCommand(0, "차단 링크", 2, created.link.expiresAt, HostInvitationLinkStatus.PAUSED, "named-denial-pause"),
        )

        assertThatThrownBy {
            accept.acceptGoogleInvitation(token, "task4-paused-google", "task4.paused@example.com", null, null, "reading-sai")
        }.isInstanceOf(InvitationDomainException::class.java).extracting("code").isEqualTo("INVITATION_LINK_PAUSED")
        assertThatThrownBy {
            preview.previewInvitation(token, "sample-book-club")
        }.isInstanceOf(InvitationDomainException::class.java).extracting("code").isEqualTo("INVITATION_CLUB_MISMATCH")
        assertThat(jdbc.queryForObject("select count(*) from users where email = 'task4.paused@example.com'", Int::class.java)).isZero()
    }

    @Test
    fun `concurrent last use creates one member and loser mutates no identity`() {
        val created =
            links.create(
                hostActor(),
                CreateHostInvitationLinkCommand("마지막 한 자리", 1, OffsetDateTime.now(ZoneOffset.UTC).plusDays(2), "named-race-create"),
            )
        val token = created.oneTimeSharePath!!.substringAfterLast('/')
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val futures =
                listOf(1, 2).map { index ->
                    pool.submit<Result<Unit>> {
                        start.await()
                        runCatching {
                            accept.acceptGoogleInvitation(
                                token,
                                "task4-race-google-$index",
                                "task4.race$index@example.com",
                                "경쟁 멤버 $index",
                                null,
                                "reading-sai",
                            )
                            Unit
                        }
                    }
                }
            start.countDown()
            val results = futures.map { it.get() }
            assertThat(results.count { it.isSuccess }).isEqualTo(1)
            assertThat(results.single { it.isFailure }.exceptionOrNull())
                .isInstanceOf(InvitationDomainException::class.java)
                .extracting("code")
                .isEqualTo("INVITATION_LINK_EXHAUSTED")
            assertThat(
                jdbc.queryForObject(
                    "select count(*) from users where email in ('task4.race1@example.com','task4.race2@example.com')",
                    Int::class.java,
                ),
            ).isEqualTo(1)
            assertThat(
                jdbc.queryForObject(
                    "select used_count from host_invitation_links where id = ?",
                    Int::class.java,
                    created.link.linkId.toString(),
                ),
            ).isEqualTo(1)
        } finally {
            pool.shutdownNow()
        }
    }

    private fun hostActor(): ClubActor {
        val row =
            jdbc.queryForMap(
                """
                select memberships.id as membership_id, memberships.user_id, memberships.club_id, clubs.slug
                from memberships join clubs on clubs.id = memberships.club_id join users on users.id = memberships.user_id
                where users.email = 'host@example.com' and clubs.slug = 'reading-sai'
                """.trimIndent(),
            )
        return ClubActor(
            UUID.fromString(row["user_id"].toString()),
            UUID.fromString(row["membership_id"].toString()),
            UUID.fromString(row["club_id"].toString()),
            row["slug"].toString(),
            setOf(ClubCapability.MANAGE_INVITATIONS),
        )
    }

    private fun <T> concurrently(block: () -> T): List<Result<T>> {
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        return try {
            val futures = List(2) { pool.submit<Result<T>> { start.await(); runCatching(block) } }
            start.countDown()
            futures.map { it.get() }
        } finally {
            pool.shutdownNow()
        }
    }

    companion object {
        const val CLEANUP = """
            delete from host_invitation_link_events where link_id in (select id from host_invitation_links where name = '신규 멤버 링크');
            delete from host_invitation_link_events where link_id in (select id from host_invitation_links where name in ('차단 링크','마지막 한 자리','동시 생성 링크','동시 수정 링크','동시 수정 완료'));
            delete from host_invitation_links where name in ('신규 멤버 링크','차단 링크','마지막 한 자리','동시 생성 링크','동시 수정 링크','동시 수정 완료');
            delete from memberships where user_id in (select id from users where email like 'task4.%@example.com');
            delete from users where email like 'task4.%@example.com';
        """
    }
}
