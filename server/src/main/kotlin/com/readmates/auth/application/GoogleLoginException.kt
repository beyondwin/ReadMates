package com.readmates.auth.application

class GoogleLoginException(
    message: String,
    val redirectError: String = "google",
) : RuntimeException(message)
