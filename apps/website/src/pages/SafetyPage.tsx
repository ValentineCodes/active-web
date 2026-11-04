import { PageHero } from '@/components/layout/PageHero';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/ui/Icon';
import type { Navigate } from '@/types/site';

export function SafetyPage({ go }: { go: Navigate }) {
  return (
    <>
      <PageHero
        eyebrow="Safety & trust"
        title={
          <>
            Trust isn’t a feature.
            <br />
            <em>It’s the foundation.</em>
          </>
        }
        text="Active is being designed to help people make informed choices and interact with greater confidence."
      />
      <section className="section safety-grid">
        {[
          [
            'shield',
            'Clear identities',
            'Profiles and verification signals can help people understand who they’re interacting with.',
          ],
          [
            'users',
            'Informed choices',
            'Useful context, clear expectations, and transparent request details support better decisions.',
          ],
          [
            'lock',
            'Safer communication',
            'Keeping conversations organised creates a clearer record and reduces uncertainty.',
          ],
          [
            'heart',
            'Community standards',
            'Respectful behaviour and clear reporting pathways help protect the whole community.',
          ],
        ].map((x) => (
          <article key={x[1]}>
            <div>
              <Icon name={x[0]} size={26} />
            </div>
            <h3>{x[1]}</h3>
            <p>{x[2]}</p>
          </article>
        ))}
      </section>
      <section className="safety-callout">
        <div>
          <Eyebrow light>Shared responsibility</Eyebrow>
          <h2>Good judgement still matters.</h2>
          <p>
            Meet in appropriate places, protect personal information, agree on details in advance,
            and trust your instincts. No marketplace can remove every risk.
          </p>
          <Button variant="light" onClick={() => go('faq')}>
            Read common questions <Icon name="arrow" size={17} />
          </Button>
        </div>
        <div className="safety-symbol">
          <Icon name="shield" size={120} />
        </div>
      </section>
      <section className="section principle">
        <span>Our principle</span>
        <h2>Build trust visibly. Communicate clearly. Improve continuously.</h2>
      </section>
    </>
  );
}
