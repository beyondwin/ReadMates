package com.readmates.auth.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class BookClubAvatarKeyTest {
    @Test
    fun `catalog contains exactly the fixed frontend wire set`() {
        val expectedWireValues =
            listOf(
                "globe-notebook",
                "mushroom-green-book",
                "lemon-green-book",
                "pudding-notebook",
                "peach-green-book",
                "radish-notebook",
                "apple-green-book",
                "sailboat-green-book",
                "palette-green-book",
                "balloon-green-book",
                "dumpling-notebook",
                "tulip-notebook",
                "cheese-green-book",
                "starfish-notebook",
                "banana-green-book",
                "milk-green-book",
                "cloud-green-book",
                "teacup-green-book",
                "toast-brown-book",
                "snowglobe-green-book",
                "cherries-notebook",
                "envelope-notebook",
                "bell-notebook",
                "teacup-notebook",
                "candle-green-book",
                "sun-green-book",
                "teapot-green-book",
                "sheep-notebook",
                "moon-green-book",
                "star-notebook",
            )

        assertEquals(30, BookClubAvatarKey.ordered.size)
        assertEquals(
            30,
            BookClubAvatarKey.ordered
                .map { it.wireValue }
                .toSet()
                .size,
        )
        assertEquals(expectedWireValues, BookClubAvatarKey.ordered.map { it.wireValue })
        assertEquals("cloud-green-book", BookClubAvatarKey.fallback.wireValue)
        assertNull(BookClubAvatarKey.fromWireValue("hedgehog-green-book"))
        assertNull(BookClubAvatarKey.fromWireValue("../cloud-green-book"))
    }
}
