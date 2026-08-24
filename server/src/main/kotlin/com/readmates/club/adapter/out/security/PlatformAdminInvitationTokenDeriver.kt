package com.readmates.club.adapter.out.security

import com.readmates.auth.application.service.InvitationTokenService
import com.readmates.club.application.port.out.DerivePlatformAdminHostInvitationTokenPort
import com.readmates.club.application.port.out.DerivedPlatformAdminHostInvitationToken
import com.readmates.club.application.port.out.TransientPlatformAdminInvitationToken
import com.readmates.shared.adminmutation.application.model.DigestKeyUnavailableException
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Component
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.UUID

@Component
class PlatformAdminInvitationTokenDeriver(
    private val identityProperties: AdminCommandIdentityProperties,
    private val invitationTokenService: InvitationTokenService,
) : DerivePlatformAdminHostInvitationTokenPort {
    override fun derive(
        invitationId: UUID,
        clubId: UUID,
        digestKeyVersion: Int,
    ): DerivedPlatformAdminHostInvitationToken {
        val key = identityProperties.keyBytes(digestKeyVersion) ?: throw DigestKeyUnavailableException()
        val tokenBytes =
            RequestIdentityHmac.hmac(
                key,
                encode(invitationId, clubId),
                HOST_INVITATION_TOKEN_PURPOSE,
            )
        val rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes)
        return DerivedPlatformAdminHostInvitationToken(
            rawToken = TransientPlatformAdminInvitationToken(rawToken),
            tokenHash = invitationTokenService.hashToken(rawToken),
        )
    }

    private fun encode(
        invitationId: UUID,
        clubId: UUID,
    ): ByteArray =
        ByteArrayOutputStream().use { output ->
            output.writeLengthPrefixed(invitationId.toString())
            output.writeLengthPrefixed(clubId.toString())
            output.toByteArray()
        }

    private fun ByteArrayOutputStream.writeLengthPrefixed(value: String) {
        val bytes = value.toByteArray(StandardCharsets.US_ASCII)
        write(
            ByteBuffer
                .allocate(Int.SIZE_BYTES)
                .order(ByteOrder.BIG_ENDIAN)
                .putInt(bytes.size)
                .array(),
        )
        write(bytes)
    }

    private companion object {
        const val HOST_INVITATION_TOKEN_PURPOSE = "readmates:platform-admin-host-invitation-token:v1"
    }
}
