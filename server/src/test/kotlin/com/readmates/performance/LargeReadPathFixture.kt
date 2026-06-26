package com.readmates.performance

import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Date
import java.sql.PreparedStatement
import java.time.LocalDate

internal class LargeReadPathFixture(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun seedNotesFeed(
        sessionCount: Int = 80,
        firstSessionNumber: Int = 1_000,
    ) {
        cleanupNotesFeed()
        insertSessions(sessionCount, firstSessionNumber)
        insertHiddenPaddingSessions(sessionCount * 25, firstSessionNumber + sessionCount)
        insertParticipants(sessionCount)
        insertQuestions(sessionCount)
        insertOneLineReviews(sessionCount)
        insertLongReviews(sessionCount)
        insertHighlights(sessionCount)
        insertOtherClubHighlightPadding(sessionCount * 25)
        refreshTableStatistics()
    }

    fun cleanupNotesFeed() {
        jdbcTemplate.update("delete from highlights where id like '10000000-0000-0000-0004-%'")
        jdbcTemplate.update("delete from long_reviews where id like '10000000-0000-0000-0003-%'")
        jdbcTemplate.update("delete from one_line_reviews where id like '10000000-0000-0000-0002-%'")
        jdbcTemplate.update("delete from questions where id like '10000000-0000-0000-0001-%'")
        jdbcTemplate.update("delete from session_participants where id like '10000000-0000-0000-0005-%'")
        jdbcTemplate.update("delete from sessions where id like '10000000-0000-0000-0000-%'")
    }

    fun cleanupAllPerformanceFixtures() {
        cleanupCurrentSession()
        cleanupArchiveSessionDetail()
        cleanupNotesFeed()
    }

    fun cleanupCurrentSession() {
        jdbcTemplate.update("delete from highlights where id like '10000000-0000-0000-0104-%'")
        jdbcTemplate.update("delete from long_reviews where id like '10000000-0000-0000-0103-%'")
        jdbcTemplate.update("delete from one_line_reviews where id like '10000000-0000-0000-0102-%'")
        jdbcTemplate.update("delete from questions where id like '10000000-0000-0000-0101-%'")
        jdbcTemplate.update("delete from reading_checkins where id like '10000000-0000-0000-0106-%'")
        jdbcTemplate.update("delete from session_participants where id like '10000000-0000-0000-0105-%'")
        jdbcTemplate.update("delete from sessions where id like '10000000-0000-0000-0100-%'")
    }

    fun cleanupArchiveSessionDetail() {
        jdbcTemplate.update("delete from session_feedback_documents where id like '10000000-0000-0000-0207-%'")
        jdbcTemplate.update("delete from feedback_reports where id like '10000000-0000-0000-0208-%'")
        jdbcTemplate.update("delete from highlights where id like '10000000-0000-0000-0204-%'")
        jdbcTemplate.update("delete from long_reviews where id like '10000000-0000-0000-0203-%'")
        jdbcTemplate.update("delete from one_line_reviews where id like '10000000-0000-0000-0202-%'")
        jdbcTemplate.update("delete from questions where id like '10000000-0000-0000-0201-%'")
        jdbcTemplate.update("delete from reading_checkins where id like '10000000-0000-0000-0206-%'")
        jdbcTemplate.update("delete from session_participants where id like '10000000-0000-0000-0205-%'")
        jdbcTemplate.update("delete from public_session_publications where id like '10000000-0000-0000-0209-%'")
        jdbcTemplate.update("delete from sessions where id like '10000000-0000-0000-0200-%'")
    }

    fun seedCurrentSession() {
        cleanupCurrentSession()
        insertCurrentSession()
        insertCurrentSessionParticipants()
        insertCurrentSessionReadingArtifacts()
        refreshTableStatistics()
    }

    fun currentSessionId(): String = CURRENT_SESSION_ID

    fun seedArchiveSessionDetail(artifactCount: Int = 40) {
        cleanupArchiveSessionDetail()
        insertArchiveDetailSession()
        insertArchiveDetailPublication()
        insertArchiveDetailParticipants()
        insertArchiveDetailArtifacts(artifactCount.coerceIn(4, 80))
        insertArchiveDetailFeedbackDocument()
        refreshTableStatistics()
    }

    fun archiveDetailSessionId(): String = ARCHIVE_DETAIL_SESSION_ID

    private fun insertSessions(
        sessionCount: Int,
        firstSessionNumber: Int,
    ) {
        jdbcTemplate.batchUpdate(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, ?, ?, ?, ?, ?, '19:30:00', '21:30:00', 'Online', '2026-01-01 00:00:00.000000', 'PUBLISHED', 'PUBLIC')
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    ps.setString(1, sessionId(offset))
                    ps.setString(2, CLUB_ID)
                    ps.setInt(3, firstSessionNumber + offset)
                    ps.setString(4, "Large performance fixture session $offset")
                    ps.setString(5, "Performance fixture book $offset")
                    ps.setString(6, "Fixture Author")
                    ps.setDate(7, Date.valueOf(LocalDate.of(2026, 1, 1).plusDays(offset.toLong())))
                }

                override fun getBatchSize(): Int = sessionCount
            },
        )
    }

    private fun insertHiddenPaddingSessions(
        sessionCount: Int,
        firstSessionNumber: Int,
    ) {
        jdbcTemplate.batchUpdate(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, ?, ?, ?, ?, ?, '19:30:00', '21:30:00', 'Online', '2026-01-01 00:00:00.000000', 'DRAFT', 'HOST_ONLY')
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    val sessionOffset = firstSessionNumber + offset
                    ps.setString(1, sessionId(sessionOffset))
                    ps.setString(2, CLUB_ID)
                    ps.setInt(3, firstSessionNumber + offset)
                    ps.setString(4, "Large performance padding session $offset")
                    ps.setString(5, "Performance padding book $offset")
                    ps.setString(6, "Fixture Author")
                    ps.setDate(7, Date.valueOf(LocalDate.of(2026, 6, 1).plusDays(offset.toLong())))
                }

                override fun getBatchSize(): Int = sessionCount
            },
        )
    }

    private fun insertParticipants(sessionCount: Int) {
        val rowCount = sessionCount * 2
        jdbcTemplate.batchUpdate(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = (i / 2) + 1
                    val memberSlot = (i % 2) + 1
                    ps.setString(1, participantId(offset, memberSlot))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, sessionId(offset))
                    ps.setString(4, if (memberSlot == 1) MEMBER_5_ID else MEMBER_4_ID)
                }

                override fun getBatchSize(): Int = rowCount
            },
        )
    }

    private fun insertQuestions(sessionCount: Int) {
        jdbcTemplate.batchUpdate(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought, created_at)
            values (?, ?, ?, ?, 1, ?, null, timestampadd(second, ?, '2026-01-01 00:00:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    ps.setString(1, questionId(offset))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, sessionId(offset))
                    ps.setString(4, MEMBER_5_ID)
                    ps.setString(5, "Fixture question $offset")
                    ps.setInt(6, i)
                }

                override fun getBatchSize(): Int = sessionCount
            },
        )
    }

    private fun insertOneLineReviews(sessionCount: Int) {
        jdbcTemplate.batchUpdate(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility, created_at)
            values (?, ?, ?, ?, ?, 'PUBLIC', timestampadd(second, ?, '2026-01-01 00:00:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    ps.setString(1, oneLineId(offset))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, sessionId(offset))
                    ps.setString(4, MEMBER_5_ID)
                    ps.setString(5, "Fixture one-line review $offset")
                    ps.setInt(6, i + 1_000)
                }

                override fun getBatchSize(): Int = sessionCount
            },
        )
    }

    private fun insertLongReviews(sessionCount: Int) {
        jdbcTemplate.batchUpdate(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility, created_at)
            values (?, ?, ?, ?, ?, 'PUBLIC', timestampadd(second, ?, '2026-01-01 00:00:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    ps.setString(1, longReviewId(offset))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, sessionId(offset))
                    ps.setString(4, MEMBER_4_ID)
                    ps.setString(5, "Fixture long review $offset")
                    ps.setInt(6, i + 2_000)
                }

                override fun getBatchSize(): Int = sessionCount
            },
        )
    }

    private fun insertHighlights(sessionCount: Int) {
        jdbcTemplate.batchUpdate(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order, created_at)
            values (?, ?, ?, null, ?, 1, timestampadd(second, ?, '2026-01-01 00:00:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    ps.setString(1, highlightId(offset))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, sessionId(offset))
                    ps.setString(4, "Fixture highlight $offset")
                    ps.setInt(5, i + 3_000)
                }

                override fun getBatchSize(): Int = sessionCount
            },
        )
    }

    private fun insertOtherClubHighlightPadding(sessionCount: Int) {
        insertOtherClubPaddingSessions(sessionCount)
        jdbcTemplate.batchUpdate(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order, created_at)
            values (?, ?, ?, null, ?, 1, timestampadd(second, ?, '2026-08-01 00:00:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    ps.setString(1, highlightId(OTHER_CLUB_OFFSET_START + offset))
                    ps.setString(2, OTHER_CLUB_ID)
                    ps.setString(3, sessionId(OTHER_CLUB_OFFSET_START + offset))
                    ps.setString(4, "Other club fixture highlight $offset")
                    ps.setInt(5, i)
                }

                override fun getBatchSize(): Int = sessionCount
            },
        )
    }

    private fun insertOtherClubPaddingSessions(sessionCount: Int) {
        jdbcTemplate.batchUpdate(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, ?, ?, ?, ?, ?, '19:30:00', '21:30:00', 'Online', '2026-08-01 00:00:00.000000', 'DRAFT', 'HOST_ONLY')
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    val sessionOffset = OTHER_CLUB_OFFSET_START + offset
                    ps.setString(1, sessionId(sessionOffset))
                    ps.setString(2, OTHER_CLUB_ID)
                    ps.setInt(3, OTHER_CLUB_OFFSET_START + offset)
                    ps.setString(4, "Other club performance padding session $offset")
                    ps.setString(5, "Other club padding book $offset")
                    ps.setString(6, "Fixture Author")
                    ps.setDate(7, Date.valueOf(LocalDate.of(2026, 8, 1).plusDays(offset.toLong())))
                }

                override fun getBatchSize(): Int = sessionCount
            },
        )
    }

    private fun insertCurrentSession() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, 9001, 'Current session performance fixture', 'Current fixture book',
              'Fixture Author', '2026-09-01', '19:30:00', '21:30:00', 'Online',
              '2026-08-31 14:59:00.000000', 'OPEN', 'MEMBER')
            """.trimIndent(),
            CURRENT_SESSION_ID,
            CLUB_ID,
        )
    }

    private fun insertCurrentSessionParticipants() {
        jdbcTemplate.batchUpdate(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            values (?, ?, ?, ?, 'GOING', 'UNKNOWN', 'ACTIVE')
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val membershipId = if (i % 2 == 0) MEMBER_5_ID else MEMBER_4_ID
                    ps.setString(1, currentParticipantId(i + 1))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, CURRENT_SESSION_ID)
                    ps.setString(4, membershipId)
                }

                override fun getBatchSize(): Int = 2
            },
        )
    }

    private fun insertCurrentSessionReadingArtifacts() {
        jdbcTemplate.update(
            """
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
            values (?, ?, ?, ?, 67)
            """.trimIndent(),
            currentCheckinId(1),
            CLUB_ID,
            CURRENT_SESSION_ID,
            MEMBER_5_ID,
        )
        jdbcTemplate.batchUpdate(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought, created_at)
            values (?, ?, ?, ?, ?, ?, null, timestampadd(second, ?, '2026-09-01 00:00:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val priority = i + 1
                    ps.setString(1, currentQuestionId(priority))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, CURRENT_SESSION_ID)
                    ps.setString(4, if (i % 2 == 0) MEMBER_5_ID else MEMBER_4_ID)
                    ps.setInt(5, priority)
                    ps.setString(6, "Current fixture question $priority")
                    ps.setInt(7, i)
                }

                override fun getBatchSize(): Int = 4
            },
        )
        jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility, created_at)
            values (?, ?, ?, ?, 'Current fixture one-line review', 'PUBLIC', '2026-09-01 00:10:00.000000')
            """.trimIndent(),
            currentOneLineId(1),
            CLUB_ID,
            CURRENT_SESSION_ID,
            MEMBER_5_ID,
        )
        jdbcTemplate.update(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility, created_at)
            values (?, ?, ?, ?, 'Current fixture long review', 'PUBLIC', '2026-09-01 00:20:00.000000')
            """.trimIndent(),
            currentLongReviewId(1),
            CLUB_ID,
            CURRENT_SESSION_ID,
            MEMBER_4_ID,
        )
        jdbcTemplate.batchUpdate(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order, created_at)
            values (?, ?, ?, null, ?, ?, timestampadd(second, ?, '2026-09-01 00:30:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    ps.setString(1, currentHighlightId(offset))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, CURRENT_SESSION_ID)
                    ps.setString(4, "Current fixture highlight $offset")
                    ps.setInt(5, offset)
                    ps.setInt(6, i)
                }

                override fun getBatchSize(): Int = 8
            },
        )
    }

    private fun insertArchiveDetailSession() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, 9002, 'Archive detail performance fixture', 'Archive fixture book',
              'Fixture Author', '2026-09-08', '19:30:00', '21:30:00', 'Online',
              '2026-09-07 14:59:00.000000', 'PUBLISHED', 'PUBLIC')
            """.trimIndent(),
            ARCHIVE_DETAIL_SESSION_ID,
            CLUB_ID,
        )
    }

    private fun insertArchiveDetailPublication() {
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values (?, ?, ?, 'Archive detail fixture public summary', true, 'PUBLIC', '2026-09-08 12:00:00.000000')
            """.trimIndent(),
            archivePublicationId(1),
            CLUB_ID,
            ARCHIVE_DETAIL_SESSION_ID,
        )
    }

    private fun insertArchiveDetailParticipants() {
        jdbcTemplate.batchUpdate(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    ps.setString(1, archiveParticipantId(i + 1))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, ARCHIVE_DETAIL_SESSION_ID)
                    ps.setString(4, if (i == 0) MEMBER_5_ID else MEMBER_4_ID)
                }

                override fun getBatchSize(): Int = 2
            },
        )
    }

    private fun insertArchiveDetailArtifacts(artifactCount: Int) {
        jdbcTemplate.update(
            """
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
            values (?, ?, ?, ?, 100)
            """.trimIndent(),
            archiveCheckinId(1),
            CLUB_ID,
            ARCHIVE_DETAIL_SESSION_ID,
            MEMBER_5_ID,
        )
        jdbcTemplate.batchUpdate(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought, created_at)
            values (?, ?, ?, ?, ?, ?, null, timestampadd(second, ?, '2026-09-08 00:00:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val priority = (i % 5) + 1
                    ps.setString(1, archiveQuestionId(i + 1))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, ARCHIVE_DETAIL_SESSION_ID)
                    ps.setString(4, if (i % 2 == 0) MEMBER_5_ID else MEMBER_4_ID)
                    ps.setInt(5, priority)
                    ps.setString(6, "Archive fixture question ${i + 1}")
                    ps.setInt(7, i)
                }

                override fun getBatchSize(): Int = minOf(artifactCount, 10)
            },
        )
        jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility, created_at)
            values (?, ?, ?, ?, 'Archive fixture one-line review', 'PUBLIC', '2026-09-08 00:10:00.000000')
            """.trimIndent(),
            archiveOneLineId(1),
            CLUB_ID,
            ARCHIVE_DETAIL_SESSION_ID,
            MEMBER_5_ID,
        )
        jdbcTemplate.update(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility, created_at)
            values (?, ?, ?, ?, 'Archive fixture long review', 'PUBLIC', '2026-09-08 00:20:00.000000')
            """.trimIndent(),
            archiveLongReviewId(1),
            CLUB_ID,
            ARCHIVE_DETAIL_SESSION_ID,
            MEMBER_5_ID,
        )
        jdbcTemplate.batchUpdate(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order, created_at)
            values (?, ?, ?, null, ?, ?, timestampadd(second, ?, '2026-09-08 00:30:00.000000'))
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    val offset = i + 1
                    ps.setString(1, archiveHighlightId(offset))
                    ps.setString(2, CLUB_ID)
                    ps.setString(3, ARCHIVE_DETAIL_SESSION_ID)
                    ps.setString(4, "Archive fixture highlight $offset")
                    ps.setInt(5, offset)
                    ps.setInt(6, i)
                }

                override fun getBatchSize(): Int = artifactCount
            },
        )
    }

    private fun insertArchiveDetailFeedbackDocument() {
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, file_name, content_type, file_size, created_at
            )
            values (?, ?, ?, 1, 'Archive fixture feedback document', 'archive-fixture.md', 'text/markdown', 128,
              '2026-09-08 01:00:00.000000')
            """.trimIndent(),
            archiveFeedbackDocumentId(1),
            CLUB_ID,
            ARCHIVE_DETAIL_SESSION_ID,
        )
    }

    private fun refreshTableStatistics() {
        jdbcTemplate.execute(
            """
            analyze table sessions, session_participants, questions, one_line_reviews, long_reviews,
              highlights, reading_checkins, public_session_publications, session_feedback_documents
            """.trimIndent(),
        )
    }

    private fun sessionId(offset: Int) = "10000000-0000-0000-0000-${offset.toString().padStart(12, '0')}"

    private fun questionId(offset: Int) = "10000000-0000-0000-0001-${offset.toString().padStart(12, '0')}"

    private fun oneLineId(offset: Int) = "10000000-0000-0000-0002-${offset.toString().padStart(12, '0')}"

    private fun longReviewId(offset: Int) = "10000000-0000-0000-0003-${offset.toString().padStart(12, '0')}"

    private fun highlightId(offset: Int) = "10000000-0000-0000-0004-${offset.toString().padStart(12, '0')}"

    private fun participantId(
        offset: Int,
        memberSlot: Int,
    ) = "10000000-0000-0000-0005-${(offset * 10 + memberSlot).toString().padStart(12, '0')}"

    private fun currentQuestionId(offset: Int) = "10000000-0000-0000-0101-${offset.toString().padStart(12, '0')}"

    private fun currentOneLineId(offset: Int) = "10000000-0000-0000-0102-${offset.toString().padStart(12, '0')}"

    private fun currentLongReviewId(offset: Int) = "10000000-0000-0000-0103-${offset.toString().padStart(12, '0')}"

    private fun currentHighlightId(offset: Int) = "10000000-0000-0000-0104-${offset.toString().padStart(12, '0')}"

    private fun currentParticipantId(offset: Int) = "10000000-0000-0000-0105-${offset.toString().padStart(12, '0')}"

    private fun currentCheckinId(offset: Int) = "10000000-0000-0000-0106-${offset.toString().padStart(12, '0')}"

    private fun archiveQuestionId(offset: Int) = "10000000-0000-0000-0201-${offset.toString().padStart(12, '0')}"

    private fun archiveOneLineId(offset: Int) = "10000000-0000-0000-0202-${offset.toString().padStart(12, '0')}"

    private fun archiveLongReviewId(offset: Int) = "10000000-0000-0000-0203-${offset.toString().padStart(12, '0')}"

    private fun archiveHighlightId(offset: Int) = "10000000-0000-0000-0204-${offset.toString().padStart(12, '0')}"

    private fun archiveParticipantId(offset: Int) = "10000000-0000-0000-0205-${offset.toString().padStart(12, '0')}"

    private fun archiveCheckinId(offset: Int) = "10000000-0000-0000-0206-${offset.toString().padStart(12, '0')}"

    private fun archiveFeedbackDocumentId(offset: Int) = fixtureId("0207", offset)

    private fun archivePublicationId(offset: Int) = "10000000-0000-0000-0209-${offset.toString().padStart(12, '0')}"

    private fun fixtureId(
        group: String,
        offset: Int,
    ) = "10000000-0000-0000-$group-${offset.toString().padStart(12, '0')}"

    private companion object {
        private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val OTHER_CLUB_ID = "00000000-0000-0000-0000-000000000002"
        private const val MEMBER_4_ID = "00000000-0000-0000-0000-000000000205"
        private const val MEMBER_5_ID = "00000000-0000-0000-0000-000000000206"
        private const val CURRENT_SESSION_ID = "10000000-0000-0000-0100-000000000001"
        private const val ARCHIVE_DETAIL_SESSION_ID = "10000000-0000-0000-0200-000000000001"
        private const val OTHER_CLUB_OFFSET_START = 10_000
    }
}
