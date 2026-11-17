/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Stack from '@mui/material/Stack';
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
import { ButtonSelectInput } from '@/base/components/inputs/ButtonSelectInput.tsx';
import type { IReaderSettingsWithDefaultFlag, ReadingMode } from '@/features/reader/Reader.types.ts';

export const ReaderDefaultLayoutSettings = ({
    profiles = READING_MODE_VALUES,
    readingMode,
    ...props
}: Omit<ComponentProps<typeof ReaderLayoutSettings>, 'setShowPreview' | 'settings'> & {
    profiles?: ReadingMode[];
    readingMode?: IReaderSettingsWithDefaultFlag['readingMode'];
}) => {
    const { updateSetting, isSeriesMode } = props;

    const { t } = useLingui();

    const [selectedProfile, setSelectedProfile] = useState<ReadingMode>(
        readingMode?.value ?? profiles[0] ?? READING_MODE_VALUES[0],
    );

    useEffect(() => {
        if (readingMode?.value !== undefined && profiles.includes(readingMode.value)) {
            setSelectedProfile(readingMode.value);
        }
    }, [readingMode?.value, profiles]);

    const activeProfile = profiles.includes(selectedProfile) ? selectedProfile : profiles[0];

    return (
        <Stack sx={{ gap: 2, pb: Number(!isSeriesMode) * 2 }}>
            {readingMode !== undefined && (
                <Stack sx={{ pt: 2, px: 2 }}>
                    <ReaderSettingReadingMode
                        readingMode={readingMode}
                        setReadingMode={(value) => {
                            updateSetting('readingMode', value);
                            setSelectedProfile(value);
                        }}
                    />
                </Stack>
            )}
            {profiles.length > 1 && (
                <Stack sx={{ px: 2 }}>
                    <ButtonSelectInput
                        label="Profile layout settings"
                        value={activeProfile}
                        values={profiles}
                        setValue={(profile) => setSelectedProfile(profile)}
                        valueToDisplayData={READING_MODE_VALUE_TO_DISPLAY_DATA}
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
