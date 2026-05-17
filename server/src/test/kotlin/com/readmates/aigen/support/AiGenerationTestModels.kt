package com.readmates.aigen.support

/**
 * Canonical model IDs that the AI session-generation tests should reference.
 *
 * Production model IDs live in `application.yml` under
 * `readmates.aigen.pricing.*`. These constants mirror that allowlist so that
 * swapping a provider's default for a newer release is a one-line change here
 * (and matching `application.yml` pricing key), instead of editing scattered
 * hardcoded strings across every test fixture.
 */
object AiGenerationTestModels {
    const val CLAUDE_DEFAULT: String = "claude-sonnet-4-6"
    const val OPENAI_DEFAULT: String = "gpt-5.4-mini"
    const val GEMINI_DEFAULT: String = "gemini-3-flash"
}
