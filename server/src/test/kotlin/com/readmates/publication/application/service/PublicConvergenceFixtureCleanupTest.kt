package com.readmates.publication.application.service

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.Test

class PublicConvergenceFixtureCleanupTest {
    @Test
    fun `restore runs after cleanup failure and both failures remain observable`() {
        var restoreCalled = false

        val failure =
            catchThrowable {
                runFixtureCleanup(
                    deleteOwnedRows = { error("delete failed") },
                    restoreSuspendedRows = {
                        restoreCalled = true
                        error("restore failed")
                    },
                )
            }

        assertThat(failure)
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("delete failed")
        assertThat(failure.suppressed.map { it.message }).containsExactly("restore failed")

        assertThat(restoreCalled).isTrue()
    }
}
