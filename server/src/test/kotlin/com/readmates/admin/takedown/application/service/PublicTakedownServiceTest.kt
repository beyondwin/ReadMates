package com.readmates.admin.takedown.application.service

import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PreviewPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownIdempotencyScope
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReasonCategory
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import com.readmates.admin.takedown.application.model.PublicTakedownRequestIdentity
import com.readmates.admin.takedown.application.model.PublicTakedownTarget
import com.readmates.admin.takedown.application.port.out.PublicTakedownActivationEvidencePort
import com.readmates.admin.takedown.application.port.out.PublicTakedownPort
import com.readmates.admin.takedown.application.port.out.StorePublicTakedownCommand
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class PublicTakedownServiceTest {
    private val port = FakePublicTakedownPort()
    private val service =
        PublicTakedownService(
            port,
            PublicTakedownActivationEvidencePort { true },
            MutationIdempotencyProperties(currentKey = "test-current-key", currentKeyVersion = 1),
            Clock.fixed(Instant.parse("2026-08-24T00:00:00Z"), ZoneOffset.UTC),
        )

    @Test
    fun `preview binds the exact ten minute expiry and current surfaces`() {
        val preview = service.preview(owner(), "OWNER", previewCommand())

        assertThat(preview.expiresAt).isEqualTo(Instant.parse("2026-08-24T00:10:00Z"))
        assertThat(preview.targetGeneration).isEqualTo(7)
        assertThat(preview.currentSurfaces)
            .containsExactlyInAnyOrder("ORIGIN", "BFF_CACHE", "CDN_CACHE", "BROWSER_CACHE")
    }

    @Test
    fun `preview actor mismatch fails closed before activation mutation`() {
        val preview = service.preview(owner(), "OWNER", previewCommand())

        assertThatThrownBy {
            service.confirm(operator(), "OPERATOR", confirmCommand(preview.previewId))
        }.isInstanceOf(PublicTakedownException::class.java)
            .extracting("error")
            .isEqualTo(PublicTakedownError.PREVIEW_ACTOR_MISMATCH)
    }

    @Test
    fun `current surfaces mismatch fails closed before activation mutation`() {
        val preview = service.preview(owner(), "OWNER", previewCommand())
        port.target = port.target.copy(currentSurfaces = setOf("ORIGIN"))

        assertThatThrownBy {
            service.confirm(owner(), "OWNER", confirmCommand(preview.previewId))
        }.isInstanceOf(PublicTakedownException::class.java)
            .extracting("error")
            .isEqualTo(PublicTakedownError.SURFACES_MISMATCH)
    }

    private fun previewCommand() = PreviewPublicTakedownCommand(CLUB_ID, SESSION_ID, PUBLICATION_ID)

    private fun confirmCommand(previewId: UUID) =
        ConfirmPublicTakedownCommand(
            previewId,
            PublicTakedownReasonCategory.PRIVATE_DATA,
            "Synthetic reason",
            "safe-test-key-0001",
        )

    private fun owner() = actor(OWNER_ID)

    private fun operator() = actor(OPERATOR_ID)

    private fun actor(id: UUID) =
        PlatformActor(
            id,
            com.readmates.club.domain.PlatformAdminRole.OPERATOR,
            setOf(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN),
        )
}

private class FakePublicTakedownPort : PublicTakedownPort {
    var target =
        PublicTakedownTarget(
            CLUB_ID,
            SESSION_ID,
            PUBLICATION_ID,
            generation = 7,
            originReadable = true,
            currentSurfaces = setOf("ORIGIN", "BFF_CACHE", "CDN_CACHE", "BROWSER_CACHE"),
        )
    private var preview: PublicTakedownPreview? = null

    override fun loadTarget(
        clubId: UUID,
        sessionId: UUID,
        publicationId: UUID,
    ) = target

    override fun savePreview(preview: PublicTakedownPreview) {
        this.preview = preview
    }

    override fun loadPreview(previewId: UUID) = preview?.takeIf { it.previewId == previewId }

    override fun loadReplay(
        scope: PublicTakedownIdempotencyScope,
        identity: PublicTakedownRequestIdentity,
    ) = PublicTakedownPort.ReplayResult.Missing

    override fun confirmNew(command: StorePublicTakedownCommand): PublicTakedownReceipt =
        error("confirmNew must not run for mismatch tests")
}

private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000d551")
private val PUBLICATION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000d552")
private val OWNER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000901")
private val OPERATOR_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000902")
