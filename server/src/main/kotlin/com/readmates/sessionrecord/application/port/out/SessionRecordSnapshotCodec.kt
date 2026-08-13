package com.readmates.sessionrecord.application.port.out

import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot

interface SessionRecordSnapshotCodec {
    fun encode(snapshot: SessionRecordSnapshot): EncodedSessionRecordSnapshot

    fun decode(json: String): SessionRecordSnapshot
}
