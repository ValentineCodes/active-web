import { Handshake } from 'lucide-react';
import { CTA } from '@/components/layout/CTA';
import { RequestCard } from '@/components/marketing/RequestCard';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/ui/Icon';
import { demoRequests } from '@/data/requests';
import { assets } from '@/lib/assets';
import type { Navigate } from '@/types/site';

export function HomePage({ go }: { go: Navigate }) {
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <h1 className="whitespace-nowrap">
            Get help
            <br />
            <em>in minutes</em>
          </h1>
          <p>
            Anything you can pay for, someone will do it.
            <br />
            Ask for anything and someone will respond.
          </p>
          <div className="hero-actions">
            <Button onClick={() => go('contact')}>
              Book a demo <Icon name="arrow" size={18} />
            </Button>
            <Button variant="secondary" onClick={() => go('explore')}>
              Explore requests
            </Button>
          </div>
        </div>
        <div className="hero-visual">
          <img src={assets.toolsAnimation} alt="Tools animation" />
        </div>
      </section>

      <section className="home-steps section" aria-labelledby="home-steps-title">
        <div className="home-steps-intro">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="home-steps-title">3 steps only</h2>
        </div>
        <ol className="home-steps-grid">
          <li className="home-steps-card">
            <div className="home-steps-icon">
              <Icon name="plus" size={24} />
            </div>
            <h3>Post your request</h3>
            <p>Say what you want and how much you&apos;re willing to pay for it.</p>
          </li>
          <li className="home-steps-card">
            <div className="home-steps-icon">
              <Icon name="users" size={24} />
            </div>
            <h3>Pick a worker</h3>
            <p>Choose from the people who respond to your request.</p>
          </li>
          <li className="home-steps-card">
            <div className="home-steps-icon">
              <Icon name="naira" size={24} />
            </div>
            <h3>Pay when it&apos;s done</h3>
            <p>Pay the worker after the service is done.</p>
          </li>
        </ol>
      </section>

      <section className="promise-strip">
        <div>
          <span>
            <Handshake className="icon" size={20} strokeWidth={1.8} aria-hidden /> Get the help you
            need
          </span>
          <i />
          <span>
            <Icon name="naira" /> Earn with what you know
          </span>
        </div>
      </section>

      <section className="section split-intro">
        <div>
          <Eyebrow>Why Active</Eyebrow>
          <h2>
            So you don&apos;t have to
            <br />
            <span>do it yourself</span>
          </h2>
        </div>
        <div className="section-copy">
          <p>
            Finding workers can be tedious, so don&apos;t. Just say what you want, and let us find
            workers for you.
          </p>
          <button className="text-link" onClick={() => go('about')}>
            Our story <Icon name="arrow" size={18} />
          </button>
        </div>
      </section>

      <section className="path-grid section">
        <article className="path-card path-card--help">
          <div className="path-card-body">
            <div className="path-card-icon" aria-hidden>
              <Handshake size={28} strokeWidth={1.8} />
            </div>
            <p className="path-card-label">Getting help</p>
            <h3>I need help</h3>
            <p className="path-card-copy">
              Post what you need, choose the right person, and get it sorted.
            </p>
          </div>
          <div className="path-card-footer">
            <Button variant="primary" onClick={() => go('how')}>
              See how it works <Icon name="arrow" size={17} />
            </Button>
          </div>
        </article>
        <article className="path-card path-card--earn">
          <div className="path-card-body">
            <div className="path-card-icon" aria-hidden>
              <Icon name="naira" size={28} />
            </div>
            <p className="path-card-label">Getting paid</p>
            <h3>I need money</h3>
            <p className="path-card-copy">
              Find requests that fit your time and skills. Help out and get paid.
            </p>
          </div>
          <div className="path-card-footer">
            <Button variant="primary" onClick={() => go('explore')}>
              View requests <Icon name="arrow" size={17} />
            </Button>
          </div>
        </article>
      </section>

      <section className="section request-preview">
        <div className="section-head">
          <div>
            <Eyebrow>Happening on Active</Eyebrow>
            <h2>Don&apos;t miss out!</h2>
          </div>
          <Button variant="textGreen" onClick={() => go('explore')}>
            View all <Icon name="arrow" size={17} />
          </Button>
        </div>
        <div className="request-grid">
          {demoRequests.slice(0, 3).map((r) => (
            <RequestCard key={r.id} item={r} onOpen={() => go('explore')} />
          ))}
        </div>
      </section>

      <section className="photo-story">
        <div className="photo-panel">
          <img
            data-parallax="0.06"
            src="https://images.unsplash.com/photo-1579998120708-682dd8a5624f?auto=format&fit=crop&w=1200&q=85"
            alt="People at a market in Lagos"
          />
        </div>
        <div className="story-panel">
          <Eyebrow light>Wealth distribution</Eyebrow>
          <h2>A way to give back to the people</h2>
          <p>
            We’re building for the energy, ingenuity, and everyday reality of Nigerian communities.
          </p>
          <Button variant="light" onClick={() => go('partners')}>
            Partner with us <Icon name="arrow" size={17} />
          </Button>
        </div>
      </section>

      <CTA go={go} />
    </>
  );
}
