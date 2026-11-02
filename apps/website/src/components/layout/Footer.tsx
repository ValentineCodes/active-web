import { BrandMark } from "@/components/ui/BrandMark"
import type { Navigate } from "@/types/site"

export function Footer({ go }: { go: Navigate }) {
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
