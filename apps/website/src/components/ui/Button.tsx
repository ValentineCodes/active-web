import { ReactNode } from "react"

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "light" | "text"
  type?: "button" | "submit"
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`button button-${variant} ${className}`}
    >
      {children}
    </button>
  )
}
