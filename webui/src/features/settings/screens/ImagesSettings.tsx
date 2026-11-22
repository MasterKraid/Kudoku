/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemButton from '@mui/material/ListItemButton';
import Switch from '@mui/material/Switch';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { CARD_LIST_SX } from '@/base/components/lists/cardListSx.ts';
import { ListSubheader } from '@/base/components/lists/ListSubheader.tsx';
import { useLingui } from '@lingui/react/macro';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { ListItemLink } from '@/base/components/lists/ListItemLink.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { ImageCache } from '@/lib/service-worker/ImageCache.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useLocalStorage } from '@/base/hooks/useStorage.tsx';

export const ImagesSettings = () => {
    const { t } = useLingui();

    useAppTitle(t`Images`);

    const [neverExpireThumbnails, setNeverExpireThumbnails] = useLocalStorage(
        'Settings::neverExpireThumbnailCache',
        true,
    );
    const [cacheMaxAgeDays, setCacheMaxAgeDays] = useLocalStorage(
        'Settings::thumbnailCacheMaxAgeDays',
        30,
    );

    const [triggerClearServerCache, { loading: isClearingServerCache }] = requestManager.useClearServerCache();

    const clearCache = async () => {
        try {
            await Promise.all([
                triggerClearServerCache({
                    variables: {
                        input: {
                            cachedPages: true,
                            cachedThumbnails: true,
                            downloadedThumbnails: false,
                        },
                    },
                }),
                ImageCache.clearAll(),
            ]);
            makeToast(t`Cleared the image cache successfully`, 'success');
        } catch (e) {
            makeToast(t`Could not clear the cache`, 'error', getErrorMessage(e));
        }
    };

    return (
        <List sx={CARD_LIST_SX}>
            <List
                subheader={
                    <ListSubheader component="div" id="thumbnail-cache-settings">
                        {t`Thumbnail cache`}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        primary={t`Permanent thumbnail cache (Never expire)`}
                        secondary={
                            neverExpireThumbnails
                                ? t`Thumbnails are cached permanently without time expiration (never auto-deleted by age). Server and client maintain a strict 1GB cap with LRU eviction.`
                                : t`Cache expiration is active. Thumbnails older than the configured duration below will expire.`
                        }
                    />
                    <Switch
                        edge="end"
                        checked={neverExpireThumbnails}
                        onChange={(e) => setNeverExpireThumbnails(e.target.checked)}
                    />
                </ListItem>

                <Collapse in={!neverExpireThumbnails} unmountOnExit>
                    <Box sx={{ px: 2, pt: 1, pb: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                            {t`Max cache age on client and server: ${cacheMaxAgeDays} days`}
                        </Typography>
                        <Stack direction="row" spacing={3} alignItems="center">
                            <Slider
                                value={cacheMaxAgeDays}
                                min={1}
                                max={365}
                                step={1}
                                onChange={(_, val) => setCacheMaxAgeDays(val as number)}
                                valueLabelDisplay="auto"
                                sx={{ flexGrow: 1 }}
                            />
                            <TextField
                                type="number"
                                size="small"
                                value={cacheMaxAgeDays}
                                onChange={(e) => {
                                    const parsed = parseInt(e.target.value, 10);
                                    if (!isNaN(parsed)) {
                                        setCacheMaxAgeDays(Math.max(1, Math.min(365, parsed)));
                                    }
                                }}
                                slotProps={{
                                    input: {
                                        endAdornment: <InputAdornment position="end">{t`days`}</InputAdornment>,
                                    },
                                    htmlInput: {
                                        min: 1,
                                        max: 365,
                                        style: { width: '4.5rem' },
                                    },
                                }}
                            />
                        </Stack>
                    </Box>
                </Collapse>

                <ListItem>
                    <ListItemText
                        primary={t`Storage quota`}
                        secondary={t`Capped at 1GB max across server disk storage and browser cache with automatic oldest-first pruning.`}
                    />
                </ListItem>
                <ListItemButton disabled={isClearingServerCache} onClick={clearCache}>
                    <ListItemText
                        primary={t`Clear cache`}
                        secondary={t`Wipes all cached manga cover thumbnails and reader page caches from both the server and client browser.`}
                    />
                    {isClearingServerCache && <CircularProgress size={20} sx={{ ml: 1 }} />}
                </ListItemButton>
            </List>

            <List
                subheader={
                    <ListSubheader component="div" id="image-processing-settings">
                        {t`Image processing`}
                    </ListSubheader>
                }
            >
                <ListItemLink to={AppRoutes.settings.children.images.children.processingDownloads.path}>
                    <ListItemText primary={t`Image download processing`} />
                </ListItemLink>
                <ListItemLink to={AppRoutes.settings.children.images.children.processingServe.path}>
                    <ListItemText primary={t`Image serve processing`} />
                </ListItemLink>
            </List>
        </List>
    );
};
