package com.readmates.auth.application.port.out

interface AllowedOriginPort {
    fun isAllowed(origin: String): Boolean
}
