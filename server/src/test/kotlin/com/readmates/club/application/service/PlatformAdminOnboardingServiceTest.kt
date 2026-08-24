package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.FirstHostPreviewKind
import com.readmates.club.application.model.PlatformAdminOnboardingClubInput
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingDomainInput
import com.readmates.club.application.model.PlatformAdminOnboardingHostInput
import com.readmates.club.application.port.out.DerivePlatformAdminHostInvitationTokenPort
import com.readmates.club.application.port.out.PlatformAdminOnboardingCommandPort
import com.readmates.club.application.port.out.SendPlatformAdminHostInvitationEmailPort
import com.readmates.club.application.port.out.TransientPlatformAdminHostInvitationMail
import com.readmates.club.domain.ClubDomainKind
import com.readmates.notification.application.config.NotificationRuntimeProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.util.UUID

@Tag("unit")
class PlatformAdminOnboardingServiceTest {
    @Test
    fun `canonical onboarding normalizes all identity fields and binds the confirmation`() {
        val normalized = PlatformAdminOnboardingPolicy.normalize(command())
        val request =
            PlatformAdminOnboardingPolicy.request(
                PREVIEW_ID,
                normalized,
                FirstHostPreviewKind.EXISTING_USER,
            )

        assertThat(normalized.club.slug).isEqualTo("new-club")
        assertThat(normalized.firstHost.email).isEqualTo("host@example.test")
        assertThat(normalized.domain?.hostname).isEqualTo("club.example.test")
        assertThat(request.canonicalFields())
            .contains(
                "previewId" to PREVIEW_ID.toString(),
                "existingUserConfirmation" to "ASSIGN_EXISTING_USER_AS_HOST",
                "firstHostEmail" to "host@example.test",
            )
    }

    @Test
    fun `canonical onboarding rejects unsafe hostnames before persistence`() {
        val unsafe =
            command().copy(
                domain = PlatformAdminOnboardingDomainInput("https://internal.test", ClubDomainKind.CUSTOM_DOMAIN),
            )

        assertThatThrownBy { PlatformAdminOnboardingPolicy.normalize(unsafe) }
            .isInstanceOf(PlatformAdminException::class.java)
    }

    @Test
    fun `canonical onboarding accepts exact persistence boundaries`() {
        val commands =
            listOf(
                command().copy(club = command().club.copy(name = "n".repeat(120))),
                command().copy(club = command().club.copy(tagline = "t".repeat(255))),
                command().copy(firstHost = command().firstHost.copy(name = "h".repeat(120))),
                command().copy(firstHost = command().firstHost.copy(email = "e".repeat(307) + "@example.test")),
                command().copy(club = command().club.copy(about = "a".repeat(65_535))),
            )

        commands.forEach { candidate ->
            assertThatCode { PlatformAdminOnboardingPolicy.normalize(candidate) }.doesNotThrowAnyException()
        }
    }

    @Test
    fun `canonical onboarding rejects values beyond persistence boundaries`() {
        val commands =
            listOf(
                command().copy(club = command().club.copy(name = "n".repeat(121))),
                command().copy(club = command().club.copy(tagline = "t".repeat(256))),
                command().copy(firstHost = command().firstHost.copy(name = "h".repeat(121))),
                command().copy(firstHost = command().firstHost.copy(email = "e".repeat(308) + "@example.test")),
                command().copy(club = command().club.copy(about = "a".repeat(65_536))),
            )

        commands.forEach { candidate ->
            assertThatThrownBy { PlatformAdminOnboardingPolicy.normalize(candidate) }
                .isInstanceOf(PlatformAdminException::class.java)
        }
    }

    @Test
    fun `canonical onboarding rejects line and control characters from single line fields`() {
        val commands =
            listOf(
                command().copy(club = command().club.copy(name = "New\rClub")),
                command().copy(club = command().club.copy(name = "New\nClub")),
                command().copy(club = command().club.copy(name = "New\u2028Club")),
                command().copy(club = command().club.copy(tagline = "Tag\u0000line")),
                command().copy(firstHost = command().firstHost.copy(name = "First\u007fHost")),
                command().copy(firstHost = command().firstHost.copy(email = "host\u0000@example.test")),
            )

        commands.forEach { candidate ->
            assertThatThrownBy { PlatformAdminOnboardingPolicy.normalize(candidate) }
                .isInstanceOf(PlatformAdminException::class.java)
        }
    }

    @Test
    fun `canonical onboarding bounds about by utf8 bytes while allowing line feeds`() {
        val exact = command().copy(club = command().club.copy(about = "가".repeat(21_845)))
        val oversized = command().copy(club = command().club.copy(about = "가".repeat(21_846)))
        val multiline = command().copy(club = command().club.copy(about = "First line\nSecond line"))

        assertThatCode { PlatformAdminOnboardingPolicy.normalize(exact) }.doesNotThrowAnyException()
        assertThatCode { PlatformAdminOnboardingPolicy.normalize(multiline) }.doesNotThrowAnyException()
        assertThatThrownBy { PlatformAdminOnboardingPolicy.normalize(oversized) }
            .isInstanceOf(PlatformAdminException::class.java)
    }

    @Test
    fun `transient invitation mail never renders recipient or capability`() {
        val mail =
            TransientPlatformAdminHostInvitationMail(
                to = "recipient@example.test",
                clubName = "Synthetic Club",
                acceptUrl = "https://example.test/invite/not-a-real-capability",
            )

        assertThat(mail.toString()).isEqualTo("[REDACTED]")
    }

    @Test
    fun `disabled notification worker never claims invitation convergence`() {
        val commandPort = mock(PlatformAdminOnboardingCommandPort::class.java)
        val service = worker(commandPort, NotificationRuntimeProperties(enabled = false))

        assertThat(service.processOne()).isFalse()
        verifyNoInteractions(commandPort)
    }

    @Test
    fun `notification retry delays are validated before the onboarding worker is constructed`() {
        assertThatThrownBy {
            val properties =
                NotificationRuntimeProperties(
                    enabled = false,
                    worker =
                        NotificationRuntimeProperties.Worker(
                            retryDelays = listOf(Duration.ofMinutes(1), Duration.ofMinutes(2)),
                        ),
                    kafka =
                        NotificationRuntimeProperties.Kafka(
                            maxPublishAttempts = 3,
                            maxDeliveryAttempts = 5,
                        ),
                )
            worker(mock(PlatformAdminOnboardingCommandPort::class.java), properties)
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("delivery observation")
    }

    private fun worker(
        commandPort: PlatformAdminOnboardingCommandPort,
        properties: NotificationRuntimeProperties,
    ) = PlatformAdminHostInvitationConvergenceService(
        commandPort = commandPort,
        tokenDeriver = mock(DerivePlatformAdminHostInvitationTokenPort::class.java),
        mailPort = mock(SendPlatformAdminHostInvitationEmailPort::class.java),
        transactions = mock(TransactionTemplate::class.java),
        clock = Clock.systemUTC(),
        deliveryPolicy = properties,
        appBaseUrl = "https://example.test",
    )

    private fun command() =
        PlatformAdminOnboardingCommand(
            club = PlatformAdminOnboardingClubInput(" New Club ", " New-Club ", " Tagline ", " About "),
            firstHost = PlatformAdminOnboardingHostInput(" HOST@EXAMPLE.TEST ", " Host "),
            domain = PlatformAdminOnboardingDomainInput(" CLUB.EXAMPLE.TEST. ", ClubDomainKind.CUSTOM_DOMAIN),
            existingUserConfirmation = null,
        )

    private companion object {
        val PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
    }
}
