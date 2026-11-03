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
            If you can pay for it,
            <br />
            someone can <em>do it</em>
          </>
        }
        text="Active is built to connect needs with capabilities."
      />
      <section className="section manifesto">
        <Eyebrow>Our vision</Eyebrow>
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
            "People first",
            "Technology should make human connection easier — never colder.",
            "heart",
          ],
          [
            "Opportunity, unlocked",
            "Useful skills deserve a clear path to meaningful earning.",
            "naira",
          ],
          [
            "Trust by design",
            "Safety and transparency belong in every interaction.",
            "shield",
          ],
        ].map((v) => (
          <article key={v[0]}>
            <Icon name={v[2]} size={28} />
            <h3>{v[0]}</h3>
            <p>{v[1]}</p>
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
          <h2>Solving problems with ease</h2>
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
