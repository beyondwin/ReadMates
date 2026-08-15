package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.sessionrecord.application.port.out.SessionRecordApplyStorePort
import com.readmates.sessionrecord.application.port.out.SessionRecordDraftStorePort
import com.readmates.sessionrecord.application.port.out.SessionRecordReadStorePort
import com.readmates.sessionrecord.application.port.out.SessionRecordSnapshotCodec
import com.readmates.sessionrecord.application.port.out.SessionRecordStorePort
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcSessionRecordAdapter private constructor(
    delegates: JdbcSessionRecordDelegates,
) : SessionRecordStorePort by delegates.composite {
    @Autowired
    constructor(
        jdbcTemplate: JdbcTemplate,
        codec: SessionRecordSnapshotCodec,
    ) : this(JdbcSessionRecordDelegates(jdbcTemplate, codec))
}

private class JdbcSessionRecordDelegates(
    jdbcTemplate: JdbcTemplate,
    codec: SessionRecordSnapshotCodec,
) {
    private val rows = SessionRecordPersistenceRows(codec)
    private val readStore = JdbcSessionRecordReadStore(jdbcTemplate, rows)
    private val draftStore = JdbcSessionRecordDraftStore(jdbcTemplate, readStore)
    private val applyStore = JdbcSessionRecordApplyStore(jdbcTemplate, readStore, draftStore, rows)
    val composite = JdbcSessionRecordCompositeStore(readStore, applyStore, draftStore)
}

private class JdbcSessionRecordCompositeStore(
    readStore: SessionRecordReadStorePort,
    applyStore: SessionRecordApplyStorePort,
    draftStore: SessionRecordDraftStorePort,
) : SessionRecordStorePort,
    SessionRecordReadStorePort by readStore,
    SessionRecordApplyStorePort by applyStore,
    SessionRecordDraftStorePort by draftStore
