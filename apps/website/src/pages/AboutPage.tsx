import { PageHero } from "@/components/layout/PageHero"
import { Button } from "@/components/ui/Button"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { Icon } from "@/components/ui/Icon"
import type { Navigate } from "@/types/site"

export function AboutPage({ go }: { go: Navigate }) {
  return (
    <>
      <PageHero
        dark
        eyebrow="About Active"
        title={
          <>
            We believe progress
            <br />
            starts with a <em>hand.</em>
          </>
        }
        text="Active is a Nigerian marketplace being built to connect everyday needs with everyday capability."
      />
      <section className="section manifesto">
        <Eyebrow>Our point of view</Eyebrow>
        <p>
          Across Nigeria, people need trusted help to keep life moving. At the
          same time, capable people have time, skills, and energy to offer.
        </p>
        <h2>
          Active exists to make that connection feel simple, dignified, and
          worthwhile.
        </h2>
      </section>
      <section className="values section">
        {[
          [
            "01",
            "People first",
            "Technology should make human connection easier — never colder.",
          ],
          [
            "02",
            "Opportunity, unlocked",
            "Useful skills deserve a clear path to meaningful earning.",
          ],
          [
            "03",
            "Trust by design",
            "Safety and transparency belong in every interaction.",
          ],
          [
            "04",
            "Built for here",
            "We design around local context, not borrowed assumptions.",
          ],
        ].map((v) => (
          <article key={v[0]}>
            <span>{v[0]}</span>
            <h3>{v[1]}</h3>
            <p>{v[2]}</p>
          </article>
        ))}
      </section>
      <section className="founder-note section">
        <div className="founder-image">
          <img
            data-parallax="0.05"
            src="https://images.unsplash.com/photo-1580239808566-2f1c56a693ac?auto=format&fit=crop&w=1000&q=85"
            alt="Aerial view of Lagos"
          />
        </div>
        <div>
          <Eyebrow>Our ambition</Eyebrow>
          <h2>A more connected way to move forward.</h2>
          <p>
            We’re exploring how a trusted, local marketplace can help
            communities solve everyday problems while opening flexible paths to
            income.
          </p>
          <Button onClick={() => go("partners")}>
            For investors & partners <Icon name="arrow" size={17} />
          </Button>
        </div>
      </section>
    </>
  )
}
