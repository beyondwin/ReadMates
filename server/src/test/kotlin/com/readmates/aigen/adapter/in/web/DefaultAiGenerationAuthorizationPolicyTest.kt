package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.adapter.out.persistence.JdbcAiGenerationSessionMetaAdapter
import com.readmates.aigen.application.service.AiGenerationAuthorizationService
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

private const val CLUB_ID = "00000000-0000-0000-0000-000000088700"
private const val OTHER_CLUB_ID = "00000000-0000-0000-0000-000000088710"
private const val SESSION_ID = "00000000-0000-0000-0000-000000088701"
private const val HOST_USER_ID = "00000000-0000-0000-0000-000000088711"
private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000088712"
private const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000088721"
private const val MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000088722"

private const val CLEANUP_SQL = """
    delete from session_participants where session_id = '$SESSION_ID';
    delete from sessions where id = '$SESSION_ID';
    delete from memberships where id in ('$HOST_MEMBERSHIP_ID', '$MEMBER_MEMBERSHIP_ID');
    delete from users where id in ('$HOST_USER_ID', '$MEMBER_USER_ID');
    delete from clubs where id in ('$CLUB_ID', '$OTHER_CLUB_ID');
"""

private const val SEED_SQL = """
    insert into clubs (id, slug, name, tagline, about)
    values
      ('$CLUB_ID', 'aigen-authz-club', 'AiGen Authz Club', 'tagline', 'about'),
      ('$OTHER_CLUB_ID', 'aigen-authz-other-club', 'Other Club', 'tagline', 'about');
    insert into users (id, email, name, short_name, auth_provider)
    values
      ('$HOST_USER_ID', 'authz-host@example.test', 'Authz Host', 'AuthzHost', 'PASSWORD'),
      ('$MEMBER_USER_ID', 'authz-member@example.test', 'Authz Member', 'AuthzMember', 'PASSWORD');
    insert into memberships (id, club_id, user_id, role, status, short_name, joined_at)
    values
      ('$HOST_MEMBERSHIP_ID', '$CLUB_ID', '$HOST_USER_ID', 'HOST', 'ACTIVE', 'AuthzHost', '2026-05-01 00:00:00.000000'),
      ('$MEMBER_MEMBERSHIP_ID', '$CLUB_ID', '$MEMBER_USER_ID', 'MEMBER', 'ACTIVE', 'AuthzMember', '2026-05-01 00:00:00.000000');
    insert into sessions (
      id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
      session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
      question_deadline_at, state, visibility
    )
    values (
      '$SESSION_ID', '$CLUB_ID', 8870, '8870차 · AuthZ Book', 'AuthZ Book', 'AuthZ Author',
      null, null, null, '2026-05-14', '20:00:00', '22:00:00', 'Online', null, null,
      '2026-05-13 14:59:00.000000', 'CLOSED', 'MEMBER'
    );
    insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
    values
      ('00000000-0000-0000-0000-000000088731', '$CLUB_ID', '$SESSION_ID', '$HOST_MEMBERSHIP_ID', 'GOING', 'ATTENDED', 'ACTIVE'),
      ('00000000-0000-0000-0000-000000088732', '$CLUB_ID', '$SESSION_ID', '$MEMBER_MEMBERSHIP_ID', 'GOING', 'ATTENDED', 'ACTIVE');
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Sql(statements = [CLEANUP_SQL, SEED_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class DefaultAiGenerationAuthorizationPolicyTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val policy =
        DefaultAiGenerationAuthorizationPolicy(
            AiGenerationAuthorizationService(
                JdbcAiGenerationSessionMetaAdapter(jdbcTemplate),
            ),
        )

    private fun hostMember(clubId: UUID = UUID.fromString(CLUB_ID)) =
        CurrentMember(
            userId = UUID.fromString(HOST_USER_ID),
            membershipId = UUID.fromString(HOST_MEMBERSHIP_ID),
            clubId = clubId,
            clubSlug = "aigen-authz-club",
            email = "authz-host@example.test",
            displayName = "Authz Host",
            accountName = "Authz Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private fun memberMember() =
        CurrentMember(
            userId = UUID.fromString(MEMBER_USER_ID),
            membershipId = UUID.fromString(MEMBER_MEMBERSHIP_ID),
            clubId = UUID.fromString(CLUB_ID),
            clubSlug = "aigen-authz-club",
            email = "authz-member@example.test",
            displayName = "Authz Member",
            accountName = "Authz Member",
            role = MembershipRole.MEMBER,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    @Test
    fun `requireHostAccess returns SessionMeta when caller is HOST on the session's club`() {
        val meta = policy.requireHostAccess(UUID.fromString(SESSION_ID), hostMember())

        assertThat(meta.sessionId).isEqualTo(UUID.fromString(SESSION_ID))
        assertThat(meta.clubId).isEqualTo(UUID.fromString(CLUB_ID))
        assertThat(meta.sessionNumber).isEqualTo(8870)
        assertThat(meta.bookTitle).isEqualTo("AuthZ Book")
        // expectedAuthorNames must come from users.name (not memberships.short_name) so
        // SessionImportService.matchRecord(displayName) matches what the LLM emits.
        assertThat(meta.expectedAuthorNames).containsExactlyInAnyOrder("Authz Host", "Authz Member")
    }

    @Test
    fun `requireHostAccess throws AccessDeniedException when session id is unknown`() {
        val unknownSessionId = UUID.fromString("00000000-0000-0000-0000-000000099999")

        assertThatThrownBy { policy.requireHostAccess(unknownSessionId, hostMember()) }
            .isInstanceOf(AccessDeniedException::class.java)
            .hasMessageContaining("not found")
    }

    @Test
    fun `requireHostAccess throws AccessDeniedException when caller's clubId does not match the session's club`() {
        val otherClubHost = hostMember(clubId = UUID.fromString(OTHER_CLUB_ID))

        assertThatThrownBy { policy.requireHostAccess(UUID.fromString(SESSION_ID), otherClubHost) }
            .isInstanceOf(AccessDeniedException::class.java)
            .hasMessageContaining("Host access")
    }

    @Test
    fun `requireHostAccess throws AccessDeniedException when caller has the MEMBER role`() {
        assertThatThrownBy { policy.requireHostAccess(UUID.fromString(SESSION_ID), memberMember()) }
            .isInstanceOf(AccessDeniedException::class.java)
            .hasMessageContaining("Host access")
    }
}
