package com.readmates.club.api

import com.readmates.club.adapter.`in`.web.PlatformAdminErrorHandler
import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource

class PlatformAdminErrorHandlerTest {
    private val handler = PlatformAdminErrorHandler()

    @ParameterizedTest
    @EnumSource(
        value = PlatformAdminError::class,
        names = [
            "REVISION_CONFLICT",
            "PREVIEW_EXPIRED",
            "PREVIEW_CONSUMED",
            "IDEMPOTENCY_CONFLICT",
            "COMMAND_IN_PROGRESS",
        ],
    )
    fun `safe command conflicts expose the common coded error envelope`(error: PlatformAdminError) {
        val response = handler.handlePlatformAdminException(PlatformAdminException(error, "private diagnostic"))

        assertThat(response.statusCode.value()).isEqualTo(409)
        assertThat(response.body?.code).isEqualTo(error.name)
        assertThat(response.body?.message).doesNotContain("private diagnostic")
        assertThat(response.body?.status).isEqualTo(409)
    }

    @Test
    fun `invalid idempotency key exposes coded bad request`() {
        val response =
            handler.handlePlatformAdminException(
                PlatformAdminException(PlatformAdminError.INVALID_IDEMPOTENCY_KEY, "private diagnostic"),
            )

        assertThat(response.statusCode.value()).isEqualTo(400)
        assertThat(response.body?.code).isEqualTo("INVALID_IDEMPOTENCY_KEY")
        assertThat(response.body?.message).doesNotContain("private diagnostic")
    }
}
