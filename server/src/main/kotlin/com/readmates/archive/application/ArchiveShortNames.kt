package com.readmates.archive.application

internal fun shortNameFor(displayName: String): String = when (displayName) {
    "김호스트" -> "호스트"
    "안멤버1" -> "멤버1"
    "최멤버2" -> "멤버2"
    "김멤버3" -> "멤버3"
    "송멤버4" -> "멤버4"
    "이멤버5" -> "멤버5"
    else -> displayName
}
