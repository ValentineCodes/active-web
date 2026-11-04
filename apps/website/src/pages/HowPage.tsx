import { useState } from 'react';
import { CTA } from '@/components/layout/CTA';
import { PageHero } from '@/components/layout/PageHero';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/ui/Icon';
import type { Navigate } from '@/types/site';

const journeys = {
  help: {
    label: 'Getting help',
    steps: [
      [
        'Share what you need',
        'Describe the task, set your location and suggest a fair budget.',
        'plus',
      ],
      [
        'Choose who feels right',
        'Review responses and pick someone whose experience fits your request.',
        'users',
      ],
      [
        'Get it done',
        'Coordinate the details, complete the task and confirm everything went well.',
        'check',
      ],
    ],
  },
  paid: {
    label: 'Getting paid',
    steps: [
      [
        'Find a request that fits',
        'Browse nearby tasks and choose work that matches your time and skills.',
        'search',
      ],
      [
        'Offer to help',
        'Respond with your experience and availability so the requester can decide.',
        'users',
      ],
      [
        'Get paid',
        'Complete the task, confirm with the requester, and receive your payment.',
        'naira',
      ],
    ],
  },
} as const;

type JourneyKey = keyof typeof journeys;

export function HowPage({ go }: { go: Navigate }) {
  const [journey, setJourney] = useState<JourneyKey>('help');
  const active = journeys[journey];
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title={
          <>
            Simple <em>by design</em>
          </>
        }
        text="Whether you need an extra pair of hands or want to put your skills to work, Active keeps the journey clear."
      />
      <section className="section journey">
        <div className="journey-tabs" role="tablist" aria-label="How it works">
          {(Object.keys(journeys) as JourneyKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={journey === key}
              className={journey === key ? 'selected' : ''}
              onClick={() => setJourney(key)}
            >
              {journeys[key].label}
            </button>
          ))}
        </div>
        {active.steps.map((s) => (
          <article className="step-row" key={`${journey}-${s[0]}`}>
            <div className="step-icon">
              <Icon name={s[2]} />
            </div>
            <div>
              <h3>{s[0]}</h3>
              <p>{s[1]}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="section two-column-note">
        <div>
          <Eyebrow>For people who help</Eyebrow>
          <h2>Your time and skills have value.</h2>
        </div>
        <div>
          <p>
            Explore nearby requests, choose what works for you, and agree on the details. Active is
            designed to help everyday capability become meaningful opportunity.
          </p>
          <Button onClick={() => go('explore')}>
            Explore demo requests <Icon name="arrow" size={17} />
          </Button>
        </div>
      </section>
      <CTA go={go} />
    </>
  );
}
