export type AppChromeSettings = {
  showBottomNavigation: boolean;
  showGlobalHeader: boolean;
  showNearbyWallBanner: boolean;
};

type AppChromeRule = {
  matches: (pathname: string) => boolean;
  settings: Partial<AppChromeSettings>;
};

const defaultAppChromeSettings: AppChromeSettings = {
  showBottomNavigation: true,
  showGlobalHeader: true,
  showNearbyWallBanner: true,
};

function matchPathPrefix(prefix: string) {
  return (pathname: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const appChromeRules: AppChromeRule[] = [
  {
    matches: matchPathPrefix("/walls/new"),
    settings: {
      showBottomNavigation: false,
      showGlobalHeader: false,
    },
  },
  {
    matches: matchPathPrefix("/canvases"),
    settings: {
      showBottomNavigation: false,
      showGlobalHeader: false,
      showNearbyWallBanner: false,
    },
  },
];

export function getAppChromeSettings(pathname: string): AppChromeSettings {
  return appChromeRules.reduce(
    (settings, rule) =>
      rule.matches(pathname) ? { ...settings, ...rule.settings } : settings,
    defaultAppChromeSettings,
  );
}
