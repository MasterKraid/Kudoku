package suwayomi.tachidesk.manga.model.table

/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import org.jetbrains.exposed.v1.core.ReferenceOption
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.dao.id.IntIdTable
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import org.jetbrains.exposed.v1.jdbc.upsert
import suwayomi.tachidesk.server.user.model.UserTable

data class UserGitHubBackupDataClass(
    val id: Int,
    val userId: Int,
    val githubUsername: String,
    val githubToken: String,
    val repoName: String,
    val backupIntervalHours: Int,
    val lastBackupAt: Long,
    val lastBackupSha: String,
    val autoBackupEnabled: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
)

object UserGitHubBackupTable : IntIdTable("user_github_backup") {
    val user = reference("user_id", UserTable, ReferenceOption.CASCADE).uniqueIndex()
    val githubUsername = varchar("github_username", 128)
    val githubToken = varchar("github_token", 512)
    val repoName = varchar("repo_name", 128)
    val backupIntervalHours = integer("backup_interval_hours").default(24)
    val lastBackupAt = long("last_backup_at").default(0)
    val lastBackupSha = varchar("last_backup_sha", 128).default("")
    val autoBackupEnabled = bool("auto_backup_enabled").default(true)
    val createdAt = long("created_at").default(0)
    val updatedAt = long("updated_at").default(0)

    fun toDataClass(row: ResultRow) =
        UserGitHubBackupDataClass(
            id = row[id].value,
            userId = row[user].value,
            githubUsername = row[githubUsername],
            githubToken = row[githubToken],
            repoName = row[repoName],
            backupIntervalHours = row[backupIntervalHours],
            lastBackupAt = row[lastBackupAt],
            lastBackupSha = row[lastBackupSha],
            autoBackupEnabled = row[autoBackupEnabled],
            createdAt = row[createdAt],
            updatedAt = row[updatedAt],
        )

    fun getForUser(userId: Int): UserGitHubBackupDataClass? =
        transaction {
            UserGitHubBackupTable
                .selectAll()
                .where { user eq userId }
                .firstOrNull()
                ?.let { toDataClass(it) }
        }

    fun getAllWithAutoBackup(): List<UserGitHubBackupDataClass> =
        transaction {
            UserGitHubBackupTable
                .selectAll()
                .where { autoBackupEnabled eq true }
                .map { toDataClass(it) }
        }

    fun saveLink(
        userId: Int,
        ghUsername: String,
        ghToken: String,
        targetRepoName: String,
    ) {
        val now = System.currentTimeMillis()
        transaction {
            UserGitHubBackupTable.upsert(user) {
                it[user] = userId
                it[githubUsername] = ghUsername
                it[githubToken] = ghToken
                it[repoName] = targetRepoName
                it[updatedAt] = now
            }
        }
    }

    fun unlink(userId: Int) {
        transaction {
            UserGitHubBackupTable.deleteWhere { user eq userId }
        }
    }

    fun updateSettings(userId: Int, intervalHours: Int, enabled: Boolean) {
        val now = System.currentTimeMillis()
        transaction {
            UserGitHubBackupTable.update({ user eq userId }) {
                it[backupIntervalHours] = intervalHours
                it[autoBackupEnabled] = enabled
                it[updatedAt] = now
            }
        }
    }

    fun recordBackup(userId: Int, sha: String, timestamp: Long) {
        transaction {
            UserGitHubBackupTable.update({ user eq userId }) {
                it[lastBackupAt] = timestamp
                it[lastBackupSha] = sha
                it[updatedAt] = timestamp
            }
        }
    }
}
