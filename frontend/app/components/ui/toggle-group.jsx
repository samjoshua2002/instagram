'use client';

import React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '../../lib/utils';

/** shadcn-style ToggleGroup on Radix: arrow-key roving focus between items. */
const ToggleGroup = React.forwardRef(function ToggleGroup({ className, ...props }, ref) {
  return <ToggleGroupPrimitive.Root ref={ref} className={cn('sheet-segment', className)} {...props} />;
});

const ToggleGroupItem = React.forwardRef(function ToggleGroupItem({ className, ...props }, ref) {
  return <ToggleGroupPrimitive.Item ref={ref} className={className} {...props} />;
});

export { ToggleGroup, ToggleGroupItem };
