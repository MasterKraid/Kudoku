package suwayomi.tachidesk.server.database.migration

/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import de.neonew.exposed.migrations.helpers.SQLMigration
import suwayomi.tachidesk.graphql.types.DatabaseType
import suwayomi.tachidesk.server.serverConfig

/**
 * Migration M0080:
 * 1. user_extension: Tracks extension installation per user so extensions and their catalog entries
 *    are strictly isolated between accounts while sharing cached APK/JAR files on disk.
 * 2. user_github_backup: Stores per-user GitHub backup configuration, linked repo, interval and sync status.
 */
@Suppress("ClassName", "unused")
class M0080_UserExtensionAndGitHubBackup : SQLMigration() {
    override val sql by lazy {
        when (serverConfig.databaseType.value) {
            DatabaseType.H2 -> h2Query()
            DatabaseType.POSTGRESQL -> postgresQuery()
        }
    }

    private fun h2Query(): String =
        """
        CREATE TABLE IF NOT EXISTS user_extension (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
            pkg_name VARCHAR(128) NOT NULL,
            installed_at BIGINT NOT NULL DEFAULT 0,
            CONSTRAINT uq_user_extension UNIQUE (user_id, pkg_name)
        );

        CREATE TABLE IF NOT EXISTS user_github_backup (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
            github_username VARCHAR(128) NOT NULL,
            github_token VARCHAR(512) NOT NULL,
            repo_name VARCHAR(128) NOT NULL,
            backup_interval_hours INT NOT NULL DEFAULT 24,
            last_backup_at BIGINT NOT NULL DEFAULT 0,
            last_backup_sha VARCHAR(128) NOT NULL DEFAULT '',
            auto_backup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at BIGINT NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL DEFAULT 0,
            CONSTRAINT uq_user_github_backup UNIQUE (user_id)
        );

        MERGE INTO user_extension (user_id, pkg_name, installed_at)
        KEY(user_id, pkg_name)
        SELECT 1, pkg_name, 0 FROM extension WHERE is_installed = TRUE;
        """.trimIndent()

    private fun postgresQuery(): String =
        """
        CREATE TABLE IF NOT EXISTS user_extension (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
            pkg_name VARCHAR(128) NOT NULL,
            installed_at BIGINT NOT NULL DEFAULT 0,
            CONSTRAINT uq_user_extension UNIQUE (user_id, pkg_name)
        );

        CREATE TABLE IF NOT EXISTS user_github_backup (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
            github_username VARCHAR(128) NOT NULL,
            github_token VARCHAR(512) NOT NULL,
            repo_name VARCHAR(128) NOT NULL,
            backup_interval_hours INT NOT NULL DEFAULT 24,
            last_backup_at BIGINT NOT NULL DEFAULT 0,
            last_backup_sha VARCHAR(128) NOT NULL DEFAULT '',
            auto_backup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at BIGINT NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL DEFAULT 0,
            CONSTRAINT uq_user_github_backup UNIQUE (user_id)
        );

        INSERT INTO user_extension (user_id, pkg_name, installed_at)
        SELECT 1, pkg_name, 0 FROM extension WHERE is_installed = TRUE
        ON CONFLICT (user_id, pkg_name) DO NOTHING;
        """.trimIndent()
}
