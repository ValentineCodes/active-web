import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/ui/Icon';

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const next: Record<string, string> = {};
    if (!String(data.get('name') || '').trim()) next.name = 'Please enter your name.';
    const email = String(data.get('email') || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email address.';
    if (!data.get('interest')) next.interest = 'Choose what you’d like to discuss.';
    setErrors(next);
    if (!Object.keys(next).length) setSubmitted(true);
  };
  return (
    <section className="contact-page">
      <div className="contact-intro">
        <Eyebrow light>Book a demo</Eyebrow>
        <h1>
          Seeing is
          <br />
          <em>believing</em>
        </h1>
        <p>
          See the Active concept, explore ways to collaborate, or share what caught your attention.
        </p>
        <div className="contact-points">
          <span>
            <Icon name="check" /> A 10-minute walkthrough
          </span>
          <span>
            <Icon name="check" /> A candid conversation
          </span>
          <span>
            <Icon name="check" /> Questions & Answers
          </span>
        </div>
      </div>
      <div className="form-wrap">
        {submitted ? (
          <div className="success-state">
            <div className="success-state-icon">
              <Icon name="check" size={34} />
            </div>
            <h2>Request received</h2>
            <p>Thanks for reaching out. Please be patient, we will get back to you shortly.</p>
            <Button onClick={() => setSubmitted(false)}>Send another</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-head">
              <span>Demo enquiry</span>
            </div>
            <label>
              Full name
              <input name="name" placeholder="What do we call you?" aria-invalid={!!errors.name} />
              {errors.name && <small>{errors.name}</small>}
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                aria-invalid={!!errors.email}
              />
              {errors.email && <small>{errors.email}</small>}
            </label>
            <label>
              I’m interested in
              <select
                className="contact-field"
                name="interest"
                defaultValue="Product demo"
                aria-invalid={!!errors.interest}
              >
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
          </form>
        )}
      </div>
    </section>
  );
}
