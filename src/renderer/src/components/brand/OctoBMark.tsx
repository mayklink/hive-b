import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

/** In-app OctoB mark — robotic octopus in brand violets (reads well at header sizes). */
export function OctoBMark({ className, ...props }: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
      {...props}
    >
      {/* Antenna */}
      <path
        d="M12 5.5V3.5M10.5 3h3"
        stroke="#a855f7"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="2.4" r="0.9" fill="#c4b5fd" />
      {/* Body */}
      <ellipse cx="12" cy="10" rx="5.2" ry="4.2" fill="#1e1b2e" stroke="#a855f7" strokeWidth="1" />
      {/* Visor */}
      <rect x="7.8" y="8.2" width="8.4" height="3.2" rx="1" fill="#7c3aed" stroke="#c4b5fd" strokeWidth="0.5" />
      <rect x="8.6" y="8.9" width="2.2" height="1.6" rx="0.35" fill="#e9d5ff" opacity="0.95" />
      <rect x="13.1" y="8.9" width="2.2" height="1.6" rx="0.35" fill="#e9d5ff" opacity="0.85" />
      {/* Side ports */}
      <circle cx="6.3" cy="10" r="0.55" fill="#a855f7" />
      <circle cx="17.7" cy="10" r="0.55" fill="#a855f7" />
      {/* Tentacles — segmented / robotic */}
      <path
        d="M7.5 13.2c-1.2 1.4-2.2 2.6-2.8 4.1M9.2 13.6c-0.5 1.8-1 3.4-1.2 5.2M12 14v4.2M14.8 13.6c0.5 1.8 1 3.4 1.2 5.2M16.5 13.2c1.2 1.4 2.2 2.6 2.8 4.1"
        stroke="#9333ea"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <circle cx="4.5" cy="17.8" r="0.65" fill="#a855f7" />
      <circle cx="7.8" cy="19.2" r="0.55" fill="#c4b5fd" />
      <circle cx="12" cy="18.5" r="0.55" fill="#a855f7" />
      <circle cx="16.2" cy="19.2" r="0.55" fill="#c4b5fd" />
      <circle cx="19.5" cy="17.8" r="0.65" fill="#a855f7" />
    </svg>
  )
}
