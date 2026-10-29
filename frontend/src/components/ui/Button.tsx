import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'text'
  size?: 'default' | 'compact' | 'inline'
}

const variants = {
  primary: 'border-transparent bg-accent text-white shadow-sm hover:bg-accent-hover hover:shadow-md motion-safe:hover:-translate-y-0.5 active:translate-y-0',
  secondary: 'border-line bg-surface text-ink shadow-xs hover:border-slate-300 hover:bg-slate-50',
  text: 'border-transparent bg-transparent text-accent hover:text-accent-hover hover:underline',
}

const sizes = {
  default: 'min-h-10.5 px-5 py-2.5 text-xs',
  compact: 'min-h-8 px-3 py-1.5 text-[10px]',
  inline: 'min-h-6 p-0 text-[10px]',
}

export function Button({ variant = 'primary', size = 'default', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2.5 rounded-md border font-semibold leading-[1.3] transition duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none [&_svg]:shrink-0 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}
