import type { GlossaryTerm } from "@prisma/client";

export interface CompiledRule {
  term: GlossaryTerm;
  pattern: RegExp;
}

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWordChar(ch: string): boolean {
  return /\w/.test(ch);
}

export function compileRules(terms: GlossaryTerm[]): CompiledRule[] {
  const sorted = [...terms].sort(
    (a, b) => b.sourceTerm.length - a.sourceTerm.length,
  );
  return sorted.map((term) => {
    const escaped = escapeRegex(term.sourceTerm);
    const startsWithWord =
      term.sourceTerm.length > 0 && isWordChar(term.sourceTerm[0]);
    const endsWithWord =
      term.sourceTerm.length > 0 &&
      isWordChar(term.sourceTerm[term.sourceTerm.length - 1]);
    const prefix = startsWithWord ? "\\b" : "";
    const suffix = endsWithWord ? "\\b" : "";
    const flags = term.caseSensitive ? "g" : "gi";
    return {
      term,
      pattern: new RegExp(`${prefix}${escaped}${suffix}`, flags),
    };
  });
}

export interface RuleMatch {
  rule: CompiledRule;
  start: number;
  end: number;
  matched: string;
}

export function findMatches(text: string, rules: CompiledRule[]): RuleMatch[] {
  const matches: RuleMatch[] = [];
  const claimed: Array<[number, number]> = [];

  const overlaps = (start: number, end: number): boolean =>
    claimed.some(([s, e]) => start < e && end > s);

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (!overlaps(start, end)) {
        matches.push({ rule, start, end, matched: m[0] });
        claimed.push([start, end]);
      }
      if (m[0].length === 0) rule.pattern.lastIndex += 1;
    }
  }

  matches.sort((a, b) => a.start - b.start);
  return matches;
}
