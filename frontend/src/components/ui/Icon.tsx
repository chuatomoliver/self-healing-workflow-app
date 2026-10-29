import type { SVGProps } from 'react'

const paths = {
  workflow: 'M5 3h5v5H5z M14 16h5v5h-5z M5 16h5v5H5z M7.5 8v4h9v4 M7.5 12v4',
  upload: 'M12 16V4 m-5 5 5-5 5 5 M4 16v4h16v-4',
  arrow: 'M4 12h16 m-6-6 6 6-6 6',
  sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  file: 'M14 3H6v18h12V7z M14 3v5h4 M9 12h6 M9 16h6',
  close: 'm6 6 12 12 M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  text: 'M4 5h16 M12 5v15 M8 20h8',
  external: 'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',
} as const

type IconProps = SVGProps<SVGSVGElement> & { name: keyof typeof paths }

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  )
}
