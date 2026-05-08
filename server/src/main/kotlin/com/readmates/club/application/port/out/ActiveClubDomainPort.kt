package com.readmates.club.application.port.out

interface ActiveClubDomainPort {
    fun isActiveOrigin(origin: String): Boolean
}
