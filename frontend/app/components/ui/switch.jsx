'use client';

import React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../lib/utils';

/** shadcn-style Switch on Radix: keyboard, focus and aria handled by the primitive. */
const Switch = React.forwardRef(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root ref={ref} className={cn('feature-switch', className)} {...props}>
      <SwitchPrimitive.Thumb className="feature-switch-thumb" />
    </SwitchPrimitive.Root>
  );
});

export { Switch };
