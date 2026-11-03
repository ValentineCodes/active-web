import { useState } from "react"
import { PageHero } from "@/components/layout/PageHero"
import { RequestCard } from "@/components/marketing/RequestCard"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { demoRequests } from "@/data/requests"
import type { RequestItem } from "@/types/site"

export function ExplorePage() {
  const [selected, setSelected] = useState<RequestItem | null>(null)
  return (
    <>
      <PageHero
        eyebrow="Explore requests"
        title={
          <>
            See where you can <em>help</em>
          </>
        }
        text="Browse requests to see how people discover flexible ways to help and earn on Active."
      />
      <section className="section explore-section">
        <div className="request-grid">
          {demoRequests.map((r) => (
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
            {selected.attachment && (
              <figure className="modal-attachment">
                <img
                  src={selected.attachment.image}
                  alt={selected.attachment.alt}
                />
              </figure>
            )}
            <p>{selected.description}</p>
            <div className="modal-budget">
              <span>Offer</span>
              <strong>{selected.budget}</strong>
            </div>
            <Button onClick={() => setSelected(null)}>
              Got it <Icon name="check" size={18} />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
