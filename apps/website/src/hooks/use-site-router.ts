import { useEffect } from "react"
import { pageFromHash } from "@/lib/hash-router"
import type { Page } from "@/types/site"

export function usePageEffects(page: Page) {
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
}

export function useHashRouter(setPage: (page: Page) => void) {
  useEffect(() => {
    const onHash = () => {
      setPage(pageFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [setPage])
}
