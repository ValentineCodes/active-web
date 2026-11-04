import type { Page } from '@/types/site';

export const PAGES: Page[] = [
  'home',
  'explore',
  'how',
  'about',
  'partners',
  'safety',
  'faq',
  'contact',
];

export function pageFromHash(): Page {
  const value = window.location.hash.replace('#/', '') as Page;
  return PAGES.includes(value) ? value : 'home';
}

export function navigateTo(page: Page) {
  window.location.hash = `/${page}`;
}
