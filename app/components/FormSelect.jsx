import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@policyengine/ui-kit/primitives";

export default function FormSelect({ id, label, value, onValueChange, options }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-label={label} className="sf-select-trigger min-w-0 text-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="sf-select-content">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
