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
import MenuItem from '@mui/material/MenuItem';
import { CARD_LIST_SX } from '@/base/components/lists/cardListSx.ts';
import { ListSubheader } from '@/base/components/lists/ListSubheader.tsx';
import Switch from '@mui/material/Switch';
import Link from '@mui/material/Link';
import { useColorScheme } from '@mui/material/styles';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAppThemeContext } from '@/features/theme/AppThemeContext.tsx';
import { Select } from '@/base/components/inputs/Select.tsx';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { NumberSetting } from '@/base/components/settings/NumberSetting.tsx';
import { i18nResources, loadCatalog } from '@/i18n';
import { languageCodeToName } from '@/base/utils/Languages.ts';
import { ThemeList } from '@/features/theme/components/ThemeList.tsx';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import type { MetadataThemeSettings, TopBarPlatformConfig } from '@/features/theme/AppTheme.types.ts';
import { DEFAULT_TOP_BAR_SETTINGS, ThemeMode } from '@/features/theme/AppTheme.types.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { AppStorage } from '@/lib/storage/AppStorage.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { MANGA_GRID_WIDTH, SERVER_SETTINGS_METADATA_DEFAULT } from '@/features/settings/Settings.constants.ts';
import { MUI_THEME_MODE_KEY } from '@/lib/mui/MUI.constants.ts';
import { getISOLanguage } from '@/lib/ISOLanguageUtil.ts';
import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { TabsMenu } from '@/base/components/tabs/TabsMenu.tsx';
import { useState } from 'react';

export const Appearance = () => {
    const { t } = useLingui();
    const { themeMode, setThemeMode, shouldUsePureBlackMode, setShouldUsePureBlackMode } = useAppThemeContext();
    const { mode, setMode } = useColorScheme();
    const actualThemeMode = (mode ?? themeMode) as ThemeMode;

    useAppTitle(t`Appearance`);

    const {
        settings: { mangaThumbnailBackdrop, mangaDynamicColorSchemes, mangaGridItemWidth, locale, topBarSettings: rawTopBarSettings },
        request: { loading, error, refetch },
    } = useMetadataServerSettings();
    const updateMetadataSetting = createUpdateMetadataServerSettings<keyof MetadataThemeSettings>((e) =>
        makeToast(t`Failed to save changes`, 'error', getErrorMessage(e)),
    );

    const isMobileWidth = MediaQuery.useIsMobileWidth();
    const isTouch = MediaQuery.useIsTouchDevice();
    const isCurrentDeviceMobile = isMobileWidth || isTouch;
    const [selectedPlatform, setSelectedPlatform] = useState<'desktop' | 'mobile'>(
        isCurrentDeviceMobile ? 'mobile' : 'desktop',
    );

    const topBarSettings = rawTopBarSettings ?? DEFAULT_TOP_BAR_SETTINGS;
    const currentPlatformConfig = topBarSettings[selectedPlatform] ?? DEFAULT_TOP_BAR_SETTINGS[selectedPlatform];

    const updatePlatformConfig = <K extends keyof TopBarPlatformConfig>(key: K, value: TopBarPlatformConfig[K]) => {
        const updated = {
            ...topBarSettings,
            [selectedPlatform]: {
                ...currentPlatformConfig,
                [key]: value,
            },
        };
        updateMetadataSetting('topBarSettings', updated).catch((e) =>
            makeToast(t`Failed to save changes`, 'error', getErrorMessage(e)),
        );
    };

    const applyPreset = (libHeight: number, catHeight: number) => {
        const updated = {
            ...topBarSettings,
            [selectedPlatform]: {
                ...currentPlatformConfig,
                libraryBarHeight: libHeight,
                categoryBarHeight: catHeight,
            },
        };
        updateMetadataSetting('topBarSettings', updated).catch((e) =>
            makeToast(t`Failed to save changes`, 'error', getErrorMessage(e)),
        );
    };

    const isDarkMode = MediaQuery.getThemeMode(actualThemeMode) === ThemeMode.DARK;

    if (loading) {
        return <LoadingPlaceholder />;
    }

    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t`Unable to load data`}
                messageExtra={getErrorMessage(error)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('Appearance::refetch'))}
            />
        );
    }

    return (
        <List sx={CARD_LIST_SX}>
            <List
                subheader={
                    <ListSubheader component="div" id="appearance-theme" customOffsetProps={{ sx: { zIndex: 2 } }}>
                        {t`Theme`}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText primary={t`Theme mode`} />
                    <Select<ThemeMode>
                        size="small"
                        value={actualThemeMode}
                        onChange={(e) => {
                            const newMode = e.target.value as 'system' | 'light' | 'dark';

                            setThemeMode(newMode as ThemeMode);
                            setMode(newMode);
                            // in case a non "colorSchemes" mui theme is active, "setMode" does not update the mode ("mui-mode") value
                            AppStorage.local.setItem(MUI_THEME_MODE_KEY, newMode, true);
                        }}
                    >
                        <MenuItem key={ThemeMode.SYSTEM} value={ThemeMode.SYSTEM}>
                            {t`System`}
                        </MenuItem>
                        <MenuItem key={ThemeMode.DARK} value={ThemeMode.DARK}>
                            {t`Dark`}
                        </MenuItem>
                        <MenuItem key={ThemeMode.LIGHT} value={ThemeMode.LIGHT}>
                            {t`Light`}
                        </MenuItem>
                    </Select>
                </ListItem>
                <ThemeList />
                {isDarkMode && (
                    <ListItem>
                        <ListItemText primary={t`Pure black dark mode`} />
                        <Switch
                            checked={shouldUsePureBlackMode}
                            onChange={(_, enabled) => setShouldUsePureBlackMode(enabled)}
                        />
                    </ListItem>
                )}
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="appearance-theme">
                        {t`Display`}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        primary={t`Language`}
                        secondary={
                            <Trans>
                                Feel free to translate the project on Weblate (
                                <Link
                                    href="https://hosted.weblate.org/projects/suwayomi/suwayomi-webui"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    WebUI
                                </Link>{' '}
                                and{' '}
                                <Link
                                    href="https://hosted.weblate.org/projects/suwayomi/suwayomi-server"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Server
                                </Link>
                                )
                            </Trans>
                        }
                    />
                    <Select
                        size="small"
                        value={locale}
                        onChange={({ target: { value: newLocale } }) => {
                            updateMetadataSetting('locale', newLocale).catch((e) =>
                                makeToast(t`Could not save changes`, 'error', getErrorMessage(e)),
                            );
                            loadCatalog(newLocale).catch((e: Error) => {
                                makeToast(t`Could not load language`, 'error', getErrorMessage(e));
                            });
                        }}
                        renderValue={(selected) => {
                            const selectedLanguage =
                                i18nResources.find((language) => language === selected) ?? selected;

                            return languageCodeToName(selectedLanguage);
                        }}
                    >
                        {i18nResources.map((language) => (
                            <MenuItem
                                key={language}
                                value={language}
                                sx={{ flexDirection: 'column', alignItems: 'flex-start' }}
                            >
                                {languageCodeToName(language)}
                                <Typography color="textSecondary" variant="body2">
                                    {getISOLanguage(language)?.name}
                                </Typography>
                            </MenuItem>
                        ))}
                    </Select>
                </ListItem>
                <NumberSetting
                    settingTitle={t`Manga item width`}
                    settingValue={`px: ${mangaGridItemWidth}`}
                    value={mangaGridItemWidth}
                    defaultValue={SERVER_SETTINGS_METADATA_DEFAULT.mangaGridItemWidth}
                    minValue={MANGA_GRID_WIDTH.min}
                    maxValue={MANGA_GRID_WIDTH.max}
                    stepSize={MANGA_GRID_WIDTH.step}
                    valueUnit="px"
                    showSlider
                    handleUpdate={(width) => updateMetadataSetting('mangaGridItemWidth', width)}
                />

                <ListItem>
                    <ListItemText
                        primary={t`Manga thumbnail as background`}
                        secondary={t`Sets the manga thumbnail as the background image on the manga page`}
                    />
                    <Switch
                        edge="end"
                        checked={mangaThumbnailBackdrop}
                        onChange={(e) => updateMetadataSetting('mangaThumbnailBackdrop', e.target.checked)}
                    />
                </ListItem>

                <ListItem>
                    <ListItemText
                        primary={t`Dynamic theme colors on manga page`}
                        secondary={t`Changes the theme colors on the manga page based on the thumbnail`}
                    />
                    <Switch
                        edge="end"
                        checked={mangaDynamicColorSchemes}
                        onChange={(e) => updateMetadataSetting('mangaDynamicColorSchemes', e.target.checked)}
                    />
                </ListItem>
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="appearance-top-bar">
                        {t`Top Bar`}
                    </ListSubheader>
                }
            >
                <ListItem sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
                    <ListItemText
                        primary={t`Target platform`}
                        secondary={t`Configure top bar dimensions and auto-hide behavior independently for Desktop and Mobile devices`}
                    />
                    <TabsMenu
                        value={selectedPlatform}
                        onChange={(_, val) => setSelectedPlatform(val)}
                        sx={{ bgcolor: 'action.hover', borderRadius: 1 }}
                    >
                        <Tab
                            value="desktop"
                            label={
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <span>{t`Desktop`}</span>
                                    {!isCurrentDeviceMobile && (
                                        <Chip size="small" label={t`Active`} color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />
                                    )}
                                </Stack>
                            }
                            sx={{ flexGrow: 1 }}
                        />
                        <Tab
                            value="mobile"
                            label={
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <span>{t`Mobile`}</span>
                                    {isCurrentDeviceMobile && (
                                        <Chip size="small" label={t`Active`} color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />
                                    )}
                                </Stack>
                            }
                            sx={{ flexGrow: 1 }}
                        />
                    </TabsMenu>
                </ListItem>

                <ListItem sx={{ gap: 1, flexWrap: 'wrap' }}>
                    <ListItemText primary={t`Height presets`} />
                    <Stack direction="row" spacing={1}>
                        <Chip
                            clickable
                            label={t`Default`}
                            variant={currentPlatformConfig.libraryBarHeight === (selectedPlatform === 'desktop' ? 56 : 48) ? 'filled' : 'outlined'}
                            onClick={() => applyPreset(selectedPlatform === 'desktop' ? 56 : 48, selectedPlatform === 'desktop' ? 48 : 40)}
                        />
                        <Chip
                            clickable
                            label={t`Compact`}
                            variant={currentPlatformConfig.libraryBarHeight === 44 ? 'filled' : 'outlined'}
                            onClick={() => applyPreset(44, 36)}
                        />
                        <Chip
                            clickable
                            label={t`Ultra-compact`}
                            variant={currentPlatformConfig.libraryBarHeight === 38 ? 'filled' : 'outlined'}
                            onClick={() => applyPreset(38, 30)}
                        />
                    </Stack>
                </ListItem>

                <NumberSetting
                    settingTitle={t`Library bar height`}
                    settingValue={`px: ${currentPlatformConfig.libraryBarHeight}`}
                    value={currentPlatformConfig.libraryBarHeight}
                    defaultValue={selectedPlatform === 'desktop' ? 56 : 48}
                    minValue={32}
                    maxValue={72}
                    stepSize={2}
                    valueUnit="px"
                    showSlider
                    handleUpdate={(val) => updatePlatformConfig('libraryBarHeight', val)}
                />

                <NumberSetting
                    settingTitle={t`Category bar height`}
                    settingValue={`px: ${currentPlatformConfig.categoryBarHeight}`}
                    value={currentPlatformConfig.categoryBarHeight}
                    defaultValue={selectedPlatform === 'desktop' ? 48 : 40}
                    minValue={24}
                    maxValue={56}
                    stepSize={2}
                    valueUnit="px"
                    showSlider
                    handleUpdate={(val) => updatePlatformConfig('categoryBarHeight', val)}
                />

                <ListItem>
                    <ListItemText
                        primary={t`Auto hide on scroll`}
                        secondary={t`Automatically slides the top bars out of view when scrolling down and restores them on scroll up`}
                    />
                    <Switch
                        edge="end"
                        checked={currentPlatformConfig.autoHide}
                        onChange={(e) => updatePlatformConfig('autoHide', e.target.checked)}
                    />
                </ListItem>

                {selectedPlatform === 'desktop' && (
                    <ListItem>
                        <ListItemText
                            primary={t`Show on hover`}
                            secondary={t`When the top bar is hidden, moving your cursor to the top edge smoothly reveals it`}
                        />
                        <Switch
                            edge="end"
                            checked={currentPlatformConfig.showOnHover}
                            onChange={(e) => updatePlatformConfig('showOnHover', e.target.checked)}
                        />
                    </ListItem>
                )}
            </List>
        </List>
    );
};
