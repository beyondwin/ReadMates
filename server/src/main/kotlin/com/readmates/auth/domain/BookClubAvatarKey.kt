package com.readmates.auth.domain

enum class BookClubAvatarKey(
    val wireValue: String,
) {
    GLOBE_NOTEBOOK("globe-notebook"),
    MUSHROOM_GREEN_BOOK("mushroom-green-book"),
    LEMON_GREEN_BOOK("lemon-green-book"),
    PUDDING_NOTEBOOK("pudding-notebook"),
    PEACH_GREEN_BOOK("peach-green-book"),
    RADISH_NOTEBOOK("radish-notebook"),
    APPLE_GREEN_BOOK("apple-green-book"),
    SAILBOAT_GREEN_BOOK("sailboat-green-book"),
    PALETTE_GREEN_BOOK("palette-green-book"),
    BALLOON_GREEN_BOOK("balloon-green-book"),
    DUMPLING_NOTEBOOK("dumpling-notebook"),
    TULIP_NOTEBOOK("tulip-notebook"),
    CHEESE_GREEN_BOOK("cheese-green-book"),
    STARFISH_NOTEBOOK("starfish-notebook"),
    BANANA_GREEN_BOOK("banana-green-book"),
    MILK_GREEN_BOOK("milk-green-book"),
    CLOUD_GREEN_BOOK("cloud-green-book"),
    TEACUP_GREEN_BOOK("teacup-green-book"),
    TOAST_BROWN_BOOK("toast-brown-book"),
    SNOWGLOBE_GREEN_BOOK("snowglobe-green-book"),
    CHERRIES_NOTEBOOK("cherries-notebook"),
    ENVELOPE_NOTEBOOK("envelope-notebook"),
    BELL_NOTEBOOK("bell-notebook"),
    TEACUP_NOTEBOOK("teacup-notebook"),
    CANDLE_GREEN_BOOK("candle-green-book"),
    SUN_GREEN_BOOK("sun-green-book"),
    TEAPOT_GREEN_BOOK("teapot-green-book"),
    SHEEP_NOTEBOOK("sheep-notebook"),
    MOON_GREEN_BOOK("moon-green-book"),
    STAR_NOTEBOOK("star-notebook"),
    ;

    companion object {
        val ordered = entries.toList()
        val fallback = CLOUD_GREEN_BOOK

        fun fromWireValue(value: String?): BookClubAvatarKey? = entries.firstOrNull { it.wireValue == value }
    }
}
