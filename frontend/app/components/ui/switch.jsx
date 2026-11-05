'use client';

import React, { useState } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { DUR, EASE_IN_OUT, KNOB_STRETCH } from '../../lib/motion';

const KNOB_TRAVEL = 18;
const knob = {
  // The knob slides with ease-in-out and stretches 12% mid-way (motion-blur feel).
  on: { x: KNOB_TRAVEL, scaleX: [1, KNOB_STRETCH, 1] },
  off: { x: 0, scaleX: [1, KNOB_STRETCH, 1] },
};
const knobTransition = {
  x: { duration: DUR.move * 0.8, ease: EASE_IN_OUT },
  scaleX: { duration: DUR.move * 0.8, ease: EASE_IN_OUT, times: [0, 0.45, 1] },
};

/** shadcn-style Switch on Radix: keyboard, focus and aria handled by the primitive. */
const Switch = React.forwardRef(function Switch({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) {
  const [inner, setInner] = useState(!!defaultChecked);
  const on = checked ?? inner;
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn('feature-switch', className)}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={(v) => { setInner(v); onCheckedChange?.(v); }}
      {...props}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          className="feature-switch-thumb"
          variants={knob}
          initial={false}
          animate={on ? 'on' : 'off'}
          transition={knobTransition}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
});

export { Switch };
