import { useMemo } from 'react';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { DEFAULT_TOP_BAR_SETTINGS } from '@/features/theme/AppTheme.types.ts';
import type { TopBarPlatformConfig, TopBarSettings } from '@/features/theme/AppTheme.types.ts';

export function useTopBarConfig(): {
    config: TopBarPlatformConfig;
    isMobile: boolean;
    allSettings: TopBarSettings;
} {
    const { settings } = useMetadataServerSettings();
    const isMobileWidth = MediaQuery.useIsMobileWidth();
    const isTouch = MediaQuery.useIsTouchDevice();
    const isMobile = isMobileWidth || isTouch;

    const allSettings: TopBarSettings = useMemo(() => {
        const raw = settings?.topBarSettings;
        return {
            desktop: {
                ...DEFAULT_TOP_BAR_SETTINGS.desktop,
                ...(raw?.desktop ?? {}),
            },
            mobile: {
                ...DEFAULT_TOP_BAR_SETTINGS.mobile,
                ...(raw?.mobile ?? {}),
            },
        };
    }, [settings?.topBarSettings]);

    const config = useMemo(() => {
        return isMobile ? allSettings.mobile : allSettings.desktop;
    }, [allSettings, isMobile]);

    return { config, isMobile, allSettings };
}
