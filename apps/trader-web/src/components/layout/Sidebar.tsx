'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCallback } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Bitcoin,
  DollarSign,
  BarChart3,
  Zap,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/home', icon: LayoutDashboard },
  { label: 'Stocks & Trade', href: '/stocks', icon: TrendingUp },
  { label: 'AI Advisory', href: '/advisory', icon: MessageSquare },
  { label: 'Strategies', href: '/strategies', icon: Zap },
  { label: 'Performance', href: '/performance', icon: BarChart3 },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const isActive = useCallback(
    (href: string) => {
      if (href === '/home') return pathname === '/home';
      return pathname.startsWith(href);
    },
    [pathname],
  );

  return (
    <aside
      className={cn(
        'relative flex h-screen flex-col border-r border-apex-border bg-apex-surface transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-60',
      )}
      aria-label="Main navigation"
    >
      {/* Quantro Logo (Q Icon in quantro_logo.jpeg + Brand Text) */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-apex-border px-4',
          collapsed ? 'justify-center' : 'gap-3',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/quantro_logo.jpeg"
          alt="Quantro Logo"
          className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-apex-border"
        />
        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span className="text-[13px] font-bold text-apex-text tracking-tight">
              QuantroApex
            </span>
            <span className="text-[9px] text-apex-muted font-semibold tracking-wider uppercase mt-0.5">
              By Quantro Labs
            </span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 pt-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          if (item.comingSoon) {
            return (
              <div
                key={item.href}
                title={collapsed ? `${item.label} — coming soon` : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-40 cursor-not-allowed select-none',
                  collapsed ? 'justify-center' : '',
                )}
              >
                <Icon
                  size={18}
                  className="shrink-0 text-apex-muted"
                  strokeWidth={1.75}
                />
                {!collapsed && (
                  <span className="flex-1 text-sm font-medium text-apex-muted">
                    {item.label}
                  </span>
                )}
                {!collapsed && (
                  <span className="flex items-center gap-0.5 rounded text-[9px] font-semibold uppercase tracking-wider text-apex-muted border border-apex-border px-1 py-0.5">
                    <Clock size={8} />
                    Soon
                  </span>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150',
                collapsed ? 'justify-center' : '',
                active
                  ? 'bg-apex-accent/10 text-apex-accent'
                  : 'text-apex-muted hover:bg-apex-hover hover:text-apex-text',
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-apex-accent" />
              )}
              <Icon
                size={18}
                className={cn(
                  'shrink-0 transition-colors duration-150',
                  active ? 'text-apex-accent' : 'text-apex-muted group-hover:text-apex-text',
                )}
                strokeWidth={active ? 2 : 1.75}
              />
              {!collapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom items */}
      <div className="border-t border-apex-border p-2">
        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150',
                collapsed ? 'justify-center' : '',
                active
                  ? 'bg-apex-accent/10 text-apex-accent'
                  : 'text-apex-muted hover:bg-apex-hover hover:text-apex-text',
              )}
            >
              <Icon size={18} className="shrink-0" strokeWidth={active ? 2 : 1.75} />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-apex-border bg-apex-surface text-apex-muted shadow-sm transition-all duration-150 hover:border-apex-accent hover:text-apex-accent',
        )}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
