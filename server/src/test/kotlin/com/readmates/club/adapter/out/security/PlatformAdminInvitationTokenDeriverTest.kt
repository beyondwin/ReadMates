package com.readmates.club.adapter.out.security

import com.readmates.auth.application.service.InvitationTokenService
import com.readmates.shared.adminmutation.application.model.DigestKeyUnavailableException
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.util.Base64
import java.util.UUID

@Tag("unit")
class PlatformAdminInvitationTokenDeriverTest {
    @Test
    fun `derives the ADR 0041 byte exact token and existing invitation hash`() {
        val deriver =
            PlatformAdminInvitationTokenDeriver(
                AdminCommandIdentityProperties(
                    currentKey = "unit-test-current-key",
                    currentKeyVersion = 7,
                    previousKeyVersion = 6,
                ),
                InvitationTokenService(),
            )

        val derived = deriver.derive(INVITATION_ID, CLUB_ID, 7)
        val rawToken = derived.rawToken.exposeForDelivery()

        assertThat(Base64.getUrlDecoder().decode(rawToken))
            .containsExactly(
                16,
                121,
                99,
                -65,
                -31,
                76,
                105,
                -74,
                25,
                -125,
                126,
                68,
                43,
                -109,
                -61,
                43,
                -115,
                -53,
                107,
                30,
                89,
                92,
                -65,
                -96,
                85,
                -33,
                -61,
                -97,
                -67,
                -105,
                115,
                -71,
            )
        assertThat(rawToken).hasSize(43).matches("^[A-Za-z0-9_-]+$")
        assertThat(derived.tokenHash).isEqualTo(InvitationTokenService().hashToken(rawToken))
        assertThat(derived.rawToken.toString()).isEqualTo("[REDACTED]")
        assertThat(derived.toString()).isEqualTo("[REDACTED]")
    }

    @Test
    fun `selects the pinned previous key and fails closed for an unavailable version`() {
        val deriver =
            PlatformAdminInvitationTokenDeriver(
                AdminCommandIdentityProperties(
                    currentKey = "unit-test-current-key",
                    currentKeyVersion = 7,
                    previousKey = "unit-test-previous-key",
                    previousKeyVersion = 6,
                ),
                InvitationTokenService(),
            )

        val current = deriver.derive(INVITATION_ID, CLUB_ID, 7)
        val previous = deriver.derive(INVITATION_ID, CLUB_ID, 6)

        assertThat(previous.rawToken.exposeForDelivery()).isNotEqualTo(current.rawToken.exposeForDelivery())
        assertThatThrownBy { deriver.derive(INVITATION_ID, CLUB_ID, 5) }
            .isInstanceOf(DigestKeyUnavailableException::class.java)
    }

    private companion object {
        val INVITATION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000111")
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000222")
    }
}
