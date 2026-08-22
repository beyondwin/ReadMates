package com.readmates.session.api

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.session.application.HostListEpochInventory
import com.readmates.session.application.service.HostSessionListReadProbe
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.paging.HostListCursorSigner
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.fail
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import tools.jackson.databind.JsonNode
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.security.host-list-cursor.current-key=test-host-list-cursor-current-key",
        "readmates.security.host-list-cursor.current-key-version=1",
        "readmates.security.host-list-cursor.previous-key=test-host-list-cursor-previous-key",
        "readmates.security.host-list-cursor.previous-key-version=0",
        "readmates.security.host-list-cursor.allow-empty-secret=true",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_LIST_CURSOR_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_LIST_CURSOR_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionListCursorDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val cursorSigner: HostListCursorSigner,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val jsonMapper =
        tools.jackson.databind.json.JsonMapper
            .builder()
            .findAndAddModules()
            .build()

    @BeforeEach
    fun wipeGeneratedSessions() {
        cleanupGenerated()
    }

    @Test
    fun `mode states and state are mutually exclusive and states are canonicalized`() {
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "meeting")
                param("state", "DRAFT")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
            }
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "meeting")
                param("states", "DRAFT")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
            }
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("state", "DRAFT")
                param("states", "OPEN")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
            }
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("states", "DRAFT")
                param("states", "DRAFT")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
            }
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("states", "DRAFT")
                param("states", "CLOSED")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
            }
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("states", "OPEN")
                param("states", "DRAFT")
            }.andExpect { status { isOk() } }
    }

    @Test
    fun `meeting mode orders by attention date state number and id without mixing records`() {
        val openLater = createInState("열린 나중", "OPEN", "2026-10-02")
        val openEarlier = createInState("열린 이전", "OPEN", "2026-09-02")
        val draftDated = createInState("초안 날짜", "DRAFT", "2026-09-03")
        val draftNull = createInState("초안 없음", "DRAFT", "2099-12-31")
        val closed = createInState("기록 제외", "CLOSED", "2026-09-01")
        trash(createInState("휴지통 제외", "DRAFT", "2026-08-01"))

        val ids = listSessions("meeting")
        assertThat(ids).containsExactly(openEarlier, openLater, draftDated, draftNull)
        assertThat(ids).doesNotContain(closed)
        assertThat(listSessions("record")).contains(closed).doesNotContain(openEarlier, draftDated)
    }

    @Test
    fun `record mode orders by attention date desc and pages without gaps while epoch is unchanged`() {
        val publishedDraft = createInState("게시 초안", "PUBLISHED", "2026-07-01", withDraft = true)
        val publishedLater = createInState("게시 나중", "PUBLISHED", "2026-08-01")
        val closedDraft = createInState("마감 초안", "CLOSED", "2026-06-01", withDraft = true)
        val closedEarlier = createInState("마감 이전", "CLOSED", "2026-05-01")
        val open = createInState("모임 제외", "OPEN", "2026-09-01")

        val first = listPage("record", limit = 2)
        val firstIds = sessionIds(first)
        val cursor = first.get("nextCursor").asString()
        val second = listPage("record", limit = 2, cursor = cursor)
        val concatenated = firstIds + sessionIds(second)
        assertThat(concatenated).containsExactly(publishedDraft, publishedLater, closedDraft, closedEarlier)
        assertThat(concatenated).doesNotHaveDuplicates()
        assertThat(concatenated).doesNotContain(open)
        val secondCursor = second.get("nextCursor")
        if (!secondCursor.isNull && secondCursor.asString().isNotBlank() && secondCursor.asString() != "null") {
            val third = listPage("record", limit = 2, cursor = secondCursor.asString())
            assertThat(sessionIds(third)).isEmpty()
            assertThat(third.get("nextCursor").isNull).isTrue()
        } else {
            assertThat(secondCursor.isNull || secondCursor.asString().isBlank()).isTrue()
        }
    }

    @Test
    fun `equal tuples break ties on session number and id descending`() {
        val first = createInState("같은 키 1", "DRAFT", "2026-09-10")
        val second = createInState("같은 키 2", "DRAFT", "2026-09-10")
        val ids = listSessions("meeting")
        assertThat(ids.take(2)).containsExactly(second, first)
    }

    @Test
    fun `search fingerprint mismatch and opposite mode cursors are invalid`() {
        createInState("검색 대상", "DRAFT", "2026-09-04")
        createInState("검색 다음", "DRAFT", "2026-09-05")
        val cursor = listPage("meeting", limit = 1).get("nextCursor").asString()
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "meeting")
                param("search", "CursorListBookx")
                param("cursor", cursor)
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
            }
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "record")
                param("search", "CursorListBook")
                param("cursor", cursor)
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
            }
    }

    @Test
    fun `signed cursor rejects field mac and key mutations without logging secrets`() {
        createInState("커서 원본", "DRAFT", "2026-09-05")
        createInState("커서 다음", "DRAFT", "2026-09-06")
        val cursor = listPage("meeting", limit = 1).get("nextCursor").asString()
        val logs = captureSignerLogs()
        val parts = cursor.split('.')
        assertThat(parts).hasSize(3)
        val payload = String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8)
        val payloadJson = jsonMapper.readTree(payload)
        payloadJson.propertyNames().forEach { field ->
            mockMvc
                .get("/api/host/sessions") {
                    withHost()
                    param("mode", "meeting")
                    param("search", "CursorListBook")
                    param("cursor", mutatePayloadField(cursor, field))
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.code") { value("INVALID_CURSOR") }
                }
        }
        val mac = parts[2].toCharArray().also { it[0] = if (it[0] == 'A') 'B' else 'A' }.concatToString()
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "meeting")
                param("search", "CursorListBook")
                param("cursor", "${parts[0]}.${parts[1]}.$mac")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
            }
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "meeting")
                param("search", "CursorListBook")
                param("cursor", "99.${parts[1]}.${parts[2]}")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
            }
        val messages = logs.appender.list.joinToString { it.formattedMessage }
        logs.close()
        assertThat(messages).doesNotContain(cursor, payload, parts[2], "test-host-list-cursor-current-key")
    }

    @Test
    fun `expired cursor is stale and previous key cursors replay within rollout`() {
        createInState("만료 목록", "DRAFT", "2026-09-07")
        createInState("만료 다음", "DRAFT", "2026-09-08")
        val cursor = listPage("meeting", limit = 1).get("nextCursor").asString()
        val expired =
            resign(
                cursor,
                keyVersion = 1,
                expiry = Instant.parse("2020-01-01T00:00:00Z"),
            )
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "meeting")
                param("search", "CursorListBook")
                param("cursor", expired)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("LIST_CURSOR_STALE") }
                jsonPath("$.items") { doesNotExist() }
                jsonPath("$.restartTarget.mode") { value("meeting") }
            }

        val previous =
            resign(
                cursor,
                keyVersion = 0,
                expiry = Instant.parse("2099-01-01T00:00:00Z"),
            )
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "meeting")
                param("search", "CursorListBook")
                param("cursor", previous)
            }.andExpect { status { isOk() } }
    }

    @Test
    fun `epoch mutation between pages returns stale without partial data`() {
        HostListEpochInventory.sources
            .filter { it.modes.contains(HostListEpochInventory.Mode.MEETING) }
            .forEach { source ->
                cleanupGenerated()
                createInState("페이지 하나", "DRAFT", "2026-09-11")
                createInState("페이지 둘", "DRAFT", "2026-09-12")
                val cursor = listPage("meeting", limit = 1).get("nextCursor").asString()
                mutateRegisteredSource(source)
                mockMvc
                    .get("/api/host/sessions") {
                        withHost()
                        param("mode", "meeting")
                        param("search", "CursorListBook")
                        param("limit", "1")
                        param("cursor", cursor)
                    }.andExpect {
                        status { isConflict() }
                        jsonPath("$.code") { value("LIST_CURSOR_STALE") }
                        jsonPath("$.items") { doesNotExist() }
                    }
            }
    }

    @Test
    fun `record epoch mutation between pages returns stale without partial data`() {
        HostListEpochInventory.sources
            .filter {
                it.modes.contains(HostListEpochInventory.Mode.RECORD) &&
                    it.kinds.contains(HostListEpochKind.RECORD)
            }.forEach { source ->
                cleanupGenerated()
                createInState("기록 하나", "CLOSED", "2026-09-11")
                createInState("기록 둘", "CLOSED", "2026-09-12")
                val page = listPage("record", limit = 1)
                val cursorNode = page.get("nextCursor")
                val cursor = cursorNode.asString()
                check(!cursorNode.isNull && cursor.isNotBlank() && cursor != "null") {
                    "record continuation missing for ${source.sqlToken}; items=${sessionIds(page)}"
                }
                val epochBefore = listEpoch("record_epoch")
                mutateRegisteredSource(source)
                assertThat(listEpoch("record_epoch"))
                    .`as`("record epoch after %s", source.sqlToken)
                    .isGreaterThan(epochBefore)
                mockMvc
                    .get("/api/host/sessions") {
                        withHost()
                        param("mode", "record")
                        param("search", "CursorListBook")
                        param("limit", "1")
                        param("cursor", cursor)
                    }.andExpect {
                        status { isConflict() }
                        jsonPath("$.code") { value("LIST_CURSOR_STALE") }
                        jsonPath("$.items") { doesNotExist() }
                    }
            }
    }

    @Test
    fun `basic change restore between pages is list cursor stale`() {
        createInState("복원 페이지 하나", "DRAFT", "2026-09-13")
        createInState("복원 페이지 둘", "DRAFT", "2026-09-14")
        val sessionId = createInState("복원 대상", "DRAFT", "2026-09-15")
        val changeId = patchTitleReturningChangeId(sessionId, "복원 전 제목")
        val cursor = listPage("meeting", limit = 1).get("nextCursor").asString()
        restoreBasicChange(sessionId, changeId)
        mockMvc
            .get("/api/host/sessions") {
                withHost()
                param("mode", "meeting")
                param("search", "CursorListBook")
                param("limit", "1")
                param("cursor", cursor)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("LIST_CURSOR_STALE") }
                jsonPath("$.items") { doesNotExist() }
            }
    }

    @Test
    fun `snapshot race after epoch read never mixes old epoch with new rows`() {
        createInState("스냅샷 이전", "DRAFT", "2026-09-20", bookTitle = SNAP_RACE_BOOK)
        val continuation = createInState("스냅샷 다음", "DRAFT", "2026-09-21", bookTitle = SNAP_RACE_BOOK)
        val cursor = listPage("meeting", limit = 1, search = SNAP_RACE_BOOK).get("nextCursor").asString()
        val pool = Executors.newFixedThreadPool(2)
        SNAPSHOT_PROBE.enabled = true
        SNAPSHOT_ENTERED.reset()
        SNAPSHOT_RELEASE.reset()
        try {
            val query =
                pool.submit<Pair<Int, String>> {
                    val response =
                        mockMvc
                            .get("/api/host/sessions") {
                                withHost()
                                param("mode", "meeting")
                                param("search", SNAP_RACE_BOOK)
                                param("limit", "1")
                                param("cursor", cursor)
                            }.andReturn()
                            .response
                    response.status to response.contentAsString
                }
            check(SNAPSHOT_ENTERED.await(5, TimeUnit.SECONDS))
            jdbcTemplate.update(
                "update sessions set title = ? where id = ?",
                "스냅샷 변경",
                continuation,
            )
            jdbcTemplate.update(
                "update club_host_list_epochs set meeting_epoch = meeting_epoch + 1 where club_id = ?",
                CLUB_ID,
            )
            SNAPSHOT_RELEASE.countDown()
            val (status, bodyJson) = query.get(10, TimeUnit.SECONDS)
            val body = jsonMapper.readTree(bodyJson)
            when (status) {
                200 -> {
                    val items = body.get("items")
                    assertThat(items.size()).isGreaterThan(0)
                    val titles = (0 until items.size()).map { items.get(it).get("title").asString() }
                    val ids = (0 until items.size()).map { items.get(it).get("sessionId").asString() }
                    assertThat(titles).doesNotContain("스냅샷 변경")
                    if (continuation in ids) {
                        assertThat(titles).contains("스냅샷 다음")
                    }
                }
                409 -> {
                    assertThat(body.get("code").asString()).isEqualTo("LIST_CURSOR_STALE")
                    assertThat(body.get("items")).isNull()
                }
                else -> fail("unexpected status $status")
            }
        } finally {
            SNAPSHOT_PROBE.enabled = false
            SNAPSHOT_RELEASE.countDown()
            pool.shutdownNow()
        }
    }

    private fun mutateRegisteredSource(source: HostListEpochInventory.Source) {
        val sessionId = createInState("소스 ${source.sqlToken}", "DRAFT", "2026-09-15")
        when {
            source.sqlToken == "sessions.title" || source.sqlToken == "sessions.book_title" ||
                source.sqlToken == "sessions.session_date" ->
                patchTitle(sessionId, "변경 ${source.sqlToken}")
            source.sqlToken == "sessions.state" || source.sqlToken == "attention_rank" -> {
                open(sessionId)
                if (source.kinds.contains(HostListEpochKind.RECORD)) {
                    close(sessionId)
                }
            }
            source.sqlToken == "deleted_at" -> trash(sessionId)
            else -> bumpEpochs(source.kinds)
        }
    }

    private fun listEpoch(column: String): Long =
        jdbcTemplate.queryForObject(
            "select $column from club_host_list_epochs where club_id = ?",
            Long::class.java,
            CLUB_ID,
        ) ?: 0

    private fun bumpEpochs(kinds: Set<HostListEpochKind>) {
        if (kinds.isEmpty()) return
        jdbcTemplate.update(
            """
            update club_host_list_epochs
            set meeting_epoch = meeting_epoch + ?,
                record_epoch = record_epoch + ?
            where club_id = ?
            """.trimIndent(),
            if (HostListEpochKind.MEETING in kinds) 1 else 0,
            if (HostListEpochKind.RECORD in kinds) 1 else 0,
            CLUB_ID,
        )
    }

    private fun createInState(
        title: String,
        state: String,
        date: String?,
        withDraft: Boolean = false,
        bookTitle: String = LIST_BOOK,
    ): String {
        val sessionId = createDraft(title, date ?: "2026-09-01", bookTitle)
        if (date != null) {
            jdbcTemplate.update("update sessions set session_date = ? where id = ?", date, sessionId)
        }
        if (state != "DRAFT") {
            jdbcTemplate.update(
                """
                update sessions
                set state = ?,
                    visibility = case when ? in ('CLOSED', 'PUBLISHED') then 'MEMBER' else visibility end,
                    access_scope = case when ? = 'PUBLISHED' then 'GUEST_READABLE' else access_scope end
                where id = ?
                """.trimIndent(),
                state,
                state,
                state,
                sessionId,
            )
        }
        if (withDraft) {
            insertRecordDraft(sessionId)
        }
        return sessionId
    }

    private fun createDraft(
        title: String,
        date: String = "2026-09-01",
        bookTitle: String = LIST_BOOK,
    ): String {
        val body =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "$title",
                          "bookTitle": "$bookTitle",
                          "bookAuthor": "목록 저자",
                          "date": "$date",
                          "locationLabel": "온라인"
                        }
                        """.trimIndent()
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        return jsonMapper.readTree(body).get("sessionId").asString()
    }

    private fun patchTitle(
        sessionId: String,
        title: String,
    ) {
        patchTitleReturningChangeId(sessionId, title)
    }

    private fun patchTitleReturningChangeId(
        sessionId: String,
        title: String,
    ): String {
        val revision =
            jdbcTemplate.queryForObject(
                "select session_revision from sessions where id = ?",
                Long::class.java,
                sessionId,
            ) ?: 0
        val body =
            mockMvc
                .patch("/api/host/sessions/$sessionId") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "$title",
                          "bookTitle": "$LIST_BOOK",
                          "bookAuthor": "목록 저자",
                          "date": "2026-09-16",
                          "expectedSessionRevision": $revision
                        }
                        """.trimIndent()
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        return body.get("changeReceipt").get("changeId").asString()
    }

    private fun restoreBasicChange(
        sessionId: String,
        changeId: String,
    ) {
        val hash =
            mockMvc
                .get("/api/host/sessions/$sessionId/changes/$changeId/restore-preview") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
                .get("expectedCurrentHash")
                .asString()
        val revision =
            jdbcTemplate.queryForObject(
                "select session_revision from sessions where id = ?",
                Long::class.java,
                sessionId,
            ) ?: 0
        mockMvc
            .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedCurrentHash":"$hash","expectedSessionRevision":$revision}"""
            }.andExpect { status { isOk() } }
    }

    private fun open(sessionId: String) {
        val revision =
            jdbcTemplate.queryForObject(
                "select session_revision from sessions where id = ?",
                Long::class.java,
                sessionId,
            ) ?: 0
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedSessionRevision":$revision}"""
            }.andExpect { status { isOk() } }
    }

    private fun close(sessionId: String) {
        val revision =
            jdbcTemplate.queryForObject(
                "select session_revision from sessions where id = ?",
                Long::class.java,
                sessionId,
            ) ?: 0
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedSessionRevision":$revision}"""
            }.andExpect { status { isOk() } }
    }

    private fun trash(sessionId: String) {
        val revision =
            jdbcTemplate.queryForObject(
                "select session_revision from sessions where id = ?",
                Long::class.java,
                sessionId,
            ) ?: 0
        mockMvc
            .delete("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedSessionRevision":$revision}"""
            }.andExpect { status { isOk() } }
    }

    private fun insertRecordDraft(sessionId: String) {
        jdbcTemplate.update(
            """
            insert into session_record_drafts (
              session_id, club_id, base_live_revision, draft_revision, source, snapshot_json, snapshot_sha256,
              updated_by_membership_id
            ) values (?, ?, 0, 1, 'MANUAL', '{}', ?, ?)
            on duplicate key update draft_revision = draft_revision
            """.trimIndent(),
            sessionId,
            CLUB_ID,
            "b".repeat(64),
            HOST_MEMBERSHIP_ID,
        )
    }

    private fun listSessions(mode: String): List<String> = sessionIds(listPage(mode, limit = 50))

    private fun listPage(
        mode: String,
        limit: Int,
        cursor: String? = null,
        search: String = LIST_BOOK,
    ): JsonNode {
        val result =
            mockMvc
                .get("/api/host/sessions") {
                    withHost()
                    param("mode", mode)
                    param("search", search)
                    param("limit", limit.toString())
                    if (cursor != null) param("cursor", cursor)
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
        return jsonMapper.readTree(result)
    }

    private fun sessionIds(page: JsonNode): List<String> {
        val items = page.get("items")
        return (0 until items.size()).map { items.get(it).get("sessionId").asString() }
    }

    private fun mutatePayloadField(
        cursor: String,
        field: String,
    ): String {
        val parts = cursor.split('.')
        val payload = jsonMapper.readTree(String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8))
        val mutated = payload.deepCopy() as tools.jackson.databind.node.ObjectNode
        when (field) {
            "last" -> mutated.putNull("last")
            "states" -> mutated.putArray("states").add("CLOSED")
            "epoch", "keyVersion", "sessionNumber", "attentionRank", "stateRank" -> {
                if (payload.get(field) != null) mutated.put(field, payload.get(field).asLong() + 1)
                payload.get("last")?.get(field)?.let { current ->
                    val last = mutated.putObject("last")
                    payload.get("last").properties().forEach { last.set(it.key, it.value) }
                    last.put(field, current.asLong() + 1)
                }
            }
            else -> {
                if (payload.get(field)?.isTextual == true) {
                    mutated.put(field, payload.get(field).asString() + "x")
                }
            }
        }
        val encoded =
            Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString(jsonMapper.writeValueAsBytes(mutated))
        return "${parts[0]}.$encoded.${parts[2]}"
    }

    private fun resign(
        cursor: String,
        keyVersion: Int,
        expiry: Instant,
    ): String {
        val payload = String(Base64.getUrlDecoder().decode(cursor.split('.')[1]), StandardCharsets.UTF_8)
        val replaced =
            payload
                .replace(Regex("\"keyVersion\":\\d+"), "\"keyVersion\":$keyVersion")
                .replace(Regex("\"expiry\":\"[^\"]+\""), "\"expiry\":\"$expiry\"")
        return cursorSigner.sign(replaced, keyVersion)
    }

    private fun captureSignerLogs(): SignerLogCapture {
        val logger = LoggerFactory.getLogger(HostListCursorSigner::class.java) as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)
        logger.level = Level.DEBUG
        return SignerLogCapture(logger, appender)
    }

    private class SignerLogCapture(
        private val logger: Logger,
        val appender: ListAppender<ILoggingEvent>,
    ) : AutoCloseable {
        override fun close() {
            logger.detachAppender(appender)
            appender.stop()
        }
    }

    private fun cleanupGenerated() {
        CLEANUP_LIST_CURSOR_SQL
            .split(';')
            .map { statement -> statement.trim() }
            .filter { statement -> statement.isNotEmpty() }
            .forEach { statement -> jdbcTemplate.update(statement) }
    }

    private fun MockHttpServletRequestDsl.withHost() {
        with(user("host@example.com"))
        with(csrf())
    }

    @TestConfiguration
    class SnapshotProbeConfiguration {
        @Bean
        @Primary
        fun snapshotProbe(): HostSessionListReadProbe = SNAPSHOT_PROBE
    }

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
        const val LIST_BOOK = "CursorListBook"
        const val SNAP_RACE_BOOK = "SnapRaceBook"
        val SNAPSHOT_ENTERED = ResettableLatch()
        val SNAPSHOT_RELEASE = ResettableLatch()
        val SNAPSHOT_PROBE = SnapshotListReadProbe()
    }

    class SnapshotListReadProbe : HostSessionListReadProbe {
        @Volatile var enabled = false

        override fun afterEpochRead() {
            if (!enabled) return
            SNAPSHOT_ENTERED.countDown()
            check(SNAPSHOT_RELEASE.await(5, TimeUnit.SECONDS))
        }
    }
}

private class ResettableLatch {
    private var latch = CountDownLatch(1)

    fun reset() {
        latch = CountDownLatch(1)
    }

    fun countDown() = latch.countDown()

    fun await(
        timeout: Long,
        unit: TimeUnit,
    ) = latch.await(timeout, unit)
}

private const val CLEANUP_LIST_CURSOR_SQL = """
    delete from session_record_drafts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from host_session_lifecycle_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from host_session_change_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_participants
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_publication_versions
    where session_id in (
      select id from sessions
      where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
    );
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001' and number > 7;
"""
