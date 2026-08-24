package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.PlatformAdminOnboardingCommand

private const val CLUB_NAME_MAX_LENGTH = 120
private const val CLUB_TAGLINE_MAX_LENGTH = 255
private const val FIRST_HOST_NAME_MAX_LENGTH = 120
private const val FIRST_HOST_EMAIL_MAX_LENGTH = 320
private const val CLUB_ABOUT_MAX_UTF8_BYTES = 65_535

internal fun validateOnboardingRawText(command: PlatformAdminOnboardingCommand) {
    val singleLineValues =
        listOf(
            command.club.name,
            command.club.tagline,
            command.firstHost.name,
            command.firstHost.email,
        )
    if (
        singleLineValues.any(String::hasLineOrControlCharacter) ||
        normalizeOnboardingAbout(command.club.about).hasForbiddenMultilineControl()
    ) {
        rejectOnboardingText()
    }
}

internal fun validateNormalizedOnboardingText(
    clubName: String,
    tagline: String,
    about: String,
    firstHostName: String,
    firstHostEmail: String,
) {
    val boundedSingleLineValues =
        listOf(
            clubName to CLUB_NAME_MAX_LENGTH,
            tagline to CLUB_TAGLINE_MAX_LENGTH,
            firstHostName to FIRST_HOST_NAME_MAX_LENGTH,
            firstHostEmail to FIRST_HOST_EMAIL_MAX_LENGTH,
        )
    if (
        boundedSingleLineValues.any { (value, maxLength) ->
            value.codePointCount(0, value.length) > maxLength || value.hasLineOrControlCharacter()
        } ||
        about.toByteArray(Charsets.UTF_8).size > CLUB_ABOUT_MAX_UTF8_BYTES ||
        about.hasForbiddenMultilineControl()
    ) {
        rejectOnboardingText()
    }
}

internal fun normalizeOnboardingAbout(value: String): String = value.replace("\r\n", "\n").replace('\r', '\n')

private fun String.hasLineOrControlCharacter(): Boolean =
    any { character ->
        character.isISOControl() || character == '\u2028' || character == '\u2029'
    }

private fun String.hasForbiddenMultilineControl(): Boolean =
    any { character ->
        (character.isISOControl() && character != '\n') || character == '\u2028' || character == '\u2029'
    }

private fun rejectOnboardingText(): Nothing =
    throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, PlatformAdminError.INVALID_CLUB.name)
