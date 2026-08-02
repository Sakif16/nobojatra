"use client";

import { useId } from "react";
import { fieldClassName } from "./field-styles";

type Props = {
  id: string;
  label: string;
  type?: "text" | "email";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
};

export default function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  error,
}: Props) {
  const errorId = useId();

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={fieldClassName(Boolean(error))}
      />
      {error ? (
        <p id={errorId} className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
