import type { GlossaryTerm } from "@prisma/client";
import prisma from "../db.server";
import {
  compileRules,
  findMatches,
  type CompiledRule,
} from "../utils/glossary-matcher";
import { makePlaceholder, PLACEHOLDER_REGEX } from "../utils/glossary-tokens";

export interface GlossaryQuery {
  sourceLocale?: string;
  targetLocale?: string;
  cursor?: string;
  limit?: number;
}

export interface GlossaryListResult {
  terms: GlossaryTerm[];
  hasMore: boolean;
  endCursor: string | null;
}

export async function getGlossaryTerms(
  shop: string,
  options?: GlossaryQuery,
): Promise<GlossaryListResult> {
  const limit = options?.limit ?? 25;
  const terms = await prisma.glossaryTerm.findMany({
    where: {
      shop,
      ...(options?.sourceLocale ? { sourceLocale: options.sourceLocale } : {}),
      ...(options?.targetLocale ? { targetLocale: options.targetLocale } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options?.cursor
      ? { skip: 1, cursor: { id: options.cursor } }
      : {}),
  });

  const hasMore = terms.length > limit;
  if (hasMore) terms.pop();

  return {
    terms,
    hasMore,
    endCursor: terms.length > 0 ? terms[terms.length - 1].id : null,
  };
}

export class GlossaryDuplicateError extends Error {
  readonly code = "DUPLICATE";
  constructor(message: string) {
    super(message);
    this.name = "GlossaryDuplicateError";
  }
}

export interface CreateGlossaryInput {
  sourceLocale: string;
  targetLocale: string;
  sourceTerm: string;
  targetTerm: string;
  caseSensitive?: boolean;
  neverTranslate?: boolean;
}

export async function createGlossaryTerm(
  shop: string,
  input: CreateGlossaryInput,
): Promise<GlossaryTerm> {
  try {
    return await prisma.glossaryTerm.create({
      data: {
        shop,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        sourceTerm: input.sourceTerm,
        targetTerm: input.targetTerm,
        caseSensitive: input.caseSensitive ?? false,
        neverTranslate: input.neverTranslate ?? false,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      throw new GlossaryDuplicateError(
        `A term "${input.sourceTerm}" already exists for ${input.sourceLocale} → ${input.targetLocale}.`,
      );
    }
    throw err;
  }
}

export interface UpdateGlossaryInput {
  sourceLocale?: string;
  targetLocale?: string;
  sourceTerm?: string;
  targetTerm?: string;
  caseSensitive?: boolean;
  neverTranslate?: boolean;
}

export async function updateGlossaryTerm(
  shop: string,
  id: string,
  updates: UpdateGlossaryInput,
): Promise<GlossaryTerm> {
  const existing = await prisma.glossaryTerm.findUnique({ where: { id } });
  if (!existing || existing.shop !== shop) {
    throw new Error("Glossary term not found");
  }
  return prisma.glossaryTerm.update({
    where: { id },
    data: updates,
  });
}

export async function deleteGlossaryTerm(
  shop: string,
  id: string,
): Promise<void> {
  const existing = await prisma.glossaryTerm.findUnique({ where: { id } });
  if (!existing || existing.shop !== shop) return;
  await prisma.glossaryTerm.delete({ where: { id } });
}

export async function getGlossaryTermsByLocalePair(
  shop: string,
  sourceLocale: string,
  targetLocale: string,
): Promise<GlossaryTerm[]> {
  return prisma.glossaryTerm.findMany({
    where: { shop, sourceLocale, targetLocale },
  });
}

export async function quickAddBrandProtection(
  shop: string,
  brandName: string,
  primaryLocale: string,
  targetLocales: string[],
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const targetLocale of targetLocales) {
    if (targetLocale === primaryLocale) continue;
    const existing = await prisma.glossaryTerm.findUnique({
      where: {
        shop_sourceLocale_targetLocale_sourceTerm: {
          shop,
          sourceLocale: primaryLocale,
          targetLocale,
          sourceTerm: brandName,
        },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.glossaryTerm.create({
      data: {
        shop,
        sourceLocale: primaryLocale,
        targetLocale,
        sourceTerm: brandName,
        targetTerm: brandName,
        caseSensitive: true,
        neverTranslate: true,
      },
    });
    created++;
  }
  return { created, skipped };
}

// ===== Enforcement =====

export interface PlaceholderEntry {
  index: number;
  originalText: string;
  rule: GlossaryTerm;
}

export interface ApplyGlossaryPreResult {
  masked: string;
  placeholderMap: PlaceholderEntry[];
}

export function applyGlossaryPre(
  text: string,
  rules: GlossaryTerm[],
): ApplyGlossaryPreResult {
  if (rules.length === 0 || !text) {
    return { masked: text, placeholderMap: [] };
  }
  const neverTranslate = rules.filter((r) => r.neverTranslate);
  if (neverTranslate.length === 0) {
    return { masked: text, placeholderMap: [] };
  }
  const compiled = compileRules(neverTranslate);
  const matches = findMatches(text, compiled);
  if (matches.length === 0) {
    return { masked: text, placeholderMap: [] };
  }

  const placeholderMap: PlaceholderEntry[] = [];
  let masked = "";
  let cursor = 0;
  for (const m of matches) {
    masked += text.slice(cursor, m.start);
    const index = placeholderMap.length;
    masked += makePlaceholder(index);
    placeholderMap.push({
      index,
      originalText: m.matched,
      rule: m.rule.term,
    });
    cursor = m.end;
  }
  masked += text.slice(cursor);
  return { masked, placeholderMap };
}

export interface ViolationWarning {
  sourceTerm: string;
  expected: string;
  got: string;
}

export interface ApplyGlossaryPostResult {
  restored: string;
  violations: ViolationWarning[];
}

function replaceWithRule(
  text: string,
  source: string,
  target: string,
  caseSensitive: boolean,
): string {
  const compiled = compileRules([
    {
      id: "synthetic",
      shop: "",
      sourceLocale: "",
      targetLocale: "",
      sourceTerm: source,
      targetTerm: target,
      caseSensitive,
      neverTranslate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const pattern = compiled[0].pattern;
  pattern.lastIndex = 0;
  return text.replace(pattern, target);
}

export function applyGlossaryPost(
  translated: string,
  map: PlaceholderEntry[],
  rules: GlossaryTerm[],
): ApplyGlossaryPostResult {
  let restored = translated;

  // 1. Restore never-translate placeholders.
  restored = restored.replace(PLACEHOLDER_REGEX, (_full, idxStr: string) => {
    const idx = Number(idxStr);
    const entry = map[idx];
    return entry ? entry.originalText : "";
  });

  // 2. Must-translate enforcement.
  const mustTranslate = rules.filter(
    (r) => !r.neverTranslate && r.targetTerm && r.sourceTerm,
  );
  const violations: ViolationWarning[] = [];
  for (const rule of mustTranslate) {
    const hasTarget = rule.caseSensitive
      ? restored.includes(rule.targetTerm)
      : restored.toLowerCase().includes(rule.targetTerm.toLowerCase());
    if (hasTarget) continue;

    const before = restored;
    restored = replaceWithRule(
      restored,
      rule.sourceTerm,
      rule.targetTerm,
      rule.caseSensitive,
    );
    if (restored === before) {
      violations.push({
        sourceTerm: rule.sourceTerm,
        expected: rule.targetTerm,
        got: "",
      });
    }
  }

  return { restored, violations };
}

// ===== Rule-match detection (for glossaryApplied flag) =====

export function hasMatchingRules(text: string, rules: GlossaryTerm[]): boolean {
  if (rules.length === 0 || !text) return false;
  const compiled = compileRules(rules);
  return findMatches(text, compiled).length > 0;
}

// ===== CSV =====

export interface ParsedCsvRow {
  lineNumber: number;
  sourceTerm: string;
  targetTerm: string;
  sourceLocale: string;
  targetLocale: string;
  caseSensitive: boolean;
  neverTranslate: boolean;
  error?: string;
}

const CSV_HEADERS = [
  "source_term",
  "target_term",
  "source_locale",
  "target_locale",
  "case_sensitive",
  "never_translate",
] as const;

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          buf += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        buf += ch;
      }
    } else {
      if (ch === '"' && buf.length === 0) {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(buf);
        buf = "";
      } else {
        buf += ch;
      }
    }
  }
  fields.push(buf);
  return fields;
}

function splitCsvRows(csv: string): string[] {
  const rows: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        buf += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        buf += ch;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (buf.length > 0) rows.push(buf);
      buf = "";
      if (ch === "\r" && csv[i + 1] === "\n") i++;
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) rows.push(buf);
  return rows;
}

function toBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function parseGlossaryCsv(csv: string): ParsedCsvRow[] {
  const cleaned = stripBom(csv);
  const rows = splitCsvRows(cleaned);
  if (rows.length === 0) return [];

  const header = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase());
  const headerMap: Record<string, number> = {};
  for (const key of CSV_HEADERS) {
    const idx = header.indexOf(key);
    if (idx !== -1) headerMap[key] = idx;
  }

  const results: ParsedCsvRow[] = [];
  const seenKeys = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw.trim()) continue;
    const fields = parseCsvLine(raw);
    const get = (key: (typeof CSV_HEADERS)[number]): string => {
      const idx = headerMap[key];
      return idx !== undefined ? (fields[idx] ?? "").trim() : "";
    };

    const row: ParsedCsvRow = {
      lineNumber: i + 1,
      sourceTerm: get("source_term"),
      targetTerm: get("target_term"),
      sourceLocale: get("source_locale"),
      targetLocale: get("target_locale"),
      caseSensitive: toBool(get("case_sensitive")),
      neverTranslate: toBool(get("never_translate")),
    };

    const problems: string[] = [];
    if (!row.sourceTerm) problems.push("source_term is required");
    if (!row.sourceLocale) problems.push("source_locale is required");
    if (!row.targetLocale) problems.push("target_locale is required");
    if (!row.neverTranslate && !row.targetTerm) {
      problems.push("target_term is required unless never_translate is true");
    }

    const key = `${row.sourceLocale}\u0000${row.targetLocale}\u0000${row.sourceTerm}`;
    if (seenKeys.has(key)) {
      problems.push("duplicate within CSV");
    } else {
      seenKeys.add(key);
    }

    if (problems.length > 0) row.error = problems.join("; ");
    results.push(row);
  }

  return results;
}

export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
}

export async function importGlossaryCsv(
  shop: string,
  rows: ParsedCsvRow[],
): Promise<CsvImportResult> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.error) {
      skipped++;
      continue;
    }
    const existing = await prisma.glossaryTerm.findUnique({
      where: {
        shop_sourceLocale_targetLocale_sourceTerm: {
          shop,
          sourceLocale: row.sourceLocale,
          targetLocale: row.targetLocale,
          sourceTerm: row.sourceTerm,
        },
      },
    });
    if (existing) {
      await prisma.glossaryTerm.update({
        where: { id: existing.id },
        data: {
          targetTerm: row.targetTerm,
          caseSensitive: row.caseSensitive,
          neverTranslate: row.neverTranslate,
        },
      });
      updated++;
    } else {
      await prisma.glossaryTerm.create({
        data: {
          shop,
          sourceLocale: row.sourceLocale,
          targetLocale: row.targetLocale,
          sourceTerm: row.sourceTerm,
          targetTerm: row.targetTerm,
          caseSensitive: row.caseSensitive,
          neverTranslate: row.neverTranslate,
        },
      });
      created++;
    }
  }

  return { created, updated, skipped };
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportGlossaryCsv(
  shop: string,
  filter?: { sourceLocale?: string; targetLocale?: string },
): Promise<string> {
  const terms = await prisma.glossaryTerm.findMany({
    where: {
      shop,
      ...(filter?.sourceLocale ? { sourceLocale: filter.sourceLocale } : {}),
      ...(filter?.targetLocale ? { targetLocale: filter.targetLocale } : {}),
    },
    orderBy: [{ sourceLocale: "asc" }, { sourceTerm: "asc" }],
  });

  const header = CSV_HEADERS.join(",");
  const lines = terms.map((t) =>
    [
      csvEscape(t.sourceTerm),
      csvEscape(t.targetTerm),
      csvEscape(t.sourceLocale),
      csvEscape(t.targetLocale),
      String(t.caseSensitive),
      String(t.neverTranslate),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

export const GLOSSARY_CSV_TEMPLATE = `${CSV_HEADERS.join(",")}
Nike,Nike,en,fr,true,true
shipping,livraison,en,fr,false,false
`;

// Re-export compile helper for other services (brand-voice prompt builder)
export function buildCompiledRules(terms: GlossaryTerm[]): CompiledRule[] {
  return compileRules(terms);
}
