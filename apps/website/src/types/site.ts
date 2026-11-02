export type Page =
  | "home"
  | "explore"
  | "how"
  | "about"
  | "partners"
  | "safety"
  | "faq"
  | "contact"

export type RequestItem = {
  id: number
  category: string
  title: string
  location: string
  budget: string
  time: string
  description: string
  initials: string
  avatarUrl?: string
  attachment?: {
    image: string
    alt: string
    caption: string
  }
}

export type Navigate = (page: Page) => void
