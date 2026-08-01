package com.readmates.auth.domain

enum class BookClubAvatarKey(
    val wireValue: String,
) {
    HEDGEHOG_GREEN_BOOK("hedgehog-green-book"),
    SQUIRREL_ACORN("squirrel-acorn"),
    DEER_BROWN_BOOK("deer-brown-book"),
    FOX_GLASSES_MUG("fox-glasses-mug"),
    KOALA_BOOK_SPRIG("koala-book-sprig"),
    POLAR_BEAR_SNOWFLAKE_MUG("polar-bear-snowflake-mug"),
    PENGUIN_BERET_BOOK("penguin-beret-book"),
    CAT_FLOWER_MUG("cat-flower-mug"),
    ALPACA_WINTER_SPRIG("alpaca-winter-sprig"),
    SQUIRREL_GREEN_BOOK("squirrel-green-book"),
    PENGUIN_ORANGE_MUG("penguin-orange-mug"),
    PANDA_GREEN_BOOK("panda-green-book"),
    MOUSE_BLUE_BOOK("mouse-blue-book"),
    TURTLE_WINTER_BOOK("turtle-winter-book"),
    LADYBUG_GREEN_BOOK("ladybug-green-book"),
    SNAIL_GREEN_BOOK("snail-green-book"),
    SLOTH_ORANGE_MUG("sloth-orange-mug"),
    ALPACA_BROWN_BOOK("alpaca-brown-book"),
    FENNEC_HEART_MUG("fennec-heart-mug"),
    HEDGEHOG_GLASSES_BOOK("hedgehog-glasses-book"),
    SQUIRREL_AUTUMN_BOOK("squirrel-autumn-book"),
    PENGUIN_HEART_MUG("penguin-heart-mug"),
    DEER_PLAID_BOOK("deer-plaid-book"),
    ALPACA_HEART_MUG("alpaca-heart-mug"),
    TURTLE_GLASSES_BOOK("turtle-glasses-book"),
    OWL_BERET_BOOK("owl-beret-book"),
    BEAR_GREEN_BOOK("bear-green-book"),
    RABBIT_BROWN_BOOK("rabbit-brown-book"),
    CAT_HEART_MUG("cat-heart-mug"),
    DOG_GREEN_BOOK("dog-green-book"),
    CHICK_BERET_BOOK("chick-beret-book"),
    DUCK_GREEN_MUG("duck-green-mug"),
    HAMSTER_GREEN_BOOK("hamster-green-book"),
    RED_PANDA_ORANGE_MUG("red-panda-orange-mug"),
    SHEEP_BROWN_BOOK("sheep-brown-book"),
    FOX_SIDE_BOOK("fox-side-book"),
    WINTER_BIRD("winter-bird"),
    MALLARD_ORANGE_MUG("mallard-orange-mug"),
    OWL_GLASSES_BOOK("owl-glasses-book"),
    HEDGEHOG_GREEN_MUG("hedgehog-green-mug"),
    ;

    companion object {
        val ordered = entries.toList()
        val fallback = HEDGEHOG_GREEN_BOOK

        fun fromWireValue(value: String?): BookClubAvatarKey? = entries.firstOrNull { it.wireValue == value }
    }
}
