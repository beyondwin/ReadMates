package com.readmates.architecture

import org.w3c.dom.Document
import java.nio.file.Path
import javax.xml.parsers.DocumentBuilderFactory

data class ServerQualityBaselineCounts(
    val detektIssues: Int,
    val ktlintErrors: Int,
)

object ServerQualityBaselineReader {
    fun read(
        detektBaseline: Path,
        ktlintBaseline: Path,
    ): ServerQualityBaselineCounts =
        ServerQualityBaselineCounts(
            detektIssues = parse(detektBaseline).getElementsByTagName("ID").length,
            ktlintErrors = parse(ktlintBaseline).getElementsByTagName("error").length,
        )

    private fun parse(path: Path): Document {
        val factory = DocumentBuilderFactory.newInstance()
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        factory.isXIncludeAware = false
        factory.isExpandEntityReferences = false
        return factory.newDocumentBuilder().parse(path.toFile())
    }
}
