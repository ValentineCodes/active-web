import { CTA } from "@/components/layout/CTA"
import { PageHero } from "@/components/layout/PageHero"
import { Button } from "@/components/ui/Button"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { Icon } from "@/components/ui/Icon"
import type { Navigate } from "@/types/site"

export function HowPage({ go }: { go: Navigate }) {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title={
          <>
            Simple by design.
            <br />
            <em>Human at heart.</em>
          </>
        }
        text="Whether you need an extra pair of hands or want to put your skills to work, Active keeps the journey clear."
      />
      <section className="section journey">
        <div className="journey-tabs">
          <span>Getting help</span>
          <span>Getting paid</span>
        </div>
        {[
          [
            "01",
            "Share what you need",
            "Describe the task, set your location and suggest a fair budget.",
          ],
          [
            "02",
            "Choose who feels right",
            "Review responses and pick someone whose experience fits your request.",
          ],
          [
            "03",
            "Get it done",
            "Coordinate the details, complete the task and confirm everything went well.",
          ],
        ].map((s, i) => (
          <article className="step-row" key={s[0]}>
            <div className="step-number">{s[0]}</div>
            <div className="step-icon">
              <Icon name={i === 0 ? "plus" : i === 1 ? "users" : "check"} />
            </div>
            <div>
              <h3>{s[1]}</h3>
              <p>{s[2]}</p>
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
            Explore nearby requests, choose what works for you, and agree on the
            details. Active is designed to help everyday capability become
            meaningful opportunity.
          </p>
          <Button onClick={() => go("explore")}>
            Explore demo requests <Icon name="arrow" size={17} />
          </Button>
        </div>
      </section>
      <CTA go={go} />
    </>
  )
}
