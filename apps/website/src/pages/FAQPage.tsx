import { useState } from "react"
import { PageHero } from "@/components/layout/PageHero"
import { Button } from "@/components/ui/Button"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { Icon } from "@/components/ui/Icon"
import { faqs } from "@/data/faqs"
import type { Navigate } from "@/types/site"

export function FAQPage({ go }: { go: Navigate }) {
  const [open, setOpen] = useState(0)
  return (
    <>
      <PageHero
        eyebrow="Frequently asked questions"
        title={
          <>
            A few things you
            <br />
            might be <em>wondering.</em>
          </>
        }
        text="Straightforward answers about the Active idea and this prototype."
      />
      <section className="section faq-list">
        {faqs.map((f, i) => (
          <article key={f[0]} className={open === i ? "faq-open" : ""}>
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              aria-expanded={open === i}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <strong>{f[0]}</strong>
              <i>
                <Icon name={open === i ? "close" : "plus"} />
              </i>
            </button>
            <div className="faq-answer">
              <p>{f[1]}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="question-card section">
        <div>
          <Eyebrow>Still curious?</Eyebrow>
          <h2>Let’s talk it through.</h2>
          <p>
            Tell us what you’re exploring and we’ll continue the conversation.
          </p>
        </div>
        <Button onClick={() => go("contact")}>
          Book a demo <Icon name="arrow" size={17} />
        </Button>
      </section>
    </>
  )
}
