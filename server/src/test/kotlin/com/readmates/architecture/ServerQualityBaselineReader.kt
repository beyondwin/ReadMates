package com.readmates.architecture

import org.w3c.dom.Document
import org.w3c.dom.Element
import org.w3c.dom.NodeList
import java.nio.file.Path
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.io.path.readLines

data class ServerQualityBaselineIdentities(
    val detektIssues: Set<String>,
    val ktlintErrors: Set<String>,
)

object ServerQualityBaselineReader {
    fun read(
        detektBaseline: Path,
        ktlintBaseline: Path,
    ): ServerQualityBaselineIdentities =
        ServerQualityBaselineIdentities(
            detektIssues = readDetektIdentities(detektBaseline),
            ktlintErrors = readKtlintIdentities(ktlintBaseline),
        )

    private fun readDetektIdentities(path: Path): Set<String> {
        val document = parse(path)
        val root = document.documentElement
        require(root.tagName == "SmellBaseline") { "Malformed Detekt baseline root in $path" }
        val sections = root.childNodes.asElements()
        val sectionNames = sections.map(Element::getTagName)
        require(
            DETEKT_SECTIONS.containsAll(sectionNames) &&
                sections.count { section -> section.tagName == "CurrentIssues" } == 1,
        ) { "Malformed Detekt baseline sections in $path" }
        val identities =
            sections.flatMap { section ->
                section.childNodes.asElements().map { element ->
                    require(element.tagName == "ID" && element.childNodes.asElements().isEmpty()) {
                        "Malformed Detekt baseline identity element in $path"
                    }
                    normalizeDetektIdentity(element.textContent)
                }
            }
        return uniqueIdentities(identities, "Detekt baseline", path)
    }

    private fun readKtlintIdentities(path: Path): Set<String> {
        val document = parse(path)
        val root = document.documentElement
        require(root.tagName == "baseline") { "Malformed ktlint baseline root in $path" }
        val identities =
            root
                .childNodes
                .asElements()
                .flatMap { file ->
                    require(file.tagName == "file") { "Malformed ktlint baseline element in $path" }
                    val fileName = normalizeKtlintFile(file.getAttribute("name"))
                    val errors = file.childNodes.asElements()
                    require(errors.isNotEmpty()) { "Malformed empty ktlint baseline file in $path: $fileName" }
                    errors.map { error ->
                        require(error.tagName == "error") { "Malformed ktlint baseline element in $path" }
                        ktlintIdentity(
                            fileName = fileName,
                            source = error.getAttribute("source"),
                            line = error.getAttribute("line"),
                            column = error.getAttribute("column"),
                        )
                    }
                }
        return uniqueIdentities(identities, "ktlint baseline", path)
    }

    private fun parse(path: Path): Document {
        val factory = DocumentBuilderFactory.newInstance()
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "")
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "")
        factory.isXIncludeAware = false
        factory.isExpandEntityReferences = false
        return factory.newDocumentBuilder().parse(path.toFile())
    }
}

fun readDetektIdentitySeed(path: Path): Set<String> = readIdentitySeed(path, "Detekt seed", ::normalizeDetektIdentity)

fun readKtlintIdentitySeed(path: Path): Set<String> =
    readIdentitySeed(path, "ktlint seed") { row ->
        val fields = row.split('|')
        require(fields.size == KTLINT_IDENTITY_FIELD_COUNT) { "Malformed ktlint seed row in $path: $row" }
        ktlintIdentity(
            fileName = fields[0],
            source = fields[1],
            line = fields[2],
            column = fields[3],
        )
    }

fun readDetektRetiredIdentities(path: Path) = readIdentitySeed(path, "retired Detekt", ::normalizeDetektIdentity)

fun readKtlintRetiredIdentities(path: Path): Set<String> =
    readIdentitySeed(path, "ktlint retired ledger") { row ->
        val fields = row.split('|')
        require(fields.size == KTLINT_IDENTITY_FIELD_COUNT) { "Malformed ktlint retired row in $path: $row" }
        ktlintIdentity(
            fileName = fields[0],
            source = fields[1],
            line = fields[2],
            column = fields[3],
        )
    }

private fun readIdentitySeed(
    path: Path,
    label: String,
    normalize: (String) -> String,
): Set<String> {
    val identities =
        path
            .readLines()
            .filterNot { line -> line.isBlank() || line.trimStart().startsWith("#") }
            .map { line ->
                require(line == line.trim()) { "Malformed $label row with surrounding whitespace in $path" }
                normalize(line)
            }
    return uniqueIdentities(identities, label, path)
}

private fun normalizeDetektIdentity(raw: String): String {
    val normalized = raw.trim()
    require(DETEKT_IDENTITY.matches(normalized)) { "Malformed Detekt identity: $raw" }
    return normalized
}

private fun normalizeKtlintFile(raw: String): String {
    val normalized = raw.trim().replace('\\', '/').removePrefix("./")
    require(
        normalized.endsWith(".kt") &&
            !normalized.startsWith('/') &&
            normalized.split('/').none { segment -> segment.isBlank() || segment == "." || segment == ".." },
    ) { "Malformed ktlint file identity: $raw" }
    return normalized
}

private fun ktlintIdentity(
    fileName: String,
    source: String,
    line: String,
    column: String,
): String {
    val normalizedFile = normalizeKtlintFile(fileName)
    val normalizedSource = source.trim()
    require(KTLINT_RULE.matches(normalizedSource)) { "Malformed ktlint rule identity: $source" }
    val normalizedLine = line.toPositiveLocation("line")
    val normalizedColumn = column.toPositiveLocation("column")
    return "$normalizedFile|$normalizedSource|$normalizedLine|$normalizedColumn"
}

private fun String.toPositiveLocation(label: String): Int {
    val value = toIntOrNull()
    require(value != null && value > 0 && this == value.toString()) { "Malformed ktlint $label identity: $this" }
    return value
}

private fun uniqueIdentities(
    identities: List<String>,
    label: String,
    path: Path,
): Set<String> {
    val duplicates =
        identities
            .groupingBy { identity -> identity }
            .eachCount()
            .filterValues { count -> count > 1 }
            .keys
    require(duplicates.isEmpty()) { "Duplicate $label identities in $path: ${duplicates.sorted().joinToString()}" }
    return identities.toSortedSet()
}

private fun NodeList.asElements(): List<Element> = (0 until length).mapNotNull { index -> item(index) as? Element }

private val DETEKT_IDENTITY = Regex("""[A-Za-z][A-Za-z0-9]*:.+""")
private val DETEKT_SECTIONS = setOf("ManuallySuppressedIssues", "CurrentIssues")
private val KTLINT_RULE = Regex("""[A-Za-z0-9_-]+:[A-Za-z0-9_-]+""")
private const val KTLINT_IDENTITY_FIELD_COUNT = 4
