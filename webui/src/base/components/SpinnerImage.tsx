/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { Ref } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { STABLE_EMPTY_OBJECT } from '@/base/Base.constants.ts';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import BrokenImageIcon from '@mui/icons-material/BrokenImage';
import RefreshIcon from '@mui/icons-material/Refresh';
import ImageIcon from '@mui/icons-material/Image';
import type { SxProps, Theme } from '@mui/material/styles';
import { useLingui } from '@lingui/react/macro';
import { usePrevious } from '@mantine/hooks';
import type { ImageRequest } from '@/lib/requests/RequestManager.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import type { Priority } from '@/lib/Queue.ts';
import { applyStyles } from '@/base/utils/ApplyStyles.ts';
import { useIntersectionObserver } from '@/base/hooks/useIntersectionObserver.tsx';
import { noOp } from '@/lib/HelperFunctions.ts';
import { MUIUtil } from '@/lib/mui/MUI.util.ts';

export interface SpinnerImageProps {
    shouldLoad?: boolean;

    src: string;
    alt: string;

    spinnerStyle?: SxProps<Theme> & { small?: boolean };
    imgStyle?: SxProps<Theme>;
    hideImgStyle?: Omit<SxProps<Theme>, 'accentColor'>;

    onLoad?: () => void;
    onError?: () => void;

    shouldDecode?: boolean;
    useFetchApi?: boolean;
    disableCors?: boolean;
    ignoreQueue?: boolean;

    priority?: Priority;

    retryKeyPrefix?: string;

    ref?: Ref<HTMLImageElement | HTMLDivElement | null>;
}

export const SpinnerImage = ({ ref, ...props }: SpinnerImageProps) => {
    const {
        shouldLoad = true,
        shouldDecode,
        useFetchApi,
        disableCors,
        ignoreQueue,
        src,
        alt,
        onLoad,
        onError,
        spinnerStyle: { small, ...spinnerStyle } = STABLE_EMPTY_OBJECT,
        imgStyle,
        hideImgStyle,
        priority,
        retryKeyPrefix,
    } = props;

    const { t } = useLingui();

    const loadingIndicatorRef = useRef<HTMLDivElement | null>(null);

    const showMissingImageIcon = !src.length;

    const isBlobOrData = typeof src === 'string' && (src.startsWith('blob:') || src.startsWith('data:'));

    const [imageSourceUrl, setImageSourceUrl] = useState<string | undefined>(() => {
        if (isBlobOrData) return src;
        return requestManager.getCachedImageUrl(src);
    });
    const [imgLoadRetryKey, setImgLoadRetryKey] = useState(0);
    const [isLoading, setIsLoading] = useState<boolean>();
    const [hasError, setHasError] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    const previousSrc = usePrevious(src);
    const previousImgLoadRetryKey = usePrevious(imgLoadRetryKey);
    const previousRetryKeyPrefix = usePrevious(retryKeyPrefix);

    const updateImageState = (loading: boolean, error: boolean = false, aborted: boolean = false) => {
        setIsLoading(loading);
        setHasError(error);

        if (error && !loading && !aborted) {
            onError?.();
        }

        if (!loading && !error && !aborted) {
            onLoad?.();
        }
    };

    useIntersectionObserver(
        loadingIndicatorRef,
        useCallback((entries) => setIsVisible(entries[0].isIntersecting), []),
    );

    useEffect(() => {
        const didSrcChange = previousSrc !== src;
        const isLoadedAndSrcUnchanged = !!imageSourceUrl && !didSrcChange;

        const isLocalRetry =
            hasError && previousImgLoadRetryKey !== undefined && previousImgLoadRetryKey !== imgLoadRetryKey;
        const isGlobalRetry =
            hasError && previousRetryKeyPrefix !== undefined && previousRetryKeyPrefix !== retryKeyPrefix;
        const isRetry = isLocalRetry || isGlobalRetry;

        const finalShouldLoad = shouldLoad || isRetry;

        if (showMissingImageIcon || !finalShouldLoad || (isLoadedAndSrcUnchanged && !isRetry)) {
            return () => {};
        }

        if (isRetry || didSrcChange) {
            setHasError(false);
            const cached = requestManager.getCachedImageUrl(src);
            if (cached) {
                setImageSourceUrl(cached);
                updateImageState(false);
                return () => {};
            }
        }

        let isAborted = false;
        let imageRequest: ImageRequest = {
            response: Promise.resolve(''),
            cleanup: noOp,
            abortRequest: noOp,
            fromCache: false,
        };
        const abortRequest = () => {
            isAborted = true;
            imageRequest.cleanup();
            imageRequest.abortRequest(new Error('Component was unmounted'));
        };
        const fetchImage = async () => {
            try {
                if (isBlobOrData) {
                    setImageSourceUrl(src);
                    updateImageState(false);
                    return;
                }

                imageRequest = await requestManager.requestImage(src, {
                    priority,
                    shouldDecode,
                    useFetchApi,
                    disableCors,
                    ignoreQueue,
                });

                // In case the request got aborted before it was queued, the abort was called against the "default noop" function and did nothing.
                // Thus, abort again to ensure that the actual queued request gets aborted.
                if (isAborted) {
                    abortRequest();
                }

                if (!imageRequest.fromCache) {
                    updateImageState(true);
                }

                const image = await imageRequest.response;

                updateImageState(false);
                setImageSourceUrl(image);
            } catch (e) {
                const wasAborted =
                    e instanceof Error && (e.name === 'AbortError' || e.message === 'Component was unmounted');
                updateImageState(false, !wasAborted, wasAborted);
            }
        };

        fetchImage().catch(() => {});

        return () => {
            abortRequest();
        };
    }, [src, imgLoadRetryKey, retryKeyPrefix, showMissingImageIcon, shouldLoad]);

    const setImgOrPlaceholderRef = useCallback(
        (element: HTMLImageElement | HTMLDivElement | null) => {
            if (typeof ref === 'function') {
                ref(element);
            } else if (ref && 'current' in ref) {
                // eslint-disable-next-line no-param-reassign
                (ref as any).current = element;
            }
        },
        [ref],
    );

    return (
        <>
            {showMissingImageIcon ? (
                <Stack
                    ref={setImgOrPlaceholderRef}
                    data-reader-page="true"
                    sx={MUIUtil.mergeSx(
                        {
                            height: '100%',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: (theme) => theme.palette.background.default,
                        },
                        spinnerStyle,
                    )}
                >
                    <ImageIcon fontSize="large" />
                </Stack>
            ) : (
                <Box
                    component="img"
                    data-reader-page="true"
                    key={`${src}_${imgLoadRetryKey}_${retryKeyPrefix}`}
                    sx={[
                        ...(Array.isArray(imgStyle) ? (imgStyle ?? []) : [imgStyle]),
                        applyStyles(!imageSourceUrl || isLoading || hasError, {
                            ...hideImgStyle,
                            ...applyStyles(!hideImgStyle, {
                                display: 'none',
                            }),
                        }),
                    ]}
                    ref={setImgOrPlaceholderRef}
                    crossOrigin={disableCors || isBlobOrData ? undefined : 'anonymous'}
                    src={imageSourceUrl}
                    alt={alt}
                    draggable={false}
                    onError={() => {
                        setImageSourceUrl(undefined);
                        updateImageState(false, true);
                    }}
                />
            )}
            {(!!isLoading || (src && !imageSourceUrl) || hasError) && (
                <Stack
                    data-reader-page="true"
                    ref={(node: HTMLDivElement | null) => {
                        loadingIndicatorRef.current = node;
                        if (!imageSourceUrl) {
                            setImgOrPlaceholderRef(node);
                        }
                    }}
                    sx={MUIUtil.mergeSx(
                        {
                            height: '100%',
                            justifyContent: 'center',
                            alignItems: 'center',
                        },
                        spinnerStyle,
                    )}
                >
                    <Stack
                        sx={{
                            height: '100%',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {!hasError && isVisible && !!isLoading && <CircularProgress thickness={5} />}
                        {hasError && (
                            <>
                                <BrokenImageIcon />
                                <Button
                                    startIcon={!small && <RefreshIcon />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setImgLoadRetryKey((prevState) => (prevState + 1) % 100);
                                    }}
                                    size={small ? 'small' : 'large'}
                                >
                                    {small ? <RefreshIcon /> : t`Retry`}
                                </Button>
                            </>
                        )}
                    </Stack>
                </Stack>
            )}
        </>
    );
};
