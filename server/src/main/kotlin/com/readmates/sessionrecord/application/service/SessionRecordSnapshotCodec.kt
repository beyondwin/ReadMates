package com.readmates.sessionrecord.application.service

import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.shared.security.Sha256
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class SessionRecordSnapshotCodec(
    private val objectMapper: ObjectMapper,
) {
    fun encode(snapshot: SessionRecordSnapshot): EncodedSessionRecordSnapshot {
        val json = objectMapper.writeValueAsString(snapshot)
        return EncodedSessionRecordSnapshot(
            json = json,
            sha256 = Sha256.hex(json),
        )
    }

    fun decode(json: String): SessionRecordSnapshot {
        val schema = objectMapper.readTree(json).path("schema").asString()
        require(schema == SESSION_RECORD_SCHEMA) {
            "Unsupported session record snapshot schema"
        }
        return objectMapper.readValue(json, SessionRecordSnapshot::class.java)
    }

    private companion object {
        const val SESSION_RECORD_SCHEMA = "readmates-session-record:v1"
    }
}
