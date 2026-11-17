package suwayomi.tachidesk.manga.model.table

/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.dao.id.IntIdTable
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insertIgnore
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import suwayomi.tachidesk.server.user.model.UserTable

object UserExtensionTable : IntIdTable("user_extension") {
    val user = reference("user_id", UserTable, ReferenceOption.CASCADE).index()
    val pkgName = varchar("pkg_name", 128).index()
    val installedAt = long("installed_at").default(0)

    init {
        uniqueIndex(user, pkgName)
    }

    fun isInstalled(userId: Int, pkg: String): Boolean =
        transaction {
            UserExtensionTable
                .selectAll()
                .where { (user eq userId) and (pkgName eq pkg) }
                .firstOrNull() != null
        }

    fun getInstalledPkgNames(userId: Int): Set<String> =
        transaction {
            UserExtensionTable
                .selectAll()
                .where { user eq userId }
                .map { it[pkgName] }
                .toSet()
        }

    fun install(userId: Int, pkg: String) {
        transaction {
            UserExtensionTable.insertIgnore {
                it[user] = userId
                it[pkgName] = pkg
                it[installedAt] = System.currentTimeMillis()
            }
        }
    }

    fun uninstall(userId: Int, pkg: String) {
        transaction {
            UserExtensionTable.deleteWhere {
                (user eq userId) and (pkgName eq pkg)
            }
        }
    }

    fun countUsersWithPkg(pkg: String): Long =
        transaction {
            UserExtensionTable
                .selectAll()
                .where { pkgName eq pkg }
                .count()
        }
}
