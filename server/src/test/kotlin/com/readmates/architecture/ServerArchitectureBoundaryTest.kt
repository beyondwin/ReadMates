package com.readmates.architecture

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.junit.jupiter.api.Test

class ServerArchitectureBoundaryTest {
    private val importedClasses = ClassFileImporter()
        .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
        .importPackages("com.readmates")

    private val migratedWebAdapterPackages = arrayOf(
        "com.readmates.session.adapter.in.web..",
        "com.readmates.note.adapter.in.web..",
        "com.readmates.publication.adapter.in.web..",
        "com.readmates.archive.adapter.in.web..",
        "com.readmates.feedback.adapter.in.web..",
        "com.readmates.auth.adapter.in.web..",
        "com.readmates.notification.adapter.in.web..",
        "com.readmates.shared.adapter.in.web..",
    )

    private val migratedApplicationPackages = arrayOf(
        "com.readmates.session.application..",
        "com.readmates.note.application..",
        "com.readmates.publication.application..",
        "com.readmates.archive.application..",
        "com.readmates.feedback.application..",
        "com.readmates.auth.application..",
        "com.readmates.notification.application..",
    )

    @Test
    fun `migrated web adapters do not depend on persistence or legacy repositories`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedWebAdapterPackages)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework.jdbc..",
                "..adapter.out.persistence..",
                "..adapter.out.redis..",
                "org.springframework.data.redis..",
            )
            .check(importedClasses)

        noClasses()
            .that()
            .resideInAnyPackage(*migratedWebAdapterPackages)
            .should()
            .dependOnClassesThat()
            .haveSimpleNameEndingWith("Repository")
            .check(importedClasses)
    }

    @Test
    fun `migrated application packages do not depend on adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedApplicationPackages)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..adapter.in.web..",
                "..adapter.out.persistence..",
                "..adapter.out.redis..",
            )
            .check(importedClasses)
    }

    @Test
    fun `migrated application packages do not depend on jdbc or dao frameworks`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedApplicationPackages)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework.jdbc..",
                "org.springframework.dao..",
                "org.springframework.data.redis..",
            )
            .check(importedClasses)
    }

    @Test
    fun `member profile application service does not depend on web status types`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.auth.application.service..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework.http..",
                "org.springframework.web..",
            )
            .check(importedClasses)
    }

    @Test
    fun `domain classes do not depend on adapters or web and jdbc frameworks`() {
        noClasses()
            .that()
            .resideInAnyPackage("..domain..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..adapter..",
                "org.springframework.web..",
                "org.springframework.jdbc..",
            )
            .check(importedClasses)
    }
}
