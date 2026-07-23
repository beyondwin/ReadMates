package com.readmates.notification.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.model.HostNotificationPolicy
import com.readmates.notification.application.model.UpdateNotificationPolicyCommand
import com.readmates.notification.application.port.out.NotificationPolicyPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class HostNotificationPolicyServiceTest {
    private val policyPort = FakeNotificationPolicyPort()
    private val service = HostNotificationPolicyService(policyPort)

    @Test
    fun `missing policy defaults reminder to off`() {
        val result = service.get(host())

        assertThat(result).isEqualTo(HostNotificationPolicy(false, null))
    }

    @Test
    fun `host can opt in to session reminders`() {
        val host = host()

        val result = service.update(host, UpdateNotificationPolicyCommand(sessionReminderEnabled = true))

        assertThat(result.sessionReminderEnabled).isTrue()
        assertThat(policyPort.saved)
            .containsExactly(SavedPolicy(host.clubId, host.membershipId, sessionReminderEnabled = true))
    }

    @Test
    fun `member cannot read or update host policy`() {
        val member = host().copy(role = MembershipRole.MEMBER)

        assertThatThrownBy { service.get(member) }
            .isInstanceOf(AccessDeniedException::class.java)
        assertThatThrownBy {
            service.update(member, UpdateNotificationPolicyCommand(sessionReminderEnabled = true))
        }.isInstanceOf(AccessDeniedException::class.java)
        assertThat(policyPort.saved).isEmpty()
    }

    private fun host(): CurrentMember =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "Host",
            accountName = "Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )
}

private data class SavedPolicy(
    val clubId: UUID,
    val membershipId: UUID,
    val sessionReminderEnabled: Boolean,
)

private class FakeNotificationPolicyPort : NotificationPolicyPort {
    private var policy = HostNotificationPolicy(false, null)
    val saved = mutableListOf<SavedPolicy>()

    override fun get(clubId: UUID): HostNotificationPolicy = policy

    override fun save(
        clubId: UUID,
        hostMembershipId: UUID,
        sessionReminderEnabled: Boolean,
    ): HostNotificationPolicy {
        saved += SavedPolicy(clubId, hostMembershipId, sessionReminderEnabled)
        policy = HostNotificationPolicy(sessionReminderEnabled, null)
        return policy
    }
}
