import type { SVGProps } from 'react'

const paths = {
  workflow: 'M5 3h5v5H5z M14 16h5v5h-5z M5 16h5v5H5z M7.5 8v4h9v4 M7.5 12v4',
  upload: 'M12 16V4 m-5 5 5-5 5 5 M4 16v4h16v-4',
  arrow: 'M4 12h16 m-6-6 6 6-6 6',
  back: 'M20 12H4 m6-6-6 6 6 6',
  branch: 'M5 4v9a5 5 0 0 0 5 5h9 M5 4v4h8a5 5 0 0 0 5-5 M15 15l4 3-4 3',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7z',
  sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  file: 'M14 3H6v18h12V7z M14 3v5h4 M9 12h6 M9 16h6',
  close: 'm6 6 12 12 M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  play: 'm8 4 12 8-12 8z',
  stop: 'M6 6h12v12H6z',
  reset: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7',
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
