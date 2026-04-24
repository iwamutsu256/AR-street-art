"use client";

import type { ReactNode } from "react";

type AppHeaderProps = {
  leading?: ReactNode;
  title?: ReactNode;
  trailing?: ReactNode;
};

export function AppHeader({ leading, title, trailing }: AppHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="site-header__section site-header__section--leading">
          {leading}
        </div>
        <div className="site-header__section site-header__section--center">
          {title}
        </div>
        <div className="site-header__section site-header__section--trailing">
          {trailing}
        </div>
      </div>
    </header>
  );
}
