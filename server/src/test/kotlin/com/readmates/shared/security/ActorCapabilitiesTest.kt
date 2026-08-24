package com.readmates.shared.security

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.domain.PlatformAdminRole
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID

class ActorCapabilitiesTest {
    @Test
    fun `viewer maps to exactly browse profile and pending approval capabilities`() {
        val actor = currentMember(MembershipRole.MEMBER, MembershipStatus.VIEWER).toClubActor()

        assertThat(actor.capabilities)
            .containsExactlyInAnyOrder(
                ClubCapability.BROWSE_MEMBER_CONTENT,
                ClubCapability.EDIT_OWN_PROFILE,
                ClubCapability.VIEW_PENDING_APPROVAL,
            )
        assertThat(actor.isHost).isFalse()
    }

    @Test
    fun `active member maps to exactly browse and profile capabilities`() {
        val actor = currentMember(MembershipRole.MEMBER, MembershipStatus.ACTIVE).toClubActor()

        assertThat(actor.capabilities)
            .containsExactlyInAnyOrder(
                ClubCapability.BROWSE_MEMBER_CONTENT,
                ClubCapability.EDIT_OWN_PROFILE,
            )
        assertThat(actor.isHost).isFalse()
    }

    @Test
    fun `active host maps to exactly member and host management capabilities`() {
        val actor = currentMember(MembershipRole.HOST, MembershipStatus.ACTIVE).toClubActor()

        assertThat(actor.capabilities)
            .containsExactlyInAnyOrder(
                ClubCapability.BROWSE_MEMBER_CONTENT,
                ClubCapability.EDIT_OWN_PROFILE,
                ClubCapability.MANAGE_INVITATIONS,
                ClubCapability.MANAGE_MEMBERS,
            )
        assertThat(actor.isHost).isTrue()
    }

    @Test
    fun `suspended host maps to exactly browse and profile capabilities without host management`() {
        val actor = currentMember(MembershipRole.HOST, MembershipStatus.SUSPENDED).toClubActor()

        assertThat(actor.capabilities)
            .containsExactlyInAnyOrder(
                ClubCapability.BROWSE_MEMBER_CONTENT,
                ClubCapability.EDIT_OWN_PROFILE,
            )
        assertThat(actor.isHost).isFalse()
    }

    @Test
    fun `invited inactive and left memberships map to no capabilities`() {
        listOf(
            MembershipStatus.INVITED,
            MembershipStatus.INACTIVE,
            MembershipStatus.LEFT,
        ).forEach { status ->
            assertThat(currentMember(MembershipRole.HOST, status).toClubActor().capabilities).isEmpty()
        }
    }

    @Test
    fun `club actor preserves authorization identifiers without profile data`() {
        val actor = currentMember(MembershipRole.HOST, MembershipStatus.ACTIVE).toClubActor()

        assertThat(actor.userId).isEqualTo(USER_ID)
        assertThat(actor.membershipId).isEqualTo(MEMBERSHIP_ID)
        assertThat(actor.clubId).isEqualTo(CLUB_ID)
        assertThat(actor.clubSlug).isEqualTo("actors-club")
    }

    @Test
    fun `owner maps to explicit platform capability allowlist`() {
        val actor = currentPlatformAdmin(PlatformAdminRole.OWNER).toPlatformActor()

        assertThat(actor.capabilities).containsExactlyInAnyOrderElementsOf(OWNER_PLATFORM_CAPABILITIES)
        assertThat(actorSource(CURRENT_PLATFORM_ADMIN_SOURCE)).doesNotContain("PlatformCapability.entries")
    }

    @Test
    fun `operator maps to exactly operational platform capabilities`() {
        val actor = currentPlatformAdmin(PlatformAdminRole.OPERATOR).toPlatformActor()

        assertThat(actor.capabilities).containsExactlyInAnyOrderElementsOf(OPERATOR_PLATFORM_CAPABILITIES)
    }

    @Test
    fun `support maps to exactly platform read capabilities`() {
        val actor = currentPlatformAdmin(PlatformAdminRole.SUPPORT).toPlatformActor()

        assertThat(actor.capabilities).containsExactlyInAnyOrderElementsOf(SUPPORT_PLATFORM_CAPABILITIES)
    }

    @Test
    fun `platform actor capabilities never include club host or member authorities`() {
        PlatformAdminRole.entries.forEach { role ->
            val names =
                currentPlatformAdmin(role)
                    .toPlatformActor()
                    .capabilities
                    .map { it.name }
            assertThat(names).doesNotContainAnyElementsOf(ClubCapability.entries.map { it.name })
        }
    }

    @Test
    fun `actor source contains no framework domain or profile dependencies`() {
        val source = actorSource()

        assertThat(source).doesNotContain("org.springframework")
        assertThat(source).doesNotContain("com.readmates.auth.domain")
        assertThat(source).doesNotContain("com.readmates.club.domain")
        assertThat(source).doesNotContain("email")
        assertThat(source).doesNotContain("accountName")
        assertThat(source).doesNotContain("displayName")
        assertThat(source).doesNotContain("avatar")
        assertThat(source).doesNotContain("role")
        assertThat(source).doesNotContain("status")
    }

    private fun currentMember(
        role: MembershipRole,
        status: MembershipStatus,
    ): CurrentMember =
        CurrentMember(
            userId = USER_ID,
            membershipId = MEMBERSHIP_ID,
            clubId = CLUB_ID,
            clubSlug = "actors-club",
            email = "member@example.test",
            displayName = "Member",
            accountName = "Account Member",
            role = role,
            membershipStatus = status,
        )

    private fun currentPlatformAdmin(role: PlatformAdminRole): CurrentPlatformAdmin =
        CurrentPlatformAdmin(
            userId = USER_ID,
            email = "admin@example.test",
            role = role,
        )

    private fun actorSource(relativePath: String = ACTORS_SOURCE): String =
        listOf(Path.of(relativePath), Path.of("server").resolve(relativePath))
            .first(Files::exists)
            .toFile()
            .readText()

    private companion object {
        val USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        val MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000102")
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000103")
        const val ACTORS_SOURCE = "src/main/kotlin/com/readmates/shared/security/Actors.kt"
        const val CURRENT_PLATFORM_ADMIN_SOURCE =
            "src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt"
        val SHARED_PLATFORM_VIEW_CAPABILITIES =
            setOf(
                PlatformCapability.VIEW_TODAY,
                PlatformCapability.VIEW_CLUBS,
                PlatformCapability.VIEW_CLUB_OPERATIONS,
                PlatformCapability.VIEW_SERVICE_HEALTH,
                PlatformCapability.VIEW_NOTIFICATION_OPERATIONS,
                PlatformCapability.VIEW_AI_OPERATIONS,
                PlatformCapability.VIEW_SUPPORT,
                PlatformCapability.VIEW_AUDIT,
                PlatformCapability.VIEW_ANALYTICS,
            )
        val OPERATOR_PLATFORM_CAPABILITIES =
            SHARED_PLATFORM_VIEW_CAPABILITIES +
                setOf(
                    PlatformCapability.REPLAY_NOTIFICATIONS,
                    PlatformCapability.MANAGE_AI_OPERATIONS,
                    PlatformCapability.VIEW_SENSITIVE_AUDIT,
                    PlatformCapability.EXPORT_ANALYTICS,
                    PlatformCapability.CREATE_CLUB,
                    PlatformCapability.MANAGE_CLUBS,
                    PlatformCapability.MANAGE_CLUB_DOMAINS,
                    PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN,
                )
        val OWNER_PLATFORM_CAPABILITIES =
            OPERATOR_PLATFORM_CAPABILITIES +
                setOf(
                    PlatformCapability.MANAGE_SUPPORT_ACCESS,
                    PlatformCapability.MANAGE_PLATFORM_ADMINS,
                )
        val SUPPORT_PLATFORM_CAPABILITIES = SHARED_PLATFORM_VIEW_CAPABILITIES
    }
}
