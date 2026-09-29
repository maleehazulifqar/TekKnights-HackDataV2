"use client";
import { Shuffle } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { CURRENCIES, LOCALES } from "@/lib/locales";
import { ColumnEditor } from "./ColumnEditor";
import { DocumentOptions } from "./DocumentOptions";
import { ExportBar } from "./ExportBar";
import { RelationshipEditor } from "./RelationshipEditor";
import { Field, NumberField, Section, SelectField, Toggle, control } from "./ui";

const opts = (xs: string[]) => xs.map(x => ({ value: x, label: x.replace("_", "-") }));

export function ConfigPanel() {
  const s = useWorkspace();
  const documents = s.mode === "documents";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line bg-gradient-to-r from-tealsoft/60 to-transparent px-5 py-4">
        <h2 className="font-display text-lg font-semibold text-ink">Configuration</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Generation">
          <Field label={documents ? "Document count" : s.mode === "relational" ? "Root table rows" : "Row count"}>
            <NumberField min={1} max={documents ? 500 : 100000} value={documents ? s.docs.count : s.rowCount} onChange={s.setCount} />
          </Field>
          <Field label="Random seed">
            <div className="flex gap-2">
              <NumberField value={s.seed} onChange={s.setSeed} />
              <button type="button" aria-label="Pick a new random seed" onClick={s.reseed}
                className={`${control} btn group grid w-10 shrink-0 place-items-center px-0 hover:bg-tealsoft`}><Shuffle className="h-4 w-4 text-teal transition-transform duration-500 group-active:rotate-[360deg] group-hover:scale-110" /></button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Locale"><SelectField value={s.locale} options={opts(LOCALES)} onChange={s.setLocale} /></Field>
            <Field label="Currency"><SelectField value={s.currency} options={opts(CURRENCIES)} onChange={s.setCurrency} /></Field>
          </div>
        </Section>

        <Section title="Privacy rules" hint="Applied to every matching column. Keys are never altered, so relations stay intact.">
          <Toggle label="Masking" description="Keeps the shape of names, emails and phones, hides the rest." checked={s.privacy.mask} onChange={mask => s.setPrivacy({ mask })} />
          <Toggle label="Hashing" description="Replaces personal fields with one-way hashes. Overrides masking." checked={s.privacy.hash} onChange={hash => s.setPrivacy({ hash })} />
          <Toggle label="Differential noise" description="Adds random noise to numeric columns." checked={s.privacy.noise} onChange={noise => s.setPrivacy({ noise })} />
          {s.privacy.noise && (
            <Field label={`Noise level: ${s.privacy.noiseLevel}%`}>
              <input type="range" min={1} max={50} value={s.privacy.noiseLevel} className="w-full accent-teal"
                onChange={e => s.setPrivacy({ noiseLevel: Number(e.target.value) })} />
            </Field>
          )}
        </Section>

        {s.mode === "tabular" && <Section title="Columns" hint="Shape each column's type, distribution and data quality."><ColumnEditor /></Section>}
        {s.mode === "relational" && <Section title="Relationships" hint="Set how many child rows each parent gets."><RelationshipEditor /></Section>}
        {documents && <Section title="Document options"><DocumentOptions /></Section>}
      </div>
      <ExportBar />
    </div>
  );
}
