"use client";

import { cn } from "@/lib/utils";

interface OptionGroupProps<T extends string> {
  /** Radio group name (unique per group on the page). */
  name: string;
  legend: string;
  value: T | undefined;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

/** Single-choice pill group on native radios (keyboard arrows & screen reader semantics for free). */
export function OptionGroup<T extends string>({ name, legend, value, options, onChange }: OptionGroupProps<T>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors motion-reduce:transition-none",
              "border-zinc-200 text-zinc-600 hover:bg-zinc-100/60 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900/40",
              "has-checked:border-zinc-900 has-checked:bg-zinc-100 has-checked:font-semibold has-checked:text-black dark:has-checked:border-zinc-100 dark:has-checked:bg-zinc-900 dark:has-checked:text-white",
              "has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
