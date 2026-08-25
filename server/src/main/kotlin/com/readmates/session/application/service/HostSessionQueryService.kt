package com.readmates.session.application.service

import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.HostSessionScheduleDefaults
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.session.application.model.HOST_MEETING_LIST_ORDERING_VERSION
import com.readmates.session.application.model.HostListCursorStaleException
import com.readmates.session.application.model.HostMeetingListCursor
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.canonicalize
import com.readmates.session.application.model.usesSignedCursor
import com.readmates.session.application.port.`in`.GetHostDashboardUseCase
import com.readmates.session.application.port.`in`.HostSessionQueryUseCase
import com.readmates.session.application.port.`in`.ListUpcomingSessionsUseCase
import com.readmates.session.application.port.out.HostSessionQueryPort
import com.readmates.session.application.requireHost
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.paging.HostListCursorSigner
import com.readmates.shared.paging.HostListCursorSigningProperties
import com.readmates.shared.paging.InvalidHostListCursorException
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class HostSessionQueryService(
    private val queryPort: HostSessionQueryPort,
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
    private val cursorSigner: HostListCursorSigner =
        HostListCursorSigner(HostListCursorSigningProperties(allowEmptySecret = true)),
    private val cursorSigningProperties: HostListCursorSigningProperties =
        HostListCursorSigningProperties(allowEmptySecret = true),
    private val listReadProbe: ObjectProvider<HostSessionListReadProbe>? = null,
) : HostSessionQueryUseCase,
    ListUpcomingSessionsUseCase,
    GetHostDashboardUseCase {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    @Suppress("ComplexCondition")
    override fun list(
        host: CurrentMember,
        pageRequest: PageRequest,
        query: HostSessionListQuery,
    ): HostSessionListPage {
        if (!query.usesSignedCursor()) {
            return queryPort.list(host, pageRequest, query)
        }
        requireHost(host)
        val canonical = query.canonicalize()
        val epoch = epochPort.load(host.clubId)
        listReadProbe?.ifAvailable { probe -> probe.afterEpochRead() }
        val now = Instant.now()
        val incoming = query.rawCursor?.takeIf(String::isNotBlank)?.let { raw -> decodeCursor(raw, now) }
        if (incoming != null) {
            if (incoming.clubId != host.clubId ||
                incoming.mode != canonical.mode ||
                incoming.states != canonical.states ||
                incoming.fingerprint != canonical.fingerprint ||
                incoming.orderingVersion != HOST_MEETING_LIST_ORDERING_VERSION
            ) {
                throw InvalidHostSessionCursorException()
            }
            if (incoming.epoch != epoch.value(canonical.mode.epochKind)) {
                throw HostListCursorStaleException(incoming.restartTarget())
            }
        }
        val evaluatedAt = incoming?.evaluatedAt ?: now
        val page =
            queryPort.listMode(
                host = host,
                limit = pageRequest.limit,
                query = canonical,
                evaluatedAt = evaluatedAt,
                cursor = incoming?.last,
            )
        val nextCursor =
            if (page.hasMore && page.last != null) {
                val outgoing =
                    HostMeetingListCursor(
                        clubId = host.clubId,
                        mode = canonical.mode,
                        states = canonical.states,
                        fingerprint = canonical.fingerprint,
                        epoch = epoch.value(canonical.mode.epochKind),
                        evaluatedAt = evaluatedAt,
                        expiry = incoming?.expiry ?: now.plus(cursorSigningProperties.ttl),
                        keyVersion = cursorSigningProperties.currentKeyVersion,
                        last = page.last,
                    )
                cursorSigner.sign(outgoing.canonicalJson(), outgoing.keyVersion)
            } else {
                null
            }
        return HostSessionListPage(page.items, nextCursor, page.summary)
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    override fun detail(command: HostSessionIdCommand) = queryPort.detail(command)

    override fun dashboard(host: CurrentMember) = queryPort.dashboard(host)

    override fun upcoming(member: CurrentMember) = queryPort.upcoming(member)

    override fun scheduleDefaults(host: CurrentMember): HostSessionScheduleDefaults {
        requireHost(host)
        return queryPort.scheduleDefaults(host)
    }

    @Suppress("ThrowsCount")
    private fun decodeCursor(
        raw: String,
        now: Instant,
    ): HostMeetingListCursor {
        val verified =
            try {
                cursorSigner.verify(raw)
            } catch (_: InvalidHostListCursorException) {
                throw InvalidHostSessionCursorException()
            }
        val cursor =
            try {
                HostMeetingListCursor.parse(verified.payload)
            } catch (_: RuntimeException) {
                throw InvalidHostSessionCursorException()
            }
        if (cursor.keyVersion != verified.keyVersion) {
            throw InvalidHostSessionCursorException()
        }
        val retiredAfter =
            if (verified.usedPreviousKey) {
                cursor.expiry.plus(cursorSigningProperties.previousKeyRolloutBuffer)
            } else {
                cursor.expiry
            }
        if (verified.usedPreviousKey && now.isAfter(retiredAfter)) {
            throw InvalidHostSessionCursorException()
        }
        if (now.isAfter(cursor.expiry)) {
            throw HostListCursorStaleException(cursor.restartTarget())
        }
        return cursor
    }
}
