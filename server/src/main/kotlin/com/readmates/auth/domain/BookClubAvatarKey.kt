package com.readmates.auth.domain

enum class BookClubAvatarKey(
    val wireValue: String,
) {
    READING_LAMP("reading-lamp"),
    OPEN_BOOK_PENCIL("open-book-pencil"),
    BOOK_SPINES("book-spines"),
    BOOKMARK_PAGE("bookmark-page"),
    NOTEBOOK_PEN("notebook-pen"),
    LIBRARY_STAMP("library-stamp"),
    BOOKS_GLASSES("books-glasses"),
    INDEX_CARDS("index-cards"),
    ARCHIVE_BOX("archive-box"),
    ROUND_TABLE_BOOKS("round-table-books"),
    PAIRED_BOOKMARKS("paired-bookmarks"),
    BOOK_DIALOGUE("book-dialogue"),
    QUESTION_CARD("question-card"),
    CALENDAR_BOOK("calendar-book"),
    FEEDBACK_SHEET("feedback-sheet"),
    READING_NOTES("reading-notes"),
    BANDED_BOOK("banded-book"),
    DESK_CLOCK_BOOK("desk-clock-book"),
    BOOK_TOTE("book-tote"),
    DISCUSSION_CIRCLE("discussion-circle"),
    ;

    companion object {
        val ordered: List<BookClubAvatarKey> = entries
        val fallback: BookClubAvatarKey = ARCHIVE_BOX

        fun fromWireValue(value: String?): BookClubAvatarKey? = entries.firstOrNull { it.wireValue == value }
    }
}
