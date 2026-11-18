/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React, { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReplayIcon from '@mui/icons-material/Replay';
import {
    ClientDownloadManager,
    type DownloadEntry,
    useClientDownloadStore,
} from '@/features/download-manager/services/ClientDownloadManager.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) {
        return '';
    }
    if (bytesPerSec < 1024) {
        return `${bytesPerSec.toFixed(0)} B/s`;
    }
    if (bytesPerSec < 1024 * 1024) {
        return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
    if (seconds <= 0 || !Number.isFinite(seconds)) {
        return '';
    }
    if (seconds < 60) {
        return `${Math.ceil(seconds)}s`;
    }
    return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}

function statusColor(status: DownloadEntry['status']): 'primary' | 'success' | 'error' | 'inherit' {
    switch (status) {
        case 'downloading':
            return 'primary';
        case 'done':
            return 'success';
        case 'error':
            return 'error';
        default:
            return 'inherit';
    }
}

function getStatusTextColor(status: DownloadEntry['status']): string {
    switch (status) {
        case 'done':
            return 'success.main';
        case 'error':
            return 'error.main';
        case 'cancelled':
            return 'text.disabled';
        default:
            return 'text.secondary';
    }
}

function getStatusText(status: DownloadEntry['status'], progress: number): string {
    switch (status) {
        case 'done':
            return '✓ Done';
        case 'error':
            return 'Error';
        case 'cancelled':
            return 'Cancelled';
        case 'queued':
            return 'Queued';
        default:
            return `${progress}%`;
    }
}

// ---------------------------------------------------------------------------
// Single row
// ---------------------------------------------------------------------------

interface DownloadRowProps {
    entry: DownloadEntry;
}

const DownloadRow: React.FC<DownloadRowProps> = ({ entry }) => {
    const { chapterId, chapterName, mangaTitle, status, progress, speed, eta, error } = entry;

    const handleCancel = useCallback(() => {
        ClientDownloadManager.cancelDownload(chapterId);
    }, [chapterId]);

    const handleRetry = useCallback(() => {
        ClientDownloadManager.queueChapter(
            { id: chapterId, name: chapterName, chapterNumber: 0, sourceOrder: 0 },
            mangaTitle,
            entry.mangaId,
        );
    }, [chapterId, chapterName, mangaTitle, entry.mangaId]);

    return (
        <Box sx={{ px: 2, py: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {/* Title / chapter */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                        {mangaTitle}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {chapterName}
                    </Typography>
                </Box>

                {/* Status label */}
                <Typography
                    variant="caption"
                    color={getStatusTextColor(status)}
                    sx={{ whiteSpace: 'nowrap' }}
                >
                    {getStatusText(status, progress)}
                </Typography>

                {/* Actions */}
                {(status === 'queued' || status === 'downloading') && (
                    <Tooltip title="Cancel">
                        <IconButton size="small" onClick={handleCancel}>
                            <CancelIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
                {(status === 'error' || status === 'cancelled') && (
                    <Tooltip title="Retry">
                        <IconButton size="small" onClick={handleRetry}>
                            <ReplayIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>

            {/* Progress bar */}
            {(status === 'downloading' || status === 'queued') && (
                <LinearProgress
                    variant={status === 'queued' ? 'indeterminate' : 'determinate'}
                    value={progress}
                    color={statusColor(status)}
                    sx={{ mt: 0.5, borderRadius: 1 }}
                />
            )}

            {/* Speed / ETA */}
            {status === 'downloading' && (speed > 0 || eta > 0) && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                    {[formatSpeed(speed), eta > 0 ? `ETA ${formatEta(eta)}` : ''].filter(Boolean).join(' · ')}
                </Typography>
            )}

            {/* Error message */}
            {status === 'error' && error && (
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.25 }}>
                    <ErrorOutlinedIcon fontSize="inherit" color="error" />
                    <Typography variant="caption" color="error" noWrap>
                        {error}
                    </Typography>
                </Stack>
            )}
        </Box>
    );
};

// ---------------------------------------------------------------------------
// Drawer / floating widget
// ---------------------------------------------------------------------------

export const ClientDownloadDrawer: React.FC = () => {
    const queue = useClientDownloadStore((s) => s.queue);
    const [open, setOpen] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    // Active = not done and not dismissed
    const active = queue.filter((e) => e.status !== 'done' || dismissed === false);
    const downloading = queue.filter((e) => e.status === 'downloading' || e.status === 'queued');
    const hasItems = active.length > 0;

    if (!hasItems && dismissed) {
        return null;
    }

    // If there's nothing left visible after all done items aged out, hide the whole drawer
    if (queue.length === 0) {
        return null;
    }

    const toggleOpen = () => {
        setOpen((v) => !v);
    };
    const dismiss = () => {
        setDismissed(true);
    };

    return (
        <Paper
            elevation={6}
            sx={{
                position: 'fixed',
                bottom: 'calc(var(--toast-bottom, 14px) + 72px)',
                right: 16,
                width: 340,
                maxWidth: 'calc(100vw - 32px)',
                zIndex: (theme) => theme.zIndex.snackbar - 1,
                borderRadius: 2,
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <Stack
                direction="row"
                spacing={1}
                sx={{ px: 2, py: 1, bgcolor: 'background.paper', cursor: 'pointer', alignItems: 'center' }}
                onClick={toggleOpen}
            >
                <DownloadIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" sx={{ flex: 1 }}>
                    Downloads
                    {downloading.length > 0 && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            ({downloading.length} active)
                        </Typography>
                    )}
                </Typography>
                <IconButton
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation();
                        dismiss();
                    }}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>
                <IconButton size="small">
                    {open ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                </IconButton>
            </Stack>

            <Divider />

            {/* Queue list */}
            <Collapse in={open}>
                <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                    {active.map((entry, idx) => (
                        <React.Fragment key={entry.chapterId}>
                            {idx > 0 && <Divider sx={{ mx: 2 }} />}
                            <DownloadRow entry={entry} />
                        </React.Fragment>
                    ))}
                    {active.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                            No active downloads.
                        </Typography>
                    )}
                </Box>
            </Collapse>
        </Paper>
    );
};

// ---------------------------------------------------------------------------
// Floating action button – shown when the drawer is dismissed but downloads
// are still running. Click re-opens it.
// ---------------------------------------------------------------------------

export const ClientDownloadFab: React.FC = () => {
    const queue = useClientDownloadStore((s) => s.queue);
    const downloading = queue.filter((e) => e.status === 'downloading' || e.status === 'queued');

    if (downloading.length === 0) {
        return null;
    }

    return (
        <Tooltip title={`${downloading.length} download${downloading.length > 1 ? 's' : ''} in progress`}>
            <Fab
                size="small"
                color="primary"
                sx={{
                    position: 'fixed',
                    bottom: 'calc(var(--toast-bottom, 14px) + 72px)',
                    right: 16,
                    zIndex: (theme) => theme.zIndex.snackbar - 1,
                }}
            >
                <DownloadIcon />
            </Fab>
        </Tooltip>
    );
};
