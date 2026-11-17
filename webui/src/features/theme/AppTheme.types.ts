/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { Palette } from '@vibrant/color';
import type { FastAverageColorResult } from 'fast-average-color';
import type { AppTheme, AppThemes } from '@/features/theme/services/AppThemes.ts';

export enum ThemeMode {
    SYSTEM = 'system',
    DARK = 'dark',
    LIGHT = 'light',
}

export type TAppThemeContext = {
    appTheme: AppThemes;
    setAppTheme: (theme: AppThemes) => void;
    themeMode: ThemeMode;
    setThemeMode: (mode: ThemeMode) => void;
    shouldUsePureBlackMode: boolean;
    setShouldUsePureBlackMode: (value: boolean) => void;
    dynamicColor: (NonNullableProperties<Palette> & { average: FastAverageColorResult }) | null;
    setDynamicColor: React.Dispatch<
        React.SetStateAction<(NonNullableProperties<Palette> & { average: FastAverageColorResult }) | null>
    >;
};
export interface TopBarPlatformConfig {
    libraryBarHeight: number;
    categoryBarHeight: number;
    autoHide: boolean;
    showOnHover: boolean;
}

export interface TopBarSettings {
    desktop: TopBarPlatformConfig;
    mobile: TopBarPlatformConfig;
}

export const DEFAULT_TOP_BAR_SETTINGS: TopBarSettings = {
    desktop: {
        libraryBarHeight: 56,
        categoryBarHeight: 48,
        autoHide: false,
        showOnHover: false,
    },
    mobile: {
        libraryBarHeight: 48,
        categoryBarHeight: 40,
        autoHide: false,
        showOnHover: false,
    },
};

export type MetadataThemeSettings = {
    locale: string;
    appTheme: AppThemes;
    themeMode: ThemeMode;
    shouldUsePureBlackMode: boolean;
    customThemes: Record<string, AppTheme>;
    mangaThumbnailBackdrop: boolean;
    mangaDynamicColorSchemes: boolean;
    mangaGridItemWidth: number;
    topBarSettings: TopBarSettings;
};
