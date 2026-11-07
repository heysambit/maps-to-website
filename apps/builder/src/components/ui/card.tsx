import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export function Card(props: HTMLAttributes<HTMLElement>) { return <section {...props} className={cn('rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5 shadow-sm', props.className)} />; }
