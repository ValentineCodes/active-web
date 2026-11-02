import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react"

type Page = "home" | "explore" | "how" | "about" | "partners" | "safety" | "faq" | "contact"
type RequestItem = {
  id: number
  category: string
  title: string
  location: string
  budget: string
  time: string
  description: string
  initials: string
}

const requests: RequestItem[] = [
  {
    id: 1,
    category: "Home help",
    title: "Help assemble a new wardrobe",
    location: "Yaba, Lagos",
    budget: "₦18,000",
    time: "This Saturday",
    description:
      "I need someone experienced with flat-pack furniture to assemble a two-door wardrobe. Tools would be helpful.",
    initials: "AO",
  },
  {
    id: 2,
    category: "Delivery",
    title: "Pick up and deliver a cake",
    location: "Wuse 2, Abuja",
    budget: "₦8,500",
    time: "Tomorrow, 2pm",
    description:
      "Collect a birthday cake from a bakery in Wuse 2 and deliver it carefully to Maitama.",
    initials: "ZI",
  },
  {
    id: 3,
    category: "Digital",
    title: "Photograph products for my shop",
    location: "Lekki, Lagos",
    budget: "₦35,000",
    time: "Flexible",
    description:
      "Looking for a product photographer to shoot 15 fashion accessories for my online store.",
    initials: "KN",
  },
  {
    id: 4,
    category: "Events",
    title: "Two event assistants needed",
    location: "Ibadan, Oyo",
    budget: "₦25,000",
    time: "Friday, 4pm",
    description:
      "Help welcome guests, coordinate seating and support our small event team for six hours.",
    initials: "TM",
  },
  {
    id: 5,
    category: "Errands",
    title: "Market shopping and drop-off",
    location: "Surulere, Lagos",
    budget: "₦12,000",
    time: "Wednesday",
    description:
      "Purchase items from the provided list at Tejuosho Market and deliver them to Surulere.",
    initials: "BE",
  },
  {
    id: 6,
    category: "Learning",
    title: "Beginner guitar lesson",
    location: "GRA, Port Harcourt",
    budget: "₦15,000",
    time: "Weekend",
    description:
      "A relaxed 90-minute lesson for a complete beginner. Please bring or recommend a suitable guitar.",
    initials: "EN",
  },
]

const navItems: { page: Page; label: string }[] = [
  { page: "explore", label: "Explore requests" },
  { page: "how", label: "How it works" },
  { page: "about", label: "About" },
  { page: "safety", label: "Safety" },
  { page: "faq", label: "FAQ" },
]

const pageFromHash = (): Page => {
  const value = window.location.hash.replace("#/", "") as Page
  return [
    "home",
    "explore",
    "how",
    "about",
    "partners",
    "safety",
    "faq",
    "contact",
  ].includes(value)
    ? value
    : "home"
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    shield: (
      <>
        <path d="M12 3 5 6v5c0 4.5 2.9 8.4 7 10 4.1-1.6 7-5.5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
        <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19c.5-4 2.5-6 6-6s5.5 2 6 6" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8M18 14c1.8.8 2.8 2.5 3 5" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    heart: (
      <path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  }
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  )
}

function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "light" | "text"
  type?: "button" | "submit"
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`button button-${variant} ${className}`}
    >
      {children}
    </button>
  )
}

function Eyebrow({
  children,
  light = false,
}: {
  children: ReactNode
  light?: boolean
}) {
  return (
    <div className={`eyebrow ${light ? "eyebrow-light" : ""}`}>
      <span />
      <span>{children}</span>
    </div>
  )
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark ${compact ? "brand-mark-compact" : ""}`}>
      <img src="/assets/active-crown.png" alt="" />
    </span>
  )
}

function Header({ page, go }: { page: Page; go: (p: Page) => void }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  const navigate = (p: Page) => {
    setOpen(false)
    go(p)
  }
  return (
    <header className={`site-header ${scrolled ? "header-scrolled" : ""}`}>
      <div className="nav-wrap">
        <button
          className="logo"
          onClick={() => navigate("home")}
          aria-label="Active home"
        >
          <BrandMark compact />
          <span>active</span>
        </button>
        <nav
          className={`nav-links ${open ? "nav-open" : ""}`}
          aria-label="Main navigation"
        >
          {navItems.map((item) => (
            <button
              key={item.page}
              className={page === item.page ? "active" : ""}
              onClick={() => navigate(item.page)}
            >
              {item.label}
            </button>
          ))}
          <button
            className={
              page === "partners" ? "active mobile-only" : "mobile-only"
            }
            onClick={() => navigate("partners")}
          >
            Partners
          </button>
          <Button onClick={() => navigate("contact")} className="nav-cta">
            Book a demo <Icon name="arrow" size={17} />
          </Button>
        </nav>
        <button
          className="menu-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
    </header>
  )
}

function Footer({ go }: { go: (p: Page) => void }) {
  return (
    <footer>
      <div className="footer-top">
        <div className="footer-brand">
          <button className="logo logo-light" onClick={() => go("home")}>
            <BrandMark compact />
            <span>active</span>
          </button>
          <p>
            Making it simpler for Nigerians to get help, earn fairly, and move
            forward.
          </p>
        </div>
        <div className="footer-links">
          <strong>Discover</strong>
          <button onClick={() => go("explore")}>Explore requests</button>
          <button onClick={() => go("how")}>How it works</button>
          <button onClick={() => go("safety")}>Safety & trust</button>
        </div>
        <div className="footer-links">
          <strong>Company</strong>
          <button onClick={() => go("about")}>About Active</button>
          <button onClick={() => go("partners")}>Investors & partners</button>
          <button onClick={() => go("faq")}>FAQ</button>
        </div>
        <div className="footer-links">
          <strong>Let’s talk</strong>
          <button onClick={() => go("contact")}>Book a demo</button>
          <a href="mailto:hello@active.demo">hello@active.demo</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2025 Active. Prototype for demonstration.</span>
        <span>Made with purpose in Nigeria.</span>
      </div>
    </footer>
  )
}

function PageHero({
  eyebrow,
  title,
  text,
  children,
  dark = false,
}: {
  eyebrow: string
  title: ReactNode
  text: string
  children?: ReactNode
  dark?: boolean
}) {
  return (
    <section className={`page-hero ${dark ? "dark" : ""}`}>
      <div className="page-hero-inner">
        <Eyebrow light={dark}>{eyebrow}</Eyebrow>
        <h1>{title}</h1>
        <p>{text}</p>
        {children}
      </div>
    </section>
  )
}

function Home({ go }: { go: (p: Page) => void }) {
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <Eyebrow>Help, made human</Eyebrow>
          <h1>
            Get help.
            <br />
            <em>Get paid.</em>
          </h1>
          <p>
            Active connects everyday needs with capable people ready to help —
            creating opportunity, one request at a time.
          </p>
          <div className="hero-actions">
            <Button onClick={() => go("contact")}>
              Book a demo <Icon name="arrow" size={18} />
            </Button>
            <Button variant="secondary" onClick={() => go("explore")}>
              Explore requests
            </Button>
          </div>
          <div className="trust-line">
            <div className="avatar-stack">
              <span>AO</span>
              <span>ZI</span>
              <span>KN</span>
            </div>
            <p>
              <strong>Built for real life</strong>
              <br />
              Flexible help, on your terms
            </p>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-image-wrap">
            <img
              data-parallax="0.08"
              src="https://images.unsplash.com/photo-1662988862761-7f296f441c04?auto=format&fit=crop&w=1000&q=85"
              alt="Two people in Lagos"
            />
          </div>
          <div className="floating-card float-one">
            <span className="float-icon">
              <Icon name="check" />
            </span>
            <div>
              <small>Request matched</small>
              <strong>Help is on the way</strong>
            </div>
          </div>
          <div className="floating-card float-two">
            <small>Earn on your terms</small>
            <strong>₦25,000</strong>
            <span>Event assistance · Demo</span>
          </div>
          <div className="hero-dots" />
        </div>
      </section>

      <section className="promise-strip">
        <p>One community. Two ways forward.</p>
        <div>
          <span>
            <Icon name="heart" /> Get the help you need
          </span>
          <i />
          <span>
            <Icon name="spark" /> Earn with what you know
          </span>
        </div>
      </section>

      <section className="section split-intro">
        <div>
          <Eyebrow>Why Active</Eyebrow>
          <h2>
            Everyday needs.
            <br />
            Extraordinary potential.
          </h2>
        </div>
        <div className="section-copy">
          <p>
            Life gets busy. Skills go unused. Active brings both sides together
            — simply, safely, and locally.
          </p>
          <button className="text-link" onClick={() => go("about")}>
            Our story <Icon name="arrow" size={18} />
          </button>
        </div>
      </section>

      <section className="path-grid section">
        <article className="path-card green">
          <div className="path-number">01</div>
          <Icon name="users" size={32} />
          <h3>I need help</h3>
          <p>Post what you need, choose the right person, and get it sorted.</p>
          <Button variant="light" onClick={() => go("how")}>
            See how it works <Icon name="arrow" size={17} />
          </Button>
        </article>
        <article className="path-card ink">
          <div className="path-number">02</div>
          <Icon name="spark" size={32} />
          <h3>I want to earn</h3>
          <p>
            Find requests that fit your time and skills. Help out and get paid.
          </p>
          <Button variant="light" onClick={() => go("explore")}>
            View requests <Icon name="arrow" size={17} />
          </Button>
        </article>
      </section>

      <section className="section request-preview">
        <div className="section-head">
          <div>
            <Eyebrow>Happening on Active</Eyebrow>
            <h2>
              Small tasks.
              <br />
              Real momentum.
            </h2>
          </div>
          <Button variant="secondary" onClick={() => go("explore")}>
            View all demo requests <Icon name="arrow" size={17} />
          </Button>
        </div>
        <div className="demo-label">Sample requests · Demo data only</div>
        <div className="request-grid">
          {requests.slice(0, 3).map((r) => (
            <RequestCard key={r.id} item={r} onOpen={() => go("explore")} />
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
          <Eyebrow light>Built around people</Eyebrow>
          <h2>Opportunity should be active, too.</h2>
          <p>
            We’re building for the energy, ingenuity, and everyday reality of
            Nigerian communities.
          </p>
          <Button variant="light" onClick={() => go("partners")}>
            Partner with us <Icon name="arrow" size={17} />
          </Button>
        </div>
      </section>

      <CTA go={go} />
    </>
  )
}

function RequestCard({
  item,
  onOpen,
}: {
  item: RequestItem
  onOpen: () => void
}) {
  return (
    <article className="request-card" onClick={onOpen}>
      <div className="request-top">
        <span className="category-pill">{item.category}</span>
        <span className="demo-mini">DEMO</span>
      </div>
      <h3>{item.title}</h3>
      <div className="request-meta">
        <span>
          <Icon name="pin" size={16} />
          {item.location}
        </span>
        <span>
          <Icon name="clock" size={16} />
          {item.time}
        </span>
      </div>
      <div className="request-bottom">
        <div className="request-avatar">{item.initials}</div>
        <div>
          <small>Proposed budget</small>
          <strong>{item.budget}</strong>
        </div>
        <span className="round-arrow">
          <Icon name="arrow" size={17} />
        </span>
      </div>
    </article>
  )
}

function Explore() {
  const categories = [
    "All",
    ...Array.from(new Set(requests.map((r) => r.category))),
  ]
  const [category, setCategory] = useState("All")
  const [selected, setSelected] = useState<RequestItem | null>(null)
  const filtered = useMemo(
    () =>
      category === "All"
        ? requests
        : requests.filter((r) => r.category === category),
    [category],
  )
  return (
    <>
      <PageHero
        eyebrow="Explore requests"
        title={
          <>
            See where you can <em>help.</em>
          </>
        }
        text="Browse sample requests to see how people discover flexible ways to help and earn on Active."
      >
        <div className="notice">
          <Icon name="spark" size={18} />
          <span>
            <strong>Prototype preview:</strong> Every request shown here is
            fictional demo data.
          </span>
        </div>
      </PageHero>
      <section className="section explore-section">
        <div className="filter-row" aria-label="Request filters">
          {categories.map((c) => (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="results-bar">
          <span>{filtered.length} demo requests</span>
          <span>Updated for prototype</span>
        </div>
        <div className="request-grid">
          {filtered.map((r) => (
            <RequestCard key={r.id} item={r} onOpen={() => setSelected(r)} />
          ))}
        </div>
      </section>
      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              <Icon name="close" />
            </button>
            <div className="demo-label">Fictional request · Demo only</div>
            <span className="category-pill">{selected.category}</span>
            <h2 id="request-title">{selected.title}</h2>
            <div className="request-meta">
              <span>
                <Icon name="pin" size={16} />
                {selected.location}
              </span>
              <span>
                <Icon name="clock" size={16} />
                {selected.time}
              </span>
            </div>
            <p>{selected.description}</p>
            <div className="modal-budget">
              <span>Proposed budget</span>
              <strong>{selected.budget}</strong>
            </div>
            <Button onClick={() => setSelected(null)}>
              Got it <Icon name="check" size={18} />
            </Button>
            <small className="modal-note">
              This prototype does not accept or process real requests.
            </small>
          </div>
        </div>
      )}
    </>
  )
}

function How({ go }: { go: (p: Page) => void }) {
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

function About({ go }: { go: (p: Page) => void }) {
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

function Partners({ go }: { go: (p: Page) => void }) {
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
        <Button variant="light" onClick={() => go("contact")}>
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
            Active is exploring a marketplace model that helps turn fragmented
            everyday needs into accessible, flexible opportunities — shaped for
            the Nigerian context.
          </p>
        </div>
      </section>
      <section className="partner-grid section">
        {[
          [
            "Communities",
            "Support pathways to local earning and stronger neighbourhood connections.",
          ],
          [
            "Organisations",
            "Explore new ways to connect people, services, and opportunities.",
          ],
          [
            "Investors",
            "Join the conversation around the future of trusted local work.",
          ],
        ].map((x, i) => (
          <article key={x[0]}>
            <span>0{i + 1}</span>
            <Icon
              name={i === 0 ? "users" : i === 1 ? "spark" : "arrow"}
              size={28}
            />
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
            This website is a prototype. We do not present invented traction,
            live marketplace data, or partnerships. We’d rather start an honest
            conversation about the problem and the opportunity.
          </p>
        </div>
      </section>
      <CTA go={go} title="Interested in where Active could go?" />
    </>
  )
}

function Safety({ go }: { go: (p: Page) => void }) {
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
            "shield",
            "Clear identities",
            "Profiles and verification signals can help people understand who they’re interacting with.",
          ],
          [
            "users",
            "Informed choices",
            "Useful context, clear expectations, and transparent request details support better decisions.",
          ],
          [
            "lock",
            "Safer communication",
            "Keeping conversations organised creates a clearer record and reduces uncertainty.",
          ],
          [
            "heart",
            "Community standards",
            "Respectful behaviour and clear reporting pathways help protect the whole community.",
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
            Meet in appropriate places, protect personal information, agree on
            details in advance, and trust your instincts. No marketplace can
            remove every risk.
          </p>
          <Button variant="light" onClick={() => go("faq")}>
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
  )
}

const faqs = [
  [
    "What is Active?",
    "Active is a marketplace concept designed to connect people who need everyday help with people who have the time and skills to provide it. This site is a clickable prototype, not a live service.",
  ],
  [
    "Is Active live yet?",
    "Not through this prototype. All requests, profiles, budgets, and interactions shown here are fictional demo content.",
  ],
  [
    "How would people earn on Active?",
    "The intended experience lets people browse suitable requests, agree on the scope and budget, complete the work, and get paid. Specific product policies are still being developed.",
  ],
  [
    "What kinds of requests belong on Active?",
    "Everyday, lawful needs such as errands, home help, deliveries, creative support, event assistance, and learning support could be a fit.",
  ],
  [
    "How will Active approach safety?",
    "The product direction prioritises identity signals, clear task details, informed choice, communication records, community standards, and accessible reporting.",
  ],
  [
    "Can my organisation partner with Active?",
    "We welcome thoughtful conversations with aligned organisations, communities, and investors. Use the Book a demo form to tell us what you have in mind.",
  ],
]

function FAQ({ go }: { go: (p: Page) => void }) {
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

function Contact() {
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

function CTA({
  go,
  title = "Ready to see Active in motion?",
}: {
  go: (p: Page) => void
  title?: string
}) {
  return (
    <section className="cta">
      <div className="cta-mark">
        <BrandMark />
      </div>
      <div>
        <Eyebrow light>Get help or get paid</Eyebrow>
        <h2>{title}</h2>
      </div>
      <div>
        <Button variant="light" onClick={() => go("contact")}>
          Book a demo <Icon name="arrow" size={17} />
        </Button>
        <Button variant="text" onClick={() => go("explore")}>
          Explore requests
        </Button>
      </div>
    </section>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash)
  useEffect(() => {
    const onHash = () => {
      setPage(pageFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    const revealTargets = document.querySelectorAll(
      "main section, main article, .page-hero-inner > *, .hero-copy > *",
    )

    if (reducedMotion) {
      revealTargets.forEach((element) => element.classList.add("is-visible"))
      return
    }

    revealTargets.forEach((element, index) => {
      element.classList.add("reveal-motion")
      if (element instanceof HTMLElement) {
        element.style.setProperty("--reveal-delay", `${(index % 4) * 55}ms`)
      }
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    )
    revealTargets.forEach((element) => observer.observe(element))

    const parallaxElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-parallax]"),
    )
    let frame = 0
    const updateParallax = () => {
      frame = 0
      parallaxElements.forEach((element) => {
        const rect = element.parentElement?.getBoundingClientRect()
        if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) return
        const strength = Number(element.dataset.parallax || 0.05)
        const offset =
          (window.innerHeight / 2 - (rect.top + rect.height / 2)) * strength
        element.style.setProperty("--parallax-y", `${offset}px`)
      })
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax)
    }
    updateParallax()
    window.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [page])
  const go = (next: Page) => {
    if (page === next) window.scrollTo({ top: 0, behavior: "smooth" })
    else window.location.hash = `/${next}`
  }
  const content: Record<Page, ReactNode> = {
    home: <Home go={go} />,
    explore: <Explore />,
    how: <How go={go} />,
    about: <About go={go} />,
    partners: <Partners go={go} />,
    safety: <Safety go={go} />,
    faq: <FAQ go={go} />,
    contact: <Contact />,
  }
  return (
    <div className="app">
      <Header page={page} go={go} />
      <main>{content[page]}</main>
      <Footer go={go} />
    </div>
  )
}
