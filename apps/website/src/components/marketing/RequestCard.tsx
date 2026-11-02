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
      {item.attachment && (
        <div className="request-cover">
          <img src={item.attachment.image} alt={item.attachment.alt} />
        </div>
      )}
      <div className="request-card-body">
        <h3>{item.title}</h3>
        <p className="request-card-description">{item.description}</p>
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
          <div
            className={`request-avatar ${item.avatarUrl ? "request-avatar--photo" : ""}`}
          >
            {item.avatarUrl ? (
              <img src={item.avatarUrl} alt="" />
            ) : (
              item.initials
            )}
          </div>
          <div>
            <small>Offer</small>
            <strong>{item.budget}</strong>
          </div>
          <span className="round-arrow">
            <Icon name="arrow" size={17} />
          </span>
        </div>
      </div>
    </article>
  )
}
