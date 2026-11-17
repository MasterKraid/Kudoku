/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { useLocation } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useBackButton } from '@/base/hooks/useBackButton.ts';
import { useGetOptionForDirection } from '@/features/theme/services/ThemeCreator.ts';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { DesktopSideBar } from '@/features/navigation-bar/components/DesktopSideBar.tsx';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { MobileBottomBar } from '@/features/navigation-bar/components/MobileBottomBar.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { NAVIGATION_BAR_ITEMS } from '@/features/navigation-bar/NavigationBar.constants.ts';
import { NavigationBarUtil } from '@/features/navigation-bar/NavigationBar.util.ts';
import { useTopBarConfig } from '@/features/navigation-bar/hooks/useTopBarConfig.ts';

// gap around the app bar (viewport top/right and content below). 0 = flush with the edges; ~10 = floating
const APP_BAR_GAP = 0;

export function DefaultNavBar() {
    const {
        title,
        hideTitle,
        action,
        override,
        setAppBarHeight,
        navBarWidth,
        setNavBarWidth,
        isTopBarHidden,
        setIsTopBarHidden,
        setIsTopBarVisible,
    } = useNavBarContext();

    const { config: topBarConfig, isMobile } = useTopBarConfig();
    const [isHovered, setIsHovered] = useState(false);
    const lastScrollY = useRef(0);

    const theme = useTheme();
    const getOptionForDirection = useGetOptionForDirection();
    const { pathname } = useLocation();
    const handleBack = useBackButton();
    const isMobileWidth = MediaQuery.useIsMobileWidth();

    // Auto-hide scroll listener
    useEffect(() => {
        if (!topBarConfig.autoHide) {
            setIsTopBarHidden(false);
            return;
        }

        const handleScroll = () => {
            const currentY = window.scrollY;
            if (currentY <= 15) {
                setIsTopBarHidden(false);
            } else if (currentY > lastScrollY.current + 8) {
                setIsTopBarHidden(true);
            } else if (currentY < lastScrollY.current - 8) {
                setIsTopBarHidden(false);
            }
            lastScrollY.current = currentY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [topBarConfig.autoHide, setIsTopBarHidden]);

    const {
        settings: { hideHistory },
    } = useMetadataServerSettings();

    const appBarRef = useRef<HTMLDivElement | null>(null);

    const isMainRoute = NAVIGATION_BAR_ITEMS.some(({ path, show }) => {
        if (isMobileWidth && show === 'desktop') {
            return false;
        }

        if (!isMobileWidth && show === 'mobile') {
            return false;
        }

        return path === pathname;
    });
    // the collapsed sidebar stays visible as an icon rail, so the app bar always sits next to it
    const actualNavBarWidth = isMobileWidth ? 0 : navBarWidth;

    const visibleNavBarItems = useMemo(
        () =>
            NavigationBarUtil.filterItems(NAVIGATION_BAR_ITEMS, {
                hideHistory,
                hideBoth: false,
                hideDesktop: isMobileWidth,
                hideMobile: !isMobileWidth,
            }),
        [isMobileWidth, hideHistory],
    );
    const NavBarComponent = useMemo(() => (isMobileWidth ? MobileBottomBar : DesktopSideBar), [isMobileWidth]);

    const navBar = useMemo(
        () => <NavBarComponent navBarItems={visibleNavBarItems} />,
        [NavBarComponent, visibleNavBarItems],
    );

    const measureAppBar = useCallback(() => {
        if (!appBarRef.current) {
            setAppBarHeight(0);
            return;
        }
        const height = appBarRef.current.offsetHeight || topBarConfig.libraryBarHeight;
        setAppBarHeight(Math.ceil(height) + APP_BAR_GAP);
    }, [topBarConfig.libraryBarHeight, setAppBarHeight]);

    useResizeObserver(appBarRef, measureAppBar);

    // Rotating a phone changes the safe area without always changing the bar's own size (iOS also reports
    // stale values mid-rotation), which left the sticky tabs offset by the landscape height. Measure again once it settles.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const remeasure = () => {
            measureAppBar();
            clearTimeout(timer);
            timer = setTimeout(measureAppBar, 300);
        };
        window.addEventListener('resize', remeasure);
        window.addEventListener('orientationchange', remeasure);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', remeasure);
            window.removeEventListener('orientationchange', remeasure);
        };
    }, [measureAppBar]);

    useLayoutEffect(() => {
        if (override.status) {
            setAppBarHeight(0);
            setNavBarWidth(0);
        }

        return () => {
            setAppBarHeight(0);
            setNavBarWidth(0);
        };
    }, [override.status]);

    useLayoutEffect(() => {
        if (!isMobileWidth) {
            // do not reset navbar width to prevent grid from jumping due to the changing grid item width
            return;
        }

        setNavBarWidth(0);
    }, [isMobileWidth]);

    const isVisible = !override.status && (!isTopBarHidden || (!isMobile && topBarConfig.showOnHover && isHovered));

    useEffect(() => {
        setIsTopBarVisible(isVisible);
    }, [isVisible, setIsTopBarVisible]);

    // Allow default navbar to be overrided
    if (override.status) {
        return override.value;
    }

    return (
        <>
            {!isMobile && topBarConfig.showOnHover && isTopBarHidden && (
                <Box
                    onMouseEnter={() => setIsHovered(true)}
                    sx={{
                        position: 'fixed',
                        top: 0,
                        right: 0,
                        width: `calc(100% - ${actualNavBarWidth}px)`,
                        height: 14,
                        zIndex: theme.zIndex.drawer + 2,
                        cursor: 'pointer',
                    }}
                />
            )}
            <AppBar
                ref={appBarRef}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={
                    {
                        '--app-bar-height': `${topBarConfig.libraryBarHeight}px`,
                    } as React.CSSProperties
                }
                sx={{
                    position: 'fixed',
                    top: APP_BAR_GAP,
                    right: APP_BAR_GAP,
                    pt: 'env(safe-area-inset-top)',
                    width: `calc(100% - ${actualNavBarWidth}px - ${2 * APP_BAR_GAP}px)`,
                    zIndex: theme.zIndex.drawer,
                    transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
                    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    '& .MuiToolbar-root': {
                        minHeight: `${topBarConfig.libraryBarHeight}px !important`,
                        height: `${topBarConfig.libraryBarHeight}px !important`,
                    },
                }}
            >
                <Toolbar
                    sx={{
                        position: 'relative',
                        minHeight: `${topBarConfig.libraryBarHeight}px !important`,
                        height: `${topBarConfig.libraryBarHeight}px !important`,
                        px: { xs: 1.5, sm: 2 },
                    }}
                >
                    <Stack
                        sx={{
                            width: 'calc(100% - env(safe-area-inset-left))',
                            flexDirection: 'row',
                            alignItems: 'center',
                        }}
                    >
                        {!isMainRoute && (
                            <IconButton
                                edge="start"
                                component="button"
                                size={topBarConfig.libraryBarHeight <= 44 ? 'small' : 'medium'}
                                sx={{ marginRight: 2 }}
                                aria-label="menu"
                                onClick={handleBack}
                                color="inherit"
                            >
                                {getOptionForDirection(<ArrowBack />, <ArrowForwardIcon />)}
                            </IconButton>
                        )}
                        {!hideTitle && (
                            <Typography
                                variant={topBarConfig.libraryBarHeight <= 44 ? 'subtitle1' : 'h5'}
                                component="h1"
                                noWrap
                                sx={{
                                    textOverflow: 'ellipsis',
                                    flexGrow: 1,
                                    fontSize: topBarConfig.libraryBarHeight <= 40 ? '1.05rem' : undefined,
                                }}
                            >
                                {title}
                            </Typography>
                        )}
                        {action}
                    </Stack>
                </Toolbar>
            </AppBar>
            {!isMobileWidth || isMainRoute ? navBar : null}
        </>
    );
}
