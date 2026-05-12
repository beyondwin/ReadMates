package com.readmates.shared.security

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class SecretComparatorTest {

    @Test
    fun `firstMatchingIndex returns -1 when no candidate matches`() {
        assertThat(SecretComparator.firstMatchingIndex("nope", listOf("a", "b", "c"))).isEqualTo(-1)
    }

    @Test
    fun `firstMatchingIndex returns the unique index when one candidate matches`() {
        assertThat(SecretComparator.firstMatchingIndex("b", listOf("a", "b", "c"))).isEqualTo(1)
    }

    @Test
    fun `matches returns true exactly when at least one candidate matches`() {
        assertThat(SecretComparator.matches("a", listOf("a"))).isTrue
        assertThat(SecretComparator.matches("z", listOf("a", "b"))).isFalse
    }

    @Test
    fun `empty candidate list returns -1 and matches false`() {
        assertThat(SecretComparator.firstMatchingIndex("x", emptyList())).isEqualTo(-1)
        assertThat(SecretComparator.matches("x", emptyList())).isFalse
    }
}
