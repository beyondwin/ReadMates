package com.readmates.admin.analytics.application.service

import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiCard
import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.port.`in`.AdminAnalyticsCsvExport
import com.readmates.admin.analytics.application.port.`in`.ExportAdminAnalyticsCsvUseCase
import org.springframework.stereotype.Component

private val CSV_COLUMNS =
    listOf(
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

@Component
class AdminAnalyticsCsvExporter : ExportAdminAnalyticsCsvUseCase {
    override fun export(overview: AdminAnalyticsOverview): AdminAnalyticsCsvExport {
        val cards = overview.kpis.associateBy { it.key }
        val rows =
            buildList {
                add(metadataRow(overview))
                overview.kpis.forEach { add(kpiRow(it)) }
                overview.series.forEach { series ->
                    val card = cards.getValue(series.key)
                    series.points.forEach { point ->
                        add(
                            csvRow(
                                "record_type" to "series",
                                "kpi_key" to series.key.name,
                                "kpi_label" to card.label,
                                "kpi_definition" to card.definition,
                                "unit" to series.unit.name,
                                "availability" to point.availability.name,
                                "bucket_start" to point.bucketStart.toString(),
                                "value" to point.value.csvValue(),
                            ),
                        )
                    }
                }
                overview.clubBenchmark.rows.forEach { row ->
                    add(
                        csvRow(
                            "record_type" to "benchmark",
                            "availability" to overview.clubBenchmark.availability.name,
                            "club_id" to row.clubId.toString(),
                            "club_slug" to row.slug,
                            "club_name" to row.name,
                            "active_members" to row.activeMembers.toString(),
                            "session_completion_rate" to row.sessionCompletionRate.csvValue(),
                            "rsvp_rate" to row.rsvpRate.csvValue(),
                            "ai_cost_usd" to row.aiCostUsd,
                            "notification_delivery_rate" to row.notificationDeliveryRate.csvValue(),
                        ),
                    )
                }
            }
        val content =
            (listOf(CSV_COLUMNS) + rows).joinToString(CRLF, postfix = CRLF) { record ->
                record.joinToString(",", transform = ::encodeCsvCell)
            }
        return AdminAnalyticsCsvExport(
            filename =
                "readmates-admin-analytics-${overview.window.wire}-${overview.generatedAt.toLocalDate()}.csv",
            content = content,
        )
    }

    private fun metadataRow(overview: AdminAnalyticsOverview): List<String> =
        csvRow(
            "record_type" to "metadata",
            "schema" to overview.schema,
            "generated_at" to overview.generatedAt.toString(),
            "window" to overview.window.wire,
            "benchmark_availability" to overview.clubBenchmark.availability.name,
        )

    private fun kpiRow(card: AdminAnalyticsKpiCard): List<String> =
        csvRow(
            "record_type" to "kpi",
            "kpi_key" to card.key.name,
            "kpi_label" to card.label,
            "kpi_definition" to card.definition,
            "unit" to card.unit.name,
            "current" to card.current.csvValue(),
            "prior" to card.prior.csvValue(),
            "delta" to card.delta.csvValue(),
            "delta_direction" to card.deltaDirection.name,
            "availability" to card.availability.name,
        )

    private fun csvRow(vararg values: Pair<String, String>): List<String> {
        val byColumn = values.toMap()
        return CSV_COLUMNS.map { byColumn[it].orEmpty() }
    }
}

private fun Double?.csvValue(): String = this?.toString().orEmpty()

private fun encodeCsvCell(value: String): String {
    val formulaSafe =
        if (value.firstOrNull() in FORMULA_PREFIXES) {
            "'$value"
        } else {
            value
        }
    return if (formulaSafe.any { it == ',' || it == '"' || it == '\r' || it == '\n' }) {
        "\"${formulaSafe.replace("\"", "\"\"")}\""
    } else {
        formulaSafe
    }
}

private const val CRLF = "\r\n"
private val FORMULA_PREFIXES = setOf('=', '+', '-', '@')
