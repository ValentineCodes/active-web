import { CTA } from '@/components/layout/CTA';
import { PageHero } from '@/components/layout/PageHero';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/ui/Icon';
import type { Navigate } from '@/types/site';

export function PartnersPage({ go }: { go: Navigate }) {
  return (
    <>
      <PageHero
        dark
        eyebrow="Investors & partners"
        title={
          <>
            Help build the rails for
            <br />
            <em>everyday opportunity.</em>
          </>
        }
        text="We want to work with people and organisations who believe local capability can power broader economic participation."
      >
        <Button variant="light" onClick={() => go('contact')}>
          Start a conversation <Icon name="arrow" size={17} />
        </Button>
      </PageHero>
      <section className="section split-intro">
        <div>
          <Eyebrow>Why this matters</Eyebrow>
          <h2>
            Needs are everywhere.
            <br />
            So is capability.
          </h2>
        </div>
        <div className="section-copy">
          <p>
            Active is exploring a marketplace model that helps turn fragmented everyday needs into
            accessible, flexible opportunities — shaped for the Nigerian context.
          </p>
        </div>
      </section>
      <section className="partner-grid section">
        {[
          [
            'Communities',
            'Support pathways to local earning and stronger neighbourhood connections.',
          ],
          ['Organisations', 'Explore new ways to connect people, services, and opportunities.'],
          ['Investors', 'Join the conversation around the future of trusted local work.'],
        ].map((x, i) => (
          <article key={x[0]}>
            <span>0{i + 1}</span>
            <Icon name={i === 0 ? 'users' : i === 1 ? 'spark' : 'arrow'} size={28} />
            <h3>{x[0]}</h3>
            <p>{x[1]}</p>
          </article>
        ))}
      </section>
      <section className="honesty section">
        <Icon name="shield" size={36} />
        <div>
          <h2>Early, thoughtful, transparent.</h2>
          <p>
            This website is a prototype. We do not present invented traction, live marketplace data,
            or partnerships. We’d rather start an honest conversation about the problem and the
            opportunity.
          </p>
        </div>
      </section>
      <CTA go={go} title="Interested in where Active could go?" />
    </>
  );
}
