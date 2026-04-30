package com.readmates.auth.application.port.out

interface TrustedReturnHostPort {
    fun activeClubSlugForHost(host: String): String?
}
