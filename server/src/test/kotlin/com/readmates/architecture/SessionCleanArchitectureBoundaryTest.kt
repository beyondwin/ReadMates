package com.readmates.architecture

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.junit.jupiter.api.Test

class SessionCleanArchitectureBoundaryTest {
    private val importedClasses = ClassFileImporter()
        .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
        .importPackages("com.readmates")

    @Test
    fun `migrated web adapters do not depend on persistence or legacy repositories`() {
        noClasses()
            .that()
            .resideInAnyPackage(
                "com.readmates.session.adapter.in.web..",
                "com.readmates.note.adapter.in.web..",
            )
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "com.readmates.session.adapter.out.persistence..",
                "com.readmates.auth.adapter.out.persistence..",
                "org.springframework.jdbc..",
            )
            .check(importedClasses)

        noClasses()
            .that()
            .resideInAnyPackage(
                "com.readmates.session.adapter.in.web..",
                "com.readmates.note.adapter.in.web..",
            )
            .should()
            .dependOnClassesThat()
            .haveSimpleNameEndingWith("Repository")
            .check(importedClasses)
    }

    @Test
    fun `session application does not depend on web adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.session.application..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "com.readmates.session.adapter.in.web..",
                "com.readmates.note.adapter.in.web..",
            )
            .check(importedClasses)
    }
}
