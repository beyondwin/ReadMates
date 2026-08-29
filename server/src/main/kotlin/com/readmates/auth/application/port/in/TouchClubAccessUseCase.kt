@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.model.ClubAccessResult
import com.readmates.auth.application.model.TouchClubAccessCommand

fun interface TouchClubAccessUseCase {
    fun touch(command: TouchClubAccessCommand): ClubAccessResult
}
