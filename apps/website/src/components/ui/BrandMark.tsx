import { assets } from "@/lib/assets"

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark ${compact ? "brand-mark-compact" : ""}`}>
      <img src={assets.crown} alt="" />
    </span>
  )
}
