"use client";
import { useEffect, useState, type ReactNode } from "react";

export const control =
  "h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink transition-all duration-200 placeholder:text-slate/60 hover:border-teal/50 focus:-translate-y-px focus:border-teal focus:outline-none focus:ring-4 focus:ring-teal/15 disabled:bg-sand disabled:text-slate";

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="animate-fade-up border-b border-line px-5 py-5">
      <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink"><span className="h-4 w-1 rounded-full bg-gradient-to-b from-teal to-mint" aria-hidden />{title}</h3>
      {hint && <p className="mt-1 text-[13px] leading-snug text-slate">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export function NumberField({ value, onChange, min, max, step = 1, disabled }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number" className={control} value={draft} min={min} max={max} step={step} disabled={disabled}
      onChange={e => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

export function SelectField<T extends string>({ value, onChange, options, disabled }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean;
}) {
  return (
    <select className={control} value={value} disabled={disabled} onChange={e => onChange(e.target.value as T)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-[13px] leading-snug text-slate">{description}</div>
      </div>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`btn relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${checked ? "bg-gradient-to-r from-teal to-mint shadow-md shadow-mint/40" : "bg-line hover:bg-slate/30"}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

export function ListField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const parse = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
  const [draft, setDraft] = useState(value.join(", "));
  useEffect(() => { if (parse(draft).join("|") !== value.join("|")) setDraft(value.join(", ")); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className={control} value={draft} placeholder="value one, value two"
      onChange={e => { setDraft(e.target.value); onChange(parse(e.target.value)); }}
    />
  );
}
