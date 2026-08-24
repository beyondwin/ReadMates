package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.InvalidHostSessionCursorException
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

internal fun invalidCursor(): Nothing = throw InvalidHostSessionCursorException()

internal fun HostSessionListQuery.normalized() =
    copy(
        search = search?.trim()?.lowercase()?.takeIf(String::isNotBlank),
        state = state?.trim()?.uppercase()?.takeIf(String::isNotBlank),
    )

internal fun HostSessionListQuery.fingerprint(orderingVersion: String? = null): String {
    val parts =
        buildList {
            add(search.orEmpty())
            add(state.orEmpty())
            add(recordStatus?.name.orEmpty())
            add(needsAttention?.toString().orEmpty())
            if (orderingVersion != null) add(orderingVersion)
        }
    return MessageDigest
        .getInstance("SHA-256")
        .digest(parts.joinToString("\u0000").toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}
