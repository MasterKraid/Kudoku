/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useState } from 'react';
import { LocalFileSystem } from '@/features/local-repository/services/LocalFileSystem.ts';

export interface LocalRepositoryState {
    /** Whether the FileSystem Access API is available in this browser. */
    isSupported: boolean;
    /** Whether a directory handle is currently active and permission is granted. */
    isConnected: boolean;
    /** The name of the linked directory, or null when not connected. */
    directoryName: string | null;
    /** True while a permission request / handle restoration is in progress. */
    isLoading: boolean;
    /** Error message from the last failed operation, if any. */
    error: string | null;
}

export interface LocalRepositoryActions {
    /** Opens the native directory picker and links the chosen folder. */
    connect: () => Promise<void>;
    /** Drops the active handle (without erasing stored IndexedDB data). */
    disconnect: () => void;
    /** Re-checks whether the stored handle is still accessible. */
    refresh: () => Promise<void>;
}

export type UseLocalRepositoryReturn = LocalRepositoryState & LocalRepositoryActions;

export function useLocalRepository(): UseLocalRepositoryReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [directoryName, setDirectoryName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isSupported = LocalFileSystem.isSupported();

    // On mount: attempt to restore a previously linked handle
    const refresh = useCallback(async () => {
        if (!isSupported) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const handle = await LocalFileSystem.getStoredDirectoryHandle();
            if (handle) {
                setIsConnected(true);
                setDirectoryName(handle.name);
            } else {
                setIsConnected(false);
                setDirectoryName(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setIsConnected(false);
            setDirectoryName(null);
        } finally {
            setIsLoading(false);
        }
    }, [isSupported]);

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const connect = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const name = await LocalFileSystem.requestDirectoryPermission();
            setIsConnected(true);
            setDirectoryName(name);
        } catch (err) {
            // User cancelled the picker or permission was denied
            if (err instanceof Error && err.name === 'AbortError') {
                // No-op — user dismissed the picker
            } else {
                setError(err instanceof Error ? err.message : String(err));
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    const disconnect = useCallback(() => {
        LocalFileSystem.disconnect();
        setIsConnected(false);
        setDirectoryName(null);
        setError(null);
    }, []);

    return {
        isSupported,
        isConnected,
        directoryName,
        isLoading,
        error,
        connect,
        disconnect,
        refresh,
    };
}
