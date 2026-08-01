package com.readmates.auth.adapter.out.random

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class ThreadLocalMemberAvatarRandomIndexAdapterTest {
    private val adapter = ThreadLocalMemberAvatarRandomIndexAdapter()

    @Test
    fun `returns an index within every supported bound`() {
        listOf(1, 2, 40).forEach { bound ->
            repeat(100) {
                assertThat(adapter.nextIndex(bound)).isGreaterThanOrEqualTo(0).isLessThan(bound)
            }
        }
    }

    @Test
    fun `rejects zero bound`() {
        assertThatThrownBy { adapter.nextIndex(0) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("boundExclusive must be positive")
    }

    @Test
    fun `rejects negative bound`() {
        assertThatThrownBy { adapter.nextIndex(-1) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("boundExclusive must be positive")
    }
}
