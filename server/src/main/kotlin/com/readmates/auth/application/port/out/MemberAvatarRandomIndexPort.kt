package com.readmates.auth.application.port.out

fun interface MemberAvatarRandomIndexPort {
    fun nextIndex(boundExclusive: Int): Int
}
