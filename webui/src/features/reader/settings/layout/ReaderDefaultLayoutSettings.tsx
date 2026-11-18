/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import type { ReaderLayoutSettings } from '@/features/reader/settings/layout/ReaderLayoutSettings.tsx';
import { ReaderSettingProfileSettings } from '@/features/reader/settings/layout/components/ReaderSettingProfileSettings.tsx';
import {
    READING_MODE_VALUE_TO_DISPLAY_DATA,
    READING_MODE_VALUES,
} from '@/features/reader/settings/ReaderSettings.constants.tsx';
import { ReaderSettingReadingMode } from '@/features/reader/settings/layout/components/ReaderSettingReadingMode.tsx';
import type { IReaderSettingsWithDefaultFlag, ReadingMode } from '@/features/reader/Reader.types.ts';
import { useDefaultReaderSettingsWithDefaultFlag } from '@/features/reader/settings/ReaderSettingsMetadata.ts';
import { ReaderService } from '@/features/reader/services/ReaderService.ts';

export const ReaderDefaultLayoutSettings = ({
    profiles = READING_MODE_VALUES,
    readingMode: propReadingMode,
    ...props
}: Omit<ComponentProps<typeof ReaderLayoutSettings>, 'setShowPreview' | 'settings'> & {
    profiles?: ReadingMode[];
    readingMode?: IReaderSettingsWithDefaultFlag['readingMode'];
}) => {
    const { updateSetting, isSeriesMode } = props;

    const { t } = useLingui();

    const { settings: defaultGlobalSettings } = useDefaultReaderSettingsWithDefaultFlag();
    const effectiveReadingMode = propReadingMode ?? defaultGlobalSettings?.readingMode;

    const [selectedProfile, setSelectedProfile] = useState<ReadingMode>(
        effectiveReadingMode?.value ?? profiles[0] ?? READING_MODE_VALUES[0],
    );

    useEffect(() => {
        if (effectiveReadingMode?.value !== undefined && profiles.includes(effectiveReadingMode.value)) {
            setSelectedProfile(effectiveReadingMode.value);
        }
    }, [effectiveReadingMode?.value, profiles]);

    const activeProfile = profiles.includes(selectedProfile) ? selectedProfile : profiles[0];

    return (
        <Stack sx={{ gap: 2, pb: Number(!isSeriesMode) * 2 }}>
            {effectiveReadingMode !== undefined && (
                <Stack sx={{ pt: 2, px: 2, gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {t`Default reading mode`}
                    </Typography>
                    <ReaderSettingReadingMode
                        readingMode={effectiveReadingMode}
                        setReadingMode={(value) => {
                            ReaderService.updateSetting('readingMode', value, true, true);
                            setSelectedProfile(value);
                        }}
                    />
                </Stack>
            )}
            {activeProfile !== undefined && (
                <ReaderSettingProfileSettings
                    key={activeProfile}
                    profile={activeProfile}
                    title={t(READING_MODE_VALUE_TO_DISPLAY_DATA[activeProfile].title)}
                    {...props}
                />
            )}
        </Stack>
    );
};
