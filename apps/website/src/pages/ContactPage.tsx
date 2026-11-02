import { FormEvent, useState } from "react"
import { Button } from "@/components/ui/Button"
import { Eyebrow } from "@/components/ui/Eyebrow"
import { Icon } from "@/components/ui/Icon"

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const next: Record<string, string> = {}
    if (!String(data.get("name") || "").trim())
      next.name = "Please enter your name."
    const email = String(data.get("email") || "")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = "Enter a valid email address."
    if (!data.get("interest"))
      next.interest = "Choose what you’d like to discuss."
    if (!String(data.get("message") || "").trim())
      next.message = "Add a short note so we can prepare."
    setErrors(next)
    if (!Object.keys(next).length) setSubmitted(true)
  }
  return (
    <section className="contact-page">
      <div className="contact-intro">
        <Eyebrow light>Book a demo</Eyebrow>
        <h1>
          Let’s make
          <br />
          <em>something move.</em>
        </h1>
        <p>
          See the Active concept, explore ways to collaborate, or share what
          caught your attention.
        </p>
        <div className="contact-points">
          <span>
            <Icon name="check" /> A focused product walkthrough
          </span>
          <span>
            <Icon name="check" /> A candid conversation — no hard sell
          </span>
          <span>
            <Icon name="check" /> Built around your questions
          </span>
        </div>
      </div>
      <div className="form-wrap">
        {submitted ? (
          <div className="success-state">
            <div>
              <Icon name="check" size={34} />
            </div>
            <Eyebrow>Request received</Eyebrow>
            <h2>Thanks for reaching out.</h2>
            <p>
              This is a prototype, so no real booking was sent. In a live
              experience, the Active team would follow up to arrange a time.
            </p>
            <Button onClick={() => setSubmitted(false)}>
              Send another request
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-head">
              <span>Demo enquiry</span>
              <span>Prototype form</span>
            </div>
            <label>
              Full name
              <input
                name="name"
                placeholder="How should we address you?"
                aria-invalid={!!errors.name}
              />
              {errors.name && <small>{errors.name}</small>}
            </label>
            <label>
              Work email
              <input
                name="email"
                type="email"
                placeholder="you@company.com"
                aria-invalid={!!errors.email}
              />
              {errors.email && <small>{errors.email}</small>}
            </label>
            <label>
              I’m interested in
              <select
                name="interest"
                defaultValue=""
                aria-invalid={!!errors.interest}
              >
                <option value="" disabled>
                  Select one
                </option>
                <option>Product demo</option>
                <option>Investment conversation</option>
                <option>Partnership opportunity</option>
                <option>Community collaboration</option>
              </select>
              {errors.interest && <small>{errors.interest}</small>}
            </label>
            <label>
              Tell us a little more
              <textarea
                name="message"
                rows={4}
                placeholder="What would you like to explore?"
                aria-invalid={!!errors.message}
              />
              {errors.message && <small>{errors.message}</small>}
            </label>
            <Button type="submit" className="submit-button">
              Request a demo <Icon name="arrow" size={18} />
            </Button>
            <p className="privacy-note">
              <Icon name="lock" size={15} /> Demo only — information is not sent
              or stored.
            </p>
          </form>
        )}
      </div>
    </section>
  )
}
