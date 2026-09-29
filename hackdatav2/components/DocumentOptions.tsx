"use client";
import { useWorkspace } from "@/store/workspace";
import { pool } from "@/lib/locales";
import type { DocType } from "@/types/schema";
import { Field, NumberField, SelectField } from "./ui";

export function DocumentOptions() {
  const docs = useWorkspace(s => s.docs);
  const locale = useWorkspace(s => s.locale);
  const setDocs = useWorkspace(s => s.setDocs);
  return (
    <div className="space-y-4">
      <Field label="Document type">
        <SelectField<DocType> value={docs.docType} onChange={docType => setDocs({ docType })}
          options={[{ value: "invoice", label: "Invoices" }, { value: "bank_statement", label: "Bank statements" }]} />
      </Field>
      {docs.docType === "invoice" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min line items"><NumberField min={1} max={docs.lineItemsMax} value={docs.lineItemsMin} onChange={lineItemsMin => setDocs({ lineItemsMin })} /></Field>
            <Field label="Max line items"><NumberField min={docs.lineItemsMin} max={20} value={docs.lineItemsMax} onChange={lineItemsMax => setDocs({ lineItemsMax })} /></Field>
          </div>
          <Field label={`${pool(locale).taxLabel} rate (%)`}>
            <NumberField min={0} max={40} step={0.5} value={+(docs.taxRate * 100).toFixed(1)} onChange={p => setDocs({ taxRate: p / 100 })} />
          </Field>
        </>
      ) : (
        <Field label="Statement period (days)"><NumberField min={7} max={180} value={docs.statementDays} onChange={statementDays => setDocs({ statementDays })} /></Field>
      )}
    </div>
  );
}
