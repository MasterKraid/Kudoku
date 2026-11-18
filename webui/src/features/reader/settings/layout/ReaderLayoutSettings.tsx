/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { useLingui } from '@lingui/react/macro';
import { ReaderSettingReadingMode } from '@/features/reader/settings/layout/components/ReaderSettingReadingMode.tsx';
import { ReaderSettingReadingDirection } from '@/features/reader/settings/layout/components/ReaderSettingReadingDirection.tsx';
import { ReaderSettingTapZoneLayout } from '@/features/reader/settings/layout/components/ReaderSettingTapZoneLayout.tsx';
import { ReaderSettingTapZoneInvertMode } from '@/features/reader/settings/layout/components/ReaderSettingTapZoneInvertMode.tsx';
import { ReaderSettingPageScaleMode } from '@/features/reader/settings/layout/components/ReaderSettingPageScaleMode.tsx';
import { ReaderSettingStretchPage } from '@/features/reader/settings/layout/components/ReaderSettingStretchPage.tsx';
import type { ReaderSettingsTypeProps } from '@/features/reader/Reader.types.ts';
import { ReaderSettingPageGap } from '@/features/reader/settings/layout/components/ReaderSettingPageGap.tsx';
import { ReaderSettingWidth } from '@/features/reader/settings/layout/components/ReaderSettingWidth.tsx';
import { ReaderSettingZoom } from '@/features/reader/settings/layout/components/ReaderSettingZoom.tsx';
import { DefaultSettingFootnote } from '@/features/reader/settings/components/DefaultSettingFootnote.tsx';
import { getReaderTapZoneStore, useReaderChaptersStore } from '@/features/reader/stores/ReaderStore.ts';
import { ReaderDefaultLayoutSettings } from '@/features/reader/settings/layout/ReaderDefaultLayoutSettings.tsx';
import { ReaderService } from '@/features/reader/services/ReaderService.ts';

export const ReaderLayoutSettings = ({
    settings,
    updateSetting,
    isDefaultable,
    onDefault,
    isSeriesMode,
    setTransparent,
}: ReaderSettingsTypeProps & {
    isSeriesMode?: boolean;
}) => {
    const { t } = useLingui();
    const { isPreviousChapterLocked, setIsPreviousChapterLocked } = useReaderChaptersStore(
        'isPreviousChapterLocked',
        'setIsPreviousChapterLocked',
    );

    return (
        <Stack sx={{ gap: 2 }}>
            <DefaultSettingFootnote areDefaultSettings={!isDefaultable} />
            {isSeriesMode && (
                <>
                    <Typography>{t`Series settings`}</Typography>
                    <ReaderSettingReadingMode
                        readingMode={settings.readingMode}
                        setReadingMode={(value) => updateSetting('readingMode', value)}
                        isDefaultable={isDefaultable}
                        onDefault={() => onDefault?.('readingMode')}
                    />
                </>
            )}
            <ReaderSettingPageGap
                pageGap={settings.pageGap}
                readingMode={settings.readingMode}
                isDefaultable={isDefaultable}
                onDefault={() => onDefault?.('pageGap')}
                updateSetting={(...args) => updateSetting('pageGap', ...args)}
            />
            <ReaderSettingReadingDirection
                readingDirection={settings.readingDirection}
                setReadingDirection={(value) => updateSetting('readingDirection', value)}
                isDefaultable={isDefaultable}
                onDefault={() => onDefault?.('readingDirection')}
            />
            <ReaderSettingTapZoneLayout
                tapZoneLayout={settings.tapZoneLayout}
                setTapZoneLayout={(value) => {
                    getReaderTapZoneStore().setShowPreview(true);
                    updateSetting('tapZoneLayout', value);
                }}
                isDefaultable={isDefaultable}
                onDefault={() => {
                    getReaderTapZoneStore().setShowPreview(true);
                    onDefault?.('tapZoneLayout');
                }}
            />
            <ReaderSettingTapZoneInvertMode
                tapZoneInvertMode={settings.tapZoneInvertMode}
                setTapZoneInvertMode={(value) => {
                    getReaderTapZoneStore().setShowPreview(true);
                    updateSetting('tapZoneInvertMode', value);
                }}
                isDefaultable={isDefaultable}
                onDefault={() => {
                    getReaderTapZoneStore().setShowPreview(true);
                    onDefault?.('tapZoneInvertMode');
                }}
            />
            <ReaderSettingPageScaleMode
                pageScaleMode={settings.pageScaleMode}
                setPageScaleMode={(value) => updateSetting('pageScaleMode', value)}
                isDefaultable={isDefaultable}
                onDefault={() => onDefault?.('pageScaleMode')}
            />
            <ReaderSettingZoom
                readerZoom={settings.readerZoom?.value}
                isDefault={settings.readerZoom?.isDefault}
                isDefaultable={isDefaultable}
                onDefault={() => onDefault?.('readerZoom')}
                updateSetting={(...args) => updateSetting(...args)}
                setTransparent={setTransparent}
            />
            <ReaderSettingStretchPage
                pageScaleMode={settings.pageScaleMode.value}
                shouldStretchPage={settings.shouldStretchPage.value}
                setShouldStretchPage={(value) => updateSetting('shouldStretchPage', value)}
            />
            <ReaderSettingWidth
                readerWidth={settings.readerWidth.value}
                pageScaleMode={settings.pageScaleMode.value}
                isDefaultable={isDefaultable}
                onDefault={() => onDefault?.('readerWidth')}
                updateSetting={(...args) => updateSetting(...args)}
                setTransparent={setTransparent}
            />
            {isSeriesMode && (
                <Card variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {t`Previous chapters`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {isPreviousChapterLocked
                                    ? t`Locked. Scrolling up will not load previous chapters.`
                                    : t`Unlocked. Scrolling up will load previous chapters.`}
                            </Typography>
                        </Box>
                        <Button
                            size="small"
                            variant={isPreviousChapterLocked ? 'outlined' : 'contained'}
                            color={isPreviousChapterLocked ? 'primary' : 'warning'}
                            onClick={() => setIsPreviousChapterLocked(!isPreviousChapterLocked)}
                            startIcon={isPreviousChapterLocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                        >
                            {isPreviousChapterLocked ? t`Unlock` : t`Lock`}
                        </Button>
                    </Stack>
                </Card>
            )}
            {isSeriesMode && (
                <>
                    <Divider />
                    <ReaderDefaultLayoutSettings
                        updateSetting={(setting, value, commit, _, profile) =>
                            ReaderService.updateSetting(setting, value, commit, true, profile)
                        }
                        isSeriesMode={isSeriesMode}
                        setTransparent={setTransparent}
                    />
                </>
            )}
        </Stack>
    );
};
