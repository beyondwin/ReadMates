package com.readmates.note.adapter.out.redis

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.note.application.port.out.NotesReadCachePort
import org.springframework.context.annotation.Condition
import org.springframework.context.annotation.ConditionContext
import org.springframework.context.annotation.Conditional
import org.springframework.core.type.AnnotatedTypeMetadata
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@Conditional(NoopNotesReadCacheCondition::class)
class NoopNotesReadCacheAdapter : NotesReadCachePort {
    override fun getFeed(clubId: UUID): List<NoteFeedResult>? = null

    override fun putFeed(clubId: UUID, result: List<NoteFeedResult>) = Unit

    override fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>? = null

    override fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>) = Unit

    override fun getSessions(clubId: UUID): List<NoteSessionResult>? = null

    override fun putSessions(clubId: UUID, result: List<NoteSessionResult>) = Unit
}

private class NoopNotesReadCacheCondition : Condition {
    override fun matches(context: ConditionContext, metadata: AnnotatedTypeMetadata): Boolean {
        val redisEnabled = context.environment.getProperty("readmates.redis.enabled", Boolean::class.java, false)
        val notesCacheEnabled = context.environment.getProperty("readmates.notes-cache.enabled", Boolean::class.java, false)

        return !redisEnabled || !notesCacheEnabled
    }
}
