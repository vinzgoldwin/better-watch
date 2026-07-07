import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils.js';

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn('app-select-group', className)} {...props} />;
}

function SelectValue({ className, ...props }) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn('app-select-value', className)} {...props} />;
}

function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger data-slot="select-trigger" className={cn('app-select-trigger', className)} {...props}>
      {children}
      <SelectPrimitive.Icon className="app-select-trigger-icon">
        <ChevronDown aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 8,
  align = 'start',
  alignItemWithTrigger = false,
  ...props
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        className="app-select-positioner"
      >
        <SelectPrimitive.Popup data-slot="select-content" className={cn('app-select-content', className)} {...props}>
          <SelectScrollUpButton />
          <SelectPrimitive.List className="app-select-list">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item data-slot="select-item" className={cn('app-select-item', className)} {...props}>
      <SelectPrimitive.ItemText className="app-select-item-text">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="app-select-item-indicator">
        <Check aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectScrollUpButton({ className, ...props }) {
  return (
    <SelectPrimitive.ScrollUpArrow data-slot="select-scroll-up-button" className={cn('app-select-scroll', className)} {...props}>
      <ChevronUp aria-hidden="true" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({ className, ...props }) {
  return (
    <SelectPrimitive.ScrollDownArrow data-slot="select-scroll-down-button" className={cn('app-select-scroll', className)} {...props}>
      <ChevronDown aria-hidden="true" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
};
