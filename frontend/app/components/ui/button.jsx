'use client';

import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * shadcn Button. Every icon inside gets the shared --btn-icon-size,
 * so text buttons and icon-only buttons line up on every screen size.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-btn-icon [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-foreground text-surface border border-foreground hover:opacity-90',
        outline: 'bg-surface text-foreground border border-border hover:bg-[var(--color-surface-hover)]',
        ghost: 'bg-transparent text-foreground border-0 hover:bg-[var(--color-surface-hover)]',
        destructive: 'bg-red-500 text-white border border-red-500 hover:bg-red-600',
      },
      size: {
        default: 'h-9 px-4 text-[0.82rem]',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6 text-sm',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const Button = React.forwardRef(function Button({ className, variant, size, asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export { Button, buttonVariants };
