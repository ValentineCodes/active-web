import { Icon } from "@/components/ui/Icon"
import type { RequestItem } from "@/types/site"

export function RequestCard({
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
