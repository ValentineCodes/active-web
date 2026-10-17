'use client';

import Link from 'next/link';
import { ChevronRight, LogOut, Menu } from 'lucide-react';

import { ADMIN_ROLE_LABELS, type AdminSessionView } from '@/lib/admin/types';
import { Button } from '@/components/ui/button';

type Props = {
  session: AdminSessionView;
  title: string;
  breadcrumbs: { label: string; href?: string }[];
  onOpenNav: () => void;
};

export function AdminTopbar({ session, title, breadcrumbs, onOpenNav }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-elevated/95 backdrop-blur">
      <div className="flex h-16 items-center gap-4 px-4 lg:px-6">
        <button
          type="button"
          className="rounded-lg border border-border p-2 text-ink hover:bg-surface lg:hidden"
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <nav className="mb-0.5 flex flex-wrap items-center gap-1 text-xs text-muted" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-subtle">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
          <h1 className="truncate text-lg font-semibold text-ink">{title}</h1>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <div className="text-right">
            <p className="max-w-[200px] truncate text-sm font-medium text-ink">
              {session.email ?? session.userId}
            </p>
            <p className="text-xs text-muted">{ADMIN_ROLE_LABELS[session.permissions.role]}</p>
          </div>
        </div>
        <form action="/api/auth/sign-out" method="post">
          <Button type="submit" variant="secondary" className="gap-2 px-3 py-2">
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
