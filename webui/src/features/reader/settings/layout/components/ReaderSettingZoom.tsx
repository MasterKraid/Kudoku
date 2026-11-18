/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { useLingui } from '@lingui/react/macro';
import type { IReaderSettings } from '@/features/reader/Reader.types.ts';
import type { ReaderService } from '@/features/reader/services/ReaderService.ts';
import { SliderInput } from '@/base/components/inputs/SliderInput.tsx';
import { DEFAULT_READER_SETTINGS } from '@/features/reader/settings/ReaderSettings.constants.tsx';
import type { SelectButtonDefaultableProps } from '@/base/components/buttons/SelectButton.tsx';
import { coerceIn } from '@/lib/HelperFunctions.ts';

export const ReaderSettingZoom = ({
    readerZoom,
    isDefault,
    isDefaultable,
    onDefault,
    updateSetting,
}: Pick<IReaderSettings, 'readerZoom'> &
    Pick<SelectButtonDefaultableProps<IReaderSettings['readerZoom']['value']>, 'isDefaultable' | 'onDefault'> & {
        isDefault?: boolean;
        updateSetting: (...args: Parameters<typeof ReaderService.updateSetting>) => void;
        setTransparent?: (transparent: boolean) => void;
    }) => {
    const { t } = useLingui();

    const currentVal =
        typeof readerZoom === 'number'
            ? readerZoom
            : typeof (readerZoom as any)?.value === 'number'
              ? (readerZoom as any).value
              : typeof (readerZoom as any)?.value?.value === 'number'
                ? (readerZoom as any).value.value
                : (DEFAULT_READER_SETTINGS.readerZoom?.value ?? 100);

    const applyZoom = (val: number, isCommitted = true) => {
        const clamped = coerceIn(Math.round(val), 30, 200);
        updateSetting('readerZoom', { enabled: clamped !== 100, value: clamped }, isCommitted);
    };

    return (
        <Stack spacing={1}>
            <Stack sx={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Stack sx={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {t`Zoom`}
                    </Typography>
                    {isDefault && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                            ({t`Using global default`})
                        </Typography>
                    )}
                </Stack>
                {(!isDefault && (currentVal !== 100 || isDefaultable)) && (
                    <Button
                        size="small"
                        variant="text"
                        onClick={() => {
                            if (onDefault) {
                                onDefault();
                            } else {
                                applyZoom(100, true);
                            }
                        }}
                    >
                        {isDefaultable ? t`Reset to default` : t`Reset (100%)`}
                    </Button>
                )}
            </Stack>

            <Stack sx={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                <IconButton
                    size="small"
                    onClick={() => applyZoom(currentVal - 5, true)}
                    disabled={currentVal <= 30}
                    aria-label={t`Decrease zoom`}
                >
                    <RemoveIcon fontSize="small" />
                </IconButton>
                <TextField
                    size="small"
                    type="number"
                    value={currentVal}
                    onChange={(e) => {
                        const num = parseInt(e.target.value, 10);
                        if (!isNaN(num)) {
                            applyZoom(num, true);
                        }
                    }}
                    slotProps={{
                        input: {
                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                            inputProps: { min: 30, max: 200, step: 5, style: { textAlign: 'center' } },
                        },
                    }}
                    sx={{ width: 95 }}
                />
                <IconButton
                    size="small"
                    onClick={() => applyZoom(currentVal + 5, true)}
                    disabled={currentVal >= 200}
                    aria-label={t`Increase zoom`}
                >
                    <AddIcon fontSize="small" />
                </IconButton>
                <Box sx={{ flexGrow: 1, minWidth: 120 }}>
                    <SliderInput
                        label=""
                        value={`${currentVal}%`}
                        slotProps={{
                            slider: {
                                defaultValue: DEFAULT_READER_SETTINGS.readerZoom.value,
                                value: currentVal,
                                step: 5,
                                min: 30,
                                max: 200,
                                onChange: (_, val) => {
                                    if (typeof val === 'number') {
                                        applyZoom(val, false);
                                    }
                                },
                                onChangeCommitted: (_, val) => {
                                    if (typeof val === 'number') {
                                        applyZoom(val, true);
                                    }
                                },
                            },
                        }}
                    />
                </Box>
            </Stack>
        </Stack>
    );
};
