package com.readmates.sessionrecord.adapter.out.codec

import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.sessionrecord.application.port.out.SessionRecordSnapshotCodec
import com.readmates.shared.security.Sha256
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class JacksonSessionRecordSnapshotCodec(
    private val objectMapper: ObjectMapper,
) : SessionRecordSnapshotCodec {
    override fun encode(snapshot: SessionRecordSnapshot): EncodedSessionRecordSnapshot {
        val json = objectMapper.writeValueAsString(snapshot)
        return EncodedSessionRecordSnapshot(
            json = json,
            sha256 = Sha256.hex(json),
        )
    }

    override fun decode(json: String): SessionRecordSnapshot {
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
