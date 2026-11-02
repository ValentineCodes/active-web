import { ReactNode, useState } from "react"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { useHashRouter, usePageEffects } from "@/hooks/use-site-router"
import { navigateTo, pageFromHash } from "@/lib/hash-router"
import { AboutPage } from "@/pages/AboutPage"
import { ContactPage } from "@/pages/ContactPage"
import { ExplorePage } from "@/pages/ExplorePage"
import { FAQPage } from "@/pages/FAQPage"
import { HomePage } from "@/pages/HomePage"
import { HowPage } from "@/pages/HowPage"
import { PartnersPage } from "@/pages/PartnersPage"
import { SafetyPage } from "@/pages/SafetyPage"
import type { Navigate, Page } from "@/types/site"

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash)

  useHashRouter(setPage)
  usePageEffects(page)

  const go: Navigate = (next) => {
    if (page === next) window.scrollTo({ top: 0, behavior: "smooth" })
    else navigateTo(next)
  }

  const content: Record<Page, ReactNode> = {
    home: <HomePage go={go} />,
    explore: <ExplorePage />,
    how: <HowPage go={go} />,
    about: <AboutPage go={go} />,
    partners: <PartnersPage go={go} />,
    safety: <SafetyPage go={go} />,
    faq: <FAQPage go={go} />,
    contact: <ContactPage />,
  }

  return (
    <div className="app">
      <Header page={page} go={go} />
      <main>{content[page]}</main>
      <Footer go={go} />
    </div>
  )
}
