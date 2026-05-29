package com.readmates.club.application.service

import com.readmates.auth.application.service.InvitationTokenService
import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.HostOnboardingResultKind
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminEmailDeliveryStatus
import com.readmates.club.application.model.PlatformAdminOnboardingClubInput
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingDomainInput
import com.readmates.club.application.model.PlatformAdminOnboardingHostInput
import com.readmates.club.application.port.out.CreateClubDomainPort
import com.readmates.club.application.port.out.CreateClubDomainResult
import com.readmates.club.application.port.out.CreatePlatformAdminClubCommand
import com.readmates.club.application.port.out.CreatePlatformAdminHostInvitationCommand
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminExistingUser
import com.readmates.club.application.port.out.PlatformAdminOnboardingPort
import com.readmates.club.application.port.out.SendPlatformAdminHostInvitationEmailPort
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.AbstractPlatformTransactionManager
import org.springframework.transaction.support.DefaultTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.OffsetDateTime
import java.util.UUID

@Tag("unit")
class PlatformAdminOnboardingServiceTest {
    @Test
    fun `commit does not send invitation email when domain creation fails`() {
        val ports = FakePlatformAdminOnboardingPorts()
        ports.createDomainResult = CreateClubDomainResult.DuplicateHostname
        val mail = FakePlatformAdminInvitationMail()
        val service = service(ports, mail)

        assertThatThrownBy {
            service.commit(operatorAdmin(), commandWithNewHostAndDomain())
        }.isInstanceOfSatisfying(PlatformAdminException::class.java) {
            assertThat(it.error).isEqualTo(PlatformAdminError.CLUB_DOMAIN_CONFLICT)
        }

        assertThat(mail.sent).isEmpty()
    }

    @Test
    fun `commit sends one invitation email after successful persistence`() {
        val ports = FakePlatformAdminOnboardingPorts()
        val mail = FakePlatformAdminInvitationMail()
        val service = service(ports, mail)

        val result = service.commit(operatorAdmin(), commandWithNewHostAndDomain())

        assertThat(result.hostOnboarding.kind).isEqualTo(HostOnboardingResultKind.INVITATION_CREATED)
        assertThat(result.hostOnboarding.emailDelivery.status).isEqualTo(PlatformAdminEmailDeliveryStatus.SENT)
        assertThat(mail.sent).hasSize(1)
        assertThat(mail.sent.single().email).isEqualTo("host@example.com")
        assertThat(mail.sent.single().acceptUrl).startsWith("https://app.example.com/clubs/new-club/invite/")
    }
}

private class NoOpTransactionManager : AbstractPlatformTransactionManager() {
    override fun doGetTransaction(): Any = Any()

    override fun doBegin(
        transaction: Any,
        definition: TransactionDefinition,
    ) = Unit

    override fun doCommit(status: DefaultTransactionStatus) = Unit

    override fun doRollback(status: DefaultTransactionStatus) = Unit
}

private fun service(
    ports: FakePlatformAdminOnboardingPorts,
    mail: FakePlatformAdminInvitationMail,
): PlatformAdminOnboardingService =
    PlatformAdminOnboardingService(
        onboardingPort = ports,
        loadClubsPort = ports,
        createClubDomainPort = ports,
        sendHostInvitationEmailPort = mail,
        invitationTokenService = InvitationTokenService(),
        transactionTemplate = TransactionTemplate(NoOpTransactionManager()),
        appBaseUrl = "https://app.example.com",
    )

private fun operatorAdmin(): CurrentPlatformAdmin =
    CurrentPlatformAdmin(
        userId = UUID.fromString("00000000-0000-0000-0000-0000000000aa"),
        email = "admin@example.com",
        role = PlatformAdminRole.OPERATOR,
    )

private fun commandWithNewHostAndDomain(): PlatformAdminOnboardingCommand =
    PlatformAdminOnboardingCommand(
        club =
            PlatformAdminOnboardingClubInput(
                name = "New Club",
                slug = "new-club",
                tagline = "A club tagline",
                about = "About this club",
            ),
        firstHost =
            PlatformAdminOnboardingHostInput(
                email = "host@example.com",
                name = "Host User",
            ),
        domain =
            PlatformAdminOnboardingDomainInput(
                hostname = "club.example.com",
                kind = ClubDomainKind.CUSTOM_DOMAIN,
            ),
        existingUserConfirmation = null,
    )

private class FakePlatformAdminInvitationMail : SendPlatformAdminHostInvitationEmailPort {
    data class Sent(
        val email: String,
        val clubName: String,
        val acceptUrl: String,
    )

    val sent = mutableListOf<Sent>()

    override fun send(
        to: String,
        clubName: String,
        acceptUrl: String,
    ) {
        sent += Sent(to, clubName, acceptUrl)
    }
}

private class FakePlatformAdminOnboardingPorts :
    PlatformAdminOnboardingPort,
    LoadPlatformAdminClubsPort,
    CreateClubDomainPort {
    var existingUserByEmail: PlatformAdminExistingUser? = null
    var existingSlugs: MutableSet<String> = mutableSetOf()
    var existingDomainHostnames: MutableSet<String> = mutableSetOf()
    var createDomainResult: CreateClubDomainResult? = null

    val createdClubs = mutableListOf<CreatePlatformAdminClubCommand>()
    val createdInvitations = mutableListOf<CreatePlatformAdminHostInvitationCommand>()
    val upsertedMemberships = mutableListOf<Triple<UUID, UUID, String>>()

    override fun slugExists(slug: String): Boolean = slug in existingSlugs

    override fun domainHostnameExists(hostname: String): Boolean = hostname in existingDomainHostnames

    override fun findUserByEmail(email: String): PlatformAdminExistingUser? = existingUserByEmail

    override fun createClub(command: CreatePlatformAdminClubCommand): UUID {
        createdClubs += command
        return command.clubId
    }

    override fun upsertHostMembership(
        clubId: UUID,
        userId: UUID,
        displayName: String,
    ): UUID {
        upsertedMemberships += Triple(clubId, userId, displayName)
        return UUID.randomUUID()
    }

    override fun createHostInvitation(command: CreatePlatformAdminHostInvitationCommand) {
        createdInvitations += command
    }

    override fun listClubs(limit: Int): List<PlatformAdminClubListItem> = createdClubs.map { toListItem(it) }

    override fun loadClub(clubId: UUID): PlatformAdminClubListItem? =
        createdClubs
            .firstOrNull { it.clubId == clubId }
            ?.let(::toListItem)

    override fun activeHostCount(clubId: UUID): Int = 0

    override fun createClubDomain(
        clubId: UUID,
        hostname: String,
        kind: ClubDomainKind,
        isPrimary: Boolean,
    ): CreateClubDomainResult =
        createDomainResult ?: CreateClubDomainResult.Created(
            domain =
                PlatformAdminClubDomain(
                    id = UUID.randomUUID(),
                    clubId = clubId,
                    hostname = hostname,
                    kind = kind,
                    status = ClubDomainStatus.REQUESTED,
                    isPrimary = isPrimary,
                    verifiedAt = null,
                    lastCheckedAt = OffsetDateTime.now(),
                    errorCode = null,
                ),
        )

    private fun toListItem(command: CreatePlatformAdminClubCommand): PlatformAdminClubListItem =
        PlatformAdminClubListItem(
            clubId = command.clubId,
            slug = command.slug,
            name = command.name,
            tagline = command.tagline,
            about = command.about,
            status = ClubStatus.SETUP_REQUIRED,
            publicVisibility = ClubPublicVisibility.PRIVATE,
            domainCount = 0,
            domainActionRequiredCount = 0,
            notificationFailureCount = 0,
            aiFailureCount = 0,
            firstHostOnboardingState = FirstHostOnboardingState.MISSING,
        )
}
