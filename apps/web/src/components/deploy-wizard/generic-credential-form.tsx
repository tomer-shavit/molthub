"use client";

import { Input } from "@/components/ui/input";
import type { CredentialRequirement } from "@/lib/api";

interface GenericCredentialFormProps {
  credentials: CredentialRequirement[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function GenericCredentialForm({
  credentials,
  values,
  onChange,
}: GenericCredentialFormProps) {
  const handleChange = (key: string, value: string) => {
    onChange({ ...values, [key]: value });
  };

  if (credentials.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {credentials.map((cred) => (
        <div key={cred.key} className="space-y-2">
          <label
            htmlFor={`cred-${cred.key}`}
            className="text-sm font-medium flex items-center gap-1"
          >
            {cred.displayName}
            {cred.required && (
              <span className="text-destructive" aria-label="required">
                *
              </span>
            )}
          </label>
          <Input
            id={`cred-${cred.key}`}
            type={cred.sensitive ? "password" : "text"}
            placeholder={cred.description}
            value={values[cred.key] ?? ""}
            onChange={(e) => handleChange(cred.key, e.target.value)}
            pattern={cred.pattern}
            required={cred.required}
            autoComplete={cred.sensitive ? "off" : undefined}
          />
          {cred.description && (
            <p className="text-xs text-muted-foreground">{cred.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
