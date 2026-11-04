import type { Navigate } from '@/types/site';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/ui/Icon';

export function CTA({ go, title = 'Seeing is believing' }: { go: Navigate; title?: string }) {
  return (
    <section className="cta">
      <div className="cta-mark">
        <BrandMark />
      </div>
      <div>
        <Eyebrow light>Get help or get paid</Eyebrow>
        <h2>{title}</h2>
      </div>
      <div>
        <Button variant="light" onClick={() => go('contact')}>
          Book a demo <Icon name="arrow" size={17} />
        </Button>
        <Button variant="text" onClick={() => go('explore')}>
          Explore requests
        </Button>
      </div>
    </section>
  );
}
