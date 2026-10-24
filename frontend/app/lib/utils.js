import { clsx } from 'clsx';

/** shadcn-style class joiner for the `components/ui` primitives. */
export function cn(...inputs) {
  return clsx(inputs);
}
