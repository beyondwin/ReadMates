package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.security.AccessDeniedException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class AiGenerationCapabilitiesServiceTest {
    @Test
    fun `reports the operator kill switch without requiring provider beans`() {
        assertThat(service(enabled = false).get("reading-sai", actor()).enabled).isFalse()
        assertThat(service(enabled = true).get("reading-sai", actor()).enabled).isTrue()
    }

    @Test
    fun `requires an active host actor in the requested club`() {
        assertThatThrownBy {
            service(enabled = false).get("reading-sai", actor(isHost = false))
        }.isInstanceOf(AccessDeniedException::class.java)

        assertThatThrownBy {
            service(enabled = false).get("another-club", actor())
        }.isInstanceOf(AccessDeniedException::class.java)
    }

    private fun service(enabled: Boolean) = AiGenerationCapabilitiesService(AiGenerationProperties(enabled = enabled))

    private fun actor(isHost: Boolean = true) =
        AiGenerationActor(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "reading-sai",
            isHost = isHost,
        )
}
