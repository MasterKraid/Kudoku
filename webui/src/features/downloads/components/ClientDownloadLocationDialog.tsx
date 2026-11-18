/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React, { useEffect, useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import FolderIcon from '@mui/icons-material/Folder';
import StorageIcon from '@mui/icons-material/Storage';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useLingui } from '@lingui/react/macro';
import { LocalFileSystem } from '@/features/local-repository/services/LocalFileSystem.ts';
import { makeToast } from '@/base/utils/Toast.ts';

interface ClientDownloadLocationDialogProps {
    open: boolean;
    onClose: () => void;
}

function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const ClientDownloadLocationDialog: React.FC<ClientDownloadLocationDialogProps> = ({ open, onClose }) => {
    const { t } = useLingui();
    const isSupported = LocalFileSystem.isSupported();

    const [directoryName, setDirectoryName] = useState<string | null>(null);
    const [storageUsage, setStorageUsage] = useState<{ used?: number; quota?: number } | null>(null);
    const [offlineBytes, setOfflineBytes] = useState<number>(0);
    const [mangaCount, setMangaCount] = useState<number>(0);
    const [totalChapters, setTotalChapters] = useState<number>(0);
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [confirmClearCacheOpen, setConfirmClearCacheOpen] = useState(false);

    const refreshState = useCallback(async () => {
        try {
            const handle = await LocalFileSystem.getStoredDirectoryHandle();
            setDirectoryName(handle ? handle.name : null);
        } catch {
            setDirectoryName(null);
        }

        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                setStorageUsage({ used: estimate.usage, quota: estimate.quota });
            } catch {
                setStorageUsage(null);
            }
        }

        try {
            const list = await LocalFileSystem.getLocalMangaList();
            setMangaCount(list.length);
            const sum = list.reduce((acc, m) => acc + (m.chapterCount || 0), 0);
            setTotalChapters(sum);
        } catch {
            setMangaCount(0);
            setTotalChapters(0);
        }

        try {
            const bytes = await LocalFileSystem.getOfflineChaptersByteSize();
            setOfflineBytes(bytes);
        } catch {
            setOfflineBytes(0);
        }
    }, []);

    useEffect(() => {
        if (open) {
            refreshState();
        }
    }, [open, refreshState]);

    const handleSelectFolder = async () => {
        const handle = await LocalFileSystem.selectDirectory();
        if (handle) {
            setDirectoryName(handle.name);
            makeToast(t`Linked to folder: ${handle.name}`, 'success');
            refreshState();
        }
    };

    const handleUseBrowserStorage = async () => {
        await LocalFileSystem.forgetDirectoryHandle();
        setDirectoryName(null);
        makeToast(t`Switched to browser offline storage (IndexedDB)`, 'info');
        refreshState();
    };

    const handleClearAll = async () => {
        await LocalFileSystem.clearAllOfflineStorage();
        setConfirmClearOpen(false);
        makeToast(t`All offline downloads cleared`, 'info');
        refreshState();
    };

    const handleClearCache = async () => {
        await LocalFileSystem.clearClientCache();
        setConfirmClearCacheOpen(false);
        makeToast(t`Client cache cleared successfully`, 'success');
        refreshState();
    };

    return (
        <>
            <Dialog open={open && !confirmClearOpen && !confirmClearCacheOpen} onClose={onClose} maxWidth="sm" fullWidth>
                <DialogTitle>{t`Download Location & Storage`}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2.5}>
                        <Typography variant="body2" color="text.secondary">
                            {t`Manga chapters are downloaded client-side and saved to this device for offline reading.`}
                        </Typography>

                        {/* Current Storage Mode */}
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'background.paper',
                            }}
                        >
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                {directoryName ? (
                                    <FolderIcon color="primary" fontSize="large" />
                                ) : (
                                    <StorageIcon color="primary" fontSize="large" />
                                )}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        {t`Current storage location:`}
                                    </Typography>
                                    <Typography variant="body1" fontWeight={600} noWrap>
                                        {directoryName
                                            ? t`Folder: ${directoryName}`
                                            : t`Browser Storage (IndexedDB)`}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {directoryName
                                            ? t`Files are saved as CBZ archives directly to this local directory.`
                                            : t`Files are cached securely in your browser's local offline database.`}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>

                        {/* Storage Stats */}
                        <Box sx={{ px: 0.5 }}>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">
                                    {t`Offline downloads:`}
                                </Typography>
                                <Typography variant="body2" fontWeight={500}>
                                    {totalChapters > 0
                                        ? t`${totalChapters} chapters across ${mangaCount} manga`
                                        : t`No downloaded chapters`}
                                </Typography>
                            </Stack>

                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">
                                    {t`Offline chapters storage:`}
                                </Typography>
                                <Typography variant="body2" fontWeight={500}>
                                    {formatBytes(offlineBytes)}
                                </Typography>
                            </Stack>

                            {storageUsage?.used != null && (
                                <Box sx={{ mt: 0.5 }}>
                                    <Stack direction="row" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">
                                            {t`Total browser origin storage:`}
                                        </Typography>
                                        <Typography variant="body2" fontWeight={500}>
                                            {storageUsage.quota
                                                ? `${formatBytes(storageUsage.used)} / ${formatBytes(storageUsage.quota)}`
                                                : formatBytes(storageUsage.used)}
                                        </Typography>
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                                        {t`Includes online manga image caches and service worker network assets.`}
                                    </Typography>
                                </Box>
                            )}
                        </Box>

                        <Divider />

                        {/* Folder Picker or Info */}
                        {isSupported ? (
                            <Stack spacing={1.5}>
                                <Button
                                    variant="contained"
                                    startIcon={<FolderIcon />}
                                    onClick={handleSelectFolder}
                                    fullWidth
                                >
                                    {directoryName ? t`Change Local Folder...` : t`Choose Local Folder...`}
                                </Button>

                                {directoryName && (
                                    <Button
                                        variant="outlined"
                                        startIcon={<StorageIcon />}
                                        onClick={handleUseBrowserStorage}
                                        fullWidth
                                    >
                                        {t`Use Browser Storage Instead`}
                                    </Button>
                                )}
                            </Stack>
                        ) : (
                            <Alert severity="info" sx={{ py: 0.5 }}>
                                {t`Your browser does not support the File System Access API. All chapters will be stored in offline browser storage.`}
                            </Alert>
                        )}

                        {/* Storage Management Actions */}
                        <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
                            <Button
                                variant="outlined"
                                color="inherit"
                                startIcon={<RefreshIcon />}
                                onClick={() => setConfirmClearCacheOpen(true)}
                                size="small"
                            >
                                {t`Clear client cache`}
                            </Button>

                            {totalChapters > 0 && (
                                <Button
                                    variant="text"
                                    color="error"
                                    startIcon={<DeleteIcon />}
                                    onClick={() => setConfirmClearOpen(true)}
                                    size="small"
                                >
                                    {t`Clear offline downloads`}
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} color="inherit">
                        {t`Close`}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirmation dialog for clearing client cache */}
            <Dialog open={confirmClearCacheOpen} onClose={() => setConfirmClearCacheOpen(false)} maxWidth="xs">
                <DialogTitle>{t`Clear Client Cache?`}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t`This will clear cached online images and network requests stored by the browser. Your login tokens, reading progress, and downloaded offline chapters will remain safe.`}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmClearCacheOpen(false)} color="inherit">
                        {t`Cancel`}
                    </Button>
                    <Button onClick={handleClearCache} color="primary" variant="contained">
                        {t`Clear Cache`}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirmation dialog for clearing offline storage */}
            <Dialog open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)} maxWidth="xs">
                <DialogTitle>{t`Clear All Offline Downloads?`}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t`This will permanently remove all downloaded chapter CBZ archives and cached data from this device.`}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmClearOpen(false)} color="inherit">
                        {t`Cancel`}
                    </Button>
                    <Button onClick={handleClearAll} color="error" variant="contained">
                        {t`Delete All`}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};
