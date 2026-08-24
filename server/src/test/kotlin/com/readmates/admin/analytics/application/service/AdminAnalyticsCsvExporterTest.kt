package com.readmates.admin.analytics.application.service

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmark
import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRow
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiCard
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiSeries
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiSeriesPoint
import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.model.Availability
import com.readmates.admin.analytics.application.model.DeltaDirection
import com.readmates.admin.analytics.application.model.KpiKey
import com.readmates.admin.analytics.application.model.KpiUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class AdminAnalyticsCsvExporterTest {
    private val exporter = AdminAnalyticsCsvExporter()

    @Suppress("LongMethod")
    @Test
    fun `exports every projection value with deterministic columns and filename`() {
        val overview = projection()

        val export = exporter.export(overview)
        val csv = parseCsv(export.content)

        assertThat(export.filename).isEqualTo("readmates-admin-analytics-30d-2026-08-25.csv")
        assertThat(csv.header)
            .containsExactly(
                "record_type",
                "schema",
                "generated_at",
                "window",
                "benchmark_availability",
                "kpi_key",
                "kpi_label",
                "kpi_definition",
                "unit",
                "current",
                "prior",
                "delta",
                "delta_direction",
                "availability",
                "bucket_start",
                "value",
                "club_id",
                "club_slug",
                "club_name",
                "active_members",
                "session_completion_rate",
                "rsvp_rate",
                "ai_cost_usd",
                "notification_delivery_rate",
            )

        assertThat(csv.rows.first().value("record_type")).isEqualTo("metadata")
        assertThat(csv.rows.first().value("schema")).isEqualTo(overview.schema)
        assertThat(csv.rows.first().value("generated_at")).isEqualTo(overview.generatedAt.toString())
        assertThat(csv.rows.first().value("window")).isEqualTo("30d")
        assertThat(csv.rows.first().value("benchmark_availability")).isEqualTo("AVAILABLE")

        val kpi = csv.rows.single { it.value("record_type") == "kpi" }
        assertThat(kpi.value("kpi_key")).isEqualTo("SESSION_COMPLETION")
        assertThat(kpi.value("kpi_label")).isEqualTo(overview.kpis.single().label)
        assertThat(kpi.value("kpi_definition")).isEqualTo(overview.kpis.single().definition)
        assertThat(kpi.value("unit")).isEqualTo("PERCENT")
        assertThat(kpi.value("current")).isEqualTo("0.0")
        assertThat(kpi.value("prior")).isEqualTo("50.0")
        assertThat(kpi.value("delta")).isEqualTo("'-50.0")
        assertThat(kpi.value("delta_direction")).isEqualTo("DOWN")
        assertThat(kpi.value("availability")).isEqualTo("AVAILABLE")

        val series = csv.rows.single { it.value("record_type") == "series" }
        assertThat(series.value("kpi_key")).isEqualTo("SESSION_COMPLETION")
        assertThat(series.value("bucket_start")).isEqualTo("2026-08-18")
        assertThat(series.value("value")).isEmpty()
        assertThat(series.value("availability")).isEqualTo("MEASUREMENT_UNAVAILABLE")

        val benchmark = csv.rows.single { it.value("record_type") == "benchmark" }
        assertThat(benchmark.value("club_id")).isEqualTo(CLUB_ID.toString())
        assertThat(benchmark.value("club_slug")).isEqualTo("'-formula-safe")
        assertThat(benchmark.value("club_name")).isEqualTo("'=SUM(A1:A2), 한글 \"모임\"\n다음 줄")
        assertThat(benchmark.value("active_members")).isEqualTo("0")
        assertThat(benchmark.value("session_completion_rate")).isEmpty()
        assertThat(benchmark.value("rsvp_rate")).isEqualTo("0.0")
        assertThat(benchmark.value("ai_cost_usd")).isEqualTo("0.0000")
        assertThat(benchmark.value("notification_delivery_rate")).isEqualTo("95.0")
    }

    @Test
    fun `escapes every spreadsheet formula prefix after RFC quoting`() {
        val names = listOf("=one", "+two", "-three", "@four")
        val overview =
            projection().copy(
                clubBenchmark =
                    AdminAnalyticsBenchmark(
                        availability = Availability.AVAILABLE,
                        rows = names.mapIndexed { index, name -> benchmarkRow(index, name) },
                    ),
            )

        val rows = parseCsv(exporter.export(overview).content).rows.filter { it.value("record_type") == "benchmark" }

        assertThat(rows.map { it.value("club_name") })
            .containsExactly("'=one", "'+two", "'-three", "'@four")
    }

    private fun projection() =
        AdminAnalyticsOverview(
            generatedAt = OffsetDateTime.parse("2026-08-25T01:02:03Z"),
            window = AnalyticsWindow.LAST_30D,
            kpis =
                listOf(
                    AdminAnalyticsKpiCard(
                        key = KpiKey.SESSION_COMPLETION,
                        label = "세션 완료율",
                        definition = "선택 기간의 전체 세션 중 완료된 세션 비율",
                        unit = KpiUnit.PERCENT,
                        availability = Availability.AVAILABLE,
                        current = 0.0,
                        prior = 50.0,
                        delta = -50.0,
                        deltaDirection = DeltaDirection.DOWN,
                    ),
                ),
            clubBenchmark =
                AdminAnalyticsBenchmark(
                    availability = Availability.AVAILABLE,
                    rows = listOf(benchmarkRow(0, "=SUM(A1:A2), 한글 \"모임\"\n다음 줄")),
                ),
            series =
                listOf(
                    AdminAnalyticsKpiSeries(
                        key = KpiKey.SESSION_COMPLETION,
                        unit = KpiUnit.PERCENT,
                        points =
                            listOf(
                                AdminAnalyticsKpiSeriesPoint(
                                    bucketStart = java.time.LocalDate.parse("2026-08-18"),
                                    availability = Availability.MEASUREMENT_UNAVAILABLE,
                                    value = null,
                                ),
                            ),
                    ),
                ),
        )

    private fun benchmarkRow(
        index: Int,
        name: String,
    ) = AdminAnalyticsBenchmarkRow(
        clubId = UUID.fromString("00000000-0000-0000-0000-${(1000 + index).toString().padStart(12, '0')}"),
        slug = "-formula-safe",
        name = name,
        activeMembers = 0,
        sessionCompletionRate = null,
        rsvpRate = 0.0,
        aiCostUsd = "0.0000",
        notificationDeliveryRate = 95.0,
    )

    private fun parseCsv(content: String): ParsedCsv {
        val records = mutableListOf<List<String>>()
        var record = mutableListOf<String>()
        val cell = StringBuilder()
        var index = 0
        var quoted = false
        while (index < content.length) {
            val char = content[index]
            when {
                quoted && char == '"' && content.getOrNull(index + 1) == '"' -> {
                    cell.append('"')
                    index += 1
                }
                char == '"' -> quoted = !quoted
                !quoted && char == ',' -> {
                    record += cell.toString()
                    cell.clear()
                }
                !quoted && char == '\r' && content.getOrNull(index + 1) == '\n' -> {
                    record += cell.toString()
                    records += record
                    record = mutableListOf()
                    cell.clear()
                    index += 1
                }
                else -> cell.append(char)
            }
            index += 1
        }
        assertThat(quoted).isFalse()
        assertThat(record).isEmpty()
        val header = records.first()
        return ParsedCsv(header, records.drop(1).map { ParsedRow(header.zip(it).toMap()) })
    }

    private data class ParsedCsv(
        val header: List<String>,
        val rows: List<ParsedRow>,
    )

    private data class ParsedRow(
        val values: Map<String, String>,
    ) {
        fun value(column: String): String = values.getValue(column)
    }

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000001000")
    }
}
