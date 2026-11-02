import { useMemo, useState } from "react"
import { PageHero } from "@/components/layout/PageHero"
import { RequestCard } from "@/components/marketing/RequestCard"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { demoRequests } from "@/data/requests"
import type { RequestItem } from "@/types/site"

export function ExplorePage() {
  const categories = [
    "All",
    ...Array.from(new Set(demoRequests.map((r) => r.category))),
  ]
  const [category, setCategory] = useState("All")
  const [selected, setSelected] = useState<RequestItem | null>(null)
  const filtered = useMemo(
    () =>
      category === "All"
        ? demoRequests
        : demoRequests.filter((r) => r.category === category),
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
