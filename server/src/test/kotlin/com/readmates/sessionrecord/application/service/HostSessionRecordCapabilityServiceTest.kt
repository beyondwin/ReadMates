package com.readmates.sessionrecord.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class HostSessionRecordCapabilityServiceTest {
    @Test
    fun `reports drafts true and confirmation false by safe default`() {
        val result = HostSessionRecordCapabilityService(HostActionConfirmationProperties()).capabilities(member())

        assertThat(result.sessionRecordDrafts).isTrue()
        assertThat(result.hostActionNotificationConfirmationRequired).isFalse()
    }

    @Test
    fun `reports staged confirmation true only when configured and rejects members`() {
        val service = HostSessionRecordCapabilityService(HostActionConfirmationProperties(required = true))

        assertThat(service.capabilities(member()).hostActionNotificationConfirmationRequired).isTrue()
        assertThatThrownBy {
            service.capabilities(member(MembershipRole.MEMBER))
        }.isInstanceOf(AccessDeniedException::class.java)
    }

    private fun member(role: MembershipRole = MembershipRole.HOST) =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "capability-test",
            email = "capability@example.test",
            displayName = "Capability",
            accountName = "Capability",
            role = role,
            membershipStatus = MembershipStatus.ACTIVE,
        )
}
