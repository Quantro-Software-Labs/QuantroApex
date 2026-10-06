'use client';

import { Bell, User, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface HeaderProps {
  mode: 'LIVE' | 'SIMULATION';
  apexActive: boolean;
  onModeToggle: () => void;
}

export function Header({ mode, apexActive, onModeToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { data: profile } = useMe();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isSimulation = mode === 'SIMULATION';
  const displayName =
    profile?.firstName ?? user?.displayName?.split(' ')[0] ?? 'Trader';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-apex-border bg-apex-surface px-6">
      {/* Left — Apex status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'relative flex h-2 w-2',
              apexActive ? 'text-apex-success' : 'text-apex-muted',
            )}
          >
            {apexActive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-apex-success opacity-60" />
            )}
            <span
              className={cn(
                'relative inline-flex h-2 w-2 rounded-full',
                apexActive ? 'bg-apex-success' : 'bg-apex-muted',
              )}
            />
          </span>
          <span className="text-sm font-medium text-apex-muted">
            Apex{' '}
            <span
              className={cn(
                'font-semibold',
                apexActive ? 'text-apex-success' : 'text-apex-text',
              )}
            >
              {apexActive ? 'Active' : 'Inactive'}
            </span>
          </span>
        </div>
      </div>

      {/* Right — mode toggle, notifications, avatar */}
      <div className="flex items-center gap-3">
        {/* Live / Simulation toggle */}
        <button
          id="mode-toggle"
          onClick={onModeToggle}
          aria-label="Toggle Live/Simulation mode"
          className={cn(
            'relative flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all duration-200 cursor-pointer',
            isSimulation
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
              : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/20',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              isSimulation ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse',
            )}
          />
          {isSimulation ? 'Simulation' : 'Live'}
        </button>

        {/* Notifications */}
        <button
          id="notifications-btn"
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-apex-muted transition-colors hover:bg-apex-hover hover:text-apex-text"
        >
          <Bell size={18} strokeWidth={1.75} />
          {/* Unread dot — show when there are notifications */}
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-apex-accent" />
        </button>

        {/* User avatar menu */}
        <div className="relative">
          <button
            id="user-menu-btn"
            onClick={() => setShowUserMenu((v) => !v)}
            aria-label="User menu"
            aria-expanded={showUserMenu}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-apex-hover"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-apex-accent/20 text-apex-accent">
              <User size={14} strokeWidth={2} />
            </div>
            <span className="font-medium text-apex-text">{displayName}</span>
            <ChevronDown
              size={14}
              className={cn(
                'text-apex-muted transition-transform duration-200',
                showUserMenu && 'rotate-180',
              )}
            />
          </button>

          {showUserMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              {/* Dropdown */}
              <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-apex-border bg-apex-surface shadow-xl shadow-black/30">
                <div className="border-b border-apex-border px-4 py-2.5">
                  <p className="text-xs text-apex-muted">Signed in as</p>
                  <p className="truncate text-sm font-medium text-apex-text">
                    {user?.email}
                  </p>
                </div>
                <div className="p-1">
                  <a
                    href="/settings"
                    className="block rounded-lg px-3 py-2 text-sm text-apex-text hover:bg-apex-hover"
                    onClick={() => setShowUserMenu(false)}
                  >
                    Settings
                  </a>
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-apex-danger hover:bg-apex-danger/10"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
