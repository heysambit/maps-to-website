import type { ButtonHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' };
const buttonStyles = cva('inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55', {
  variants: { variant: {
    primary: 'bg-primary text-on-primary hover:brightness-95',
    secondary: 'border border-[var(--dash-control)] bg-[var(--dash-surface)] text-[var(--dash-ink)] hover:bg-black/5',
    ghost: 'text-[var(--dash-ink)] hover:bg-black/5',
    danger: 'bg-danger text-white',
  } },
  defaultVariants: { variant: 'primary' },
});
export function Button({ variant = 'primary', className, ...props }: Props) {
  return <button className={cn(buttonStyles({ variant }), className)} {...props} />;
}
