import { ReactNode } from "react"
import { Eyebrow } from "@/components/ui/Eyebrow"

export function PageHero({
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
