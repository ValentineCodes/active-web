import type { RequestItem } from "@/types/site"

export const demoRequests: RequestItem[] = [
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
    avatarUrl:
      "https://images.unsplash.com/photo-1589156191108-c762ff4b96ab?auto=format&fit=crop&w=120&h=120&q=80",
    attachment: {
      image:
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80",
      alt: "Flat-pack wardrobe boxes in a bedroom",
      caption:
        "Two-door wardrobe still in boxes — assembly needed in the bedroom.",
    },
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
    avatarUrl:
      "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=120&h=120&q=80",
    attachment: {
      image:
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80",
      alt: "Fashion accessories laid out for product photos",
      caption:
        "Fifteen pieces to shoot — clean white background preferred.",
    },
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
    avatarUrl:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=120&h=120&q=80",
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
    attachment: {
      image:
        "https://images.unsplash.com/photo-1579998120708-682dd8a5624f?auto=format&fit=crop&w=800&q=80",
      alt: "Busy market street scene",
      caption:
        "Shopping list attached — vegetables, spices, and pantry staples from Tejuosho.",
    },
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
    avatarUrl:
      "https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=120&h=120&q=80",
  },
]
