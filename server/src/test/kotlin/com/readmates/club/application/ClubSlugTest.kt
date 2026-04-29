package com.readmates.club.application

import com.readmates.club.application.model.ClubSlug
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class ClubSlugTest {
    @Test
    fun `accepts simple lowercase slug`() {
        val slug = ClubSlug.parse("reading-club")

        assertThat(slug.value).isEqualTo("reading-club")
    }

    @Test
    fun `rejects reserved slug`() {
        assertThatThrownBy { ClubSlug.parse("admin") }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `rejects uppercase slug`() {
        assertThatThrownBy { ClubSlug.parse("Reading") }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `rejects double hyphen slug`() {
        assertThatThrownBy { ClubSlug.parse("reading--club") }
            .isInstanceOf(IllegalArgumentException::class.java)
    }
}
