/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState } from 'react';
import type { Theme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FolderOffIcon from '@mui/icons-material/FolderOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CloseIcon from '@mui/icons-material/Close';
import { useLocalRepository } from '@/features/local-repository/hooks/useLocalRepository.ts';

function getBorderColor(theme: Theme, isConnected: boolean, hasError: boolean): string {
    if (isConnected) {
        return alpha(theme.palette.success.main, 0.4);
    }
    if (hasError) {
        return alpha(theme.palette.error.main, 0.4);
    }
    return alpha(theme.palette.divider, 1);
}

function getBackgroundColor(theme: Theme, isConnected: boolean, hasError: boolean): string {
    if (isConnected) {
        return alpha(theme.palette.success.main, 0.06);
    }
    if (hasError) {
        return alpha(theme.palette.error.main, 0.06);
    }
    return theme.palette.action.hover;
}

function StatusIcon({
    isLoading,
    isConnected,
    hasError,
    isSupported,
}: {
    isLoading: boolean;
    isConnected: boolean;
    hasError: boolean;
    isSupported: boolean;
}) {
    if (isLoading) {
        return <CircularProgress size={22} sx={{ mt: 0.3 }} />;
    }
    if (isConnected) {
        return <CheckCircleIcon color="success" sx={{ mt: 0.3 }} />;
    }
    if (hasError) {
        return <ErrorIcon color="error" sx={{ mt: 0.3 }} />;
    }
    if (isSupported) {
        return <FolderOpenIcon color="action" sx={{ mt: 0.3 }} />;
    }
    return <FolderOffIcon color="disabled" sx={{ mt: 0.3 }} />;
}

function ActionButtons({
    isConnected,
    isSupported,
    isLoading,
    onConnect,
    onDisconnect,
}: {
    isConnected: boolean;
    isSupported: boolean;
    isLoading: boolean;
    onConnect: () => Promise<void>;
    onDisconnect: () => void;
}) {
    if (isConnected) {
        return (
            <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={onDisconnect}
                disabled={isLoading}
                startIcon={<FolderOffIcon />}
            >
                Unlink folder
            </Button>
        );
    }
    if (isSupported) {
        return (
            <Button
                size="small"
                variant="contained"
                color="primary"
                onClick={onConnect}
                disabled={isLoading}
                startIcon={isLoading ? <CircularProgress size={14} color="inherit" /> : <FolderOpenIcon />}
            >
                {isLoading ? 'Linking…' : 'Choose folder'}
            </Button>
        );
    }
    return null;
}

function DescriptionText({
    isConnected,
    directoryName,
    isSupported,
}: {
    isConnected: boolean;
    directoryName: string | null;
    isSupported: boolean;
}) {
    if (isConnected && directoryName) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                Saving chapters to <strong>{directoryName}</strong>
            </Typography>
        );
    }
    if (!isSupported) {
        return (
            <Typography variant="body2" color="text.secondary">
                Your browser does not support the FileSystem Access API. Downloaded chapters will be stored
                offline in browser IndexedDB storage and can be exported to your Downloads folder after each
                chapter download.
            </Typography>
        );
    }
    return (
        <Typography variant="body2" color="text.secondary">
            Link a local folder so downloaded chapters are saved as <code>.cbz</code> files directly to your
            disk. Without a linked folder, chapters are saved in browser storage.
        </Typography>
    );
}

/**
 * LocalRepositoryBanner
 *
 * Shows in a panel/settings area to let users:
 * - Connect a local directory (FileSystem Access API, Chromium-based)
 * - See their linked directory name and status
 * - Disconnect / re-link the folder
 * - Shows a graceful fallback message on unsupported browsers (Firefox, mobile)
 */
export function LocalRepositoryBanner() {
    const { isSupported, isConnected, directoryName, isLoading, error, connect, disconnect } = useLocalRepository();

    const [dismissed, setDismissed] = useState(false);

    if (dismissed) {
        return null;
    }

    const hasError = Boolean(error);

    return (
        <Box
            sx={(theme) => ({
                borderRadius: 2,
                border: `1px solid ${getBorderColor(theme, isConnected, hasError)}`,
                backgroundColor: getBackgroundColor(theme, isConnected, hasError),
                p: 2,
                position: 'relative',
            })}
        >
            {/* Dismiss button */}
            {!isConnected && (
                <Tooltip title="Dismiss">
                    <IconButton
                        size="small"
                        onClick={() => {
                            setDismissed(true);
                        }}
                        sx={{ position: 'absolute', top: 6, right: 6 }}
                        aria-label="Dismiss local repository banner"
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}

            <Stack sx={{ flexDirection: 'row', alignItems: 'flex-start', gap: 1.5 }}>
                <StatusIcon
                    isLoading={isLoading}
                    isConnected={isConnected}
                    hasError={hasError}
                    isSupported={isSupported}
                />

                <Stack sx={{ flexGrow: 1, gap: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                        {isConnected ? 'Local folder linked' : 'Local download folder'}
                    </Typography>

                    <DescriptionText
                        isConnected={isConnected}
                        directoryName={directoryName}
                        isSupported={isSupported}
                    />

                    {error && (
                        <Typography variant="body2" color="error.main" sx={{ mt: 0.5 }}>
                            {error}
                        </Typography>
                    )}

                    <Stack sx={{ flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                        <ActionButtons
                            isConnected={isConnected}
                            isSupported={isSupported}
                            isLoading={isLoading}
                            onConnect={connect}
                            onDisconnect={disconnect}
                        />
                    </Stack>
                </Stack>
            </Stack>
        </Box>
    );
}
