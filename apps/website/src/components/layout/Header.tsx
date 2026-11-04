import { useEffect, useState } from 'react';
import { navItems } from '@/config/navigation';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { Navigate, Page } from '@/types/site';

export function Header({ page, go }: { page: Page; go: Navigate }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navigate = (next: Page) => {
    setOpen(false);
    go(next);
  };

  return (
    <header className={`site-header ${scrolled ? 'header-scrolled' : ''}`}>
      <div className="nav-wrap">
        <button className="logo" onClick={() => navigate('home')} aria-label="Active home">
          <BrandMark compact />
          <span>active</span>
        </button>
        <nav className={`nav-links ${open ? 'nav-open' : ''}`} aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.page}
              className={page === item.page ? 'active' : ''}
              onClick={() => navigate(item.page)}
            >
              {item.label}
            </button>
          ))}
          <button
            className={page === 'partners' ? 'active mobile-only' : 'mobile-only'}
            onClick={() => navigate('partners')}
          >
            Partners
          </button>
          <Button onClick={() => navigate('contact')} className="nav-cta">
            Book a demo <Icon name="arrow" size={17} />
          </Button>
        </nav>
        <button
          className="menu-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </div>
    </header>
  );
}
