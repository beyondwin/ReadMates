package com.readmates.browse.application

sealed class GuestBrowseInvalidRequestException(
    message: String,
) : IllegalArgumentException(message)
