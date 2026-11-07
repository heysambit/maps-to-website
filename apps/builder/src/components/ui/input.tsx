import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const control = 'w-full min-h-11 rounded-lg border border-[var(--dash-control)] bg-[var(--dash-surface)] px-3 py-2 text-[var(--dash-ink)] placeholder:text-[var(--dash-muted)]';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cn(control, props.className)} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={cn(control, 'min-h-24 resize-y', props.className)} />; }
