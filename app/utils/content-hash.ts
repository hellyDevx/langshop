import { createHash } from "node:crypto";
import type { TranslatableContent } from "../types/shopify";

export function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashTranslatableField(
  field: Pick<TranslatableContent, "key" | "value">,
): string {
  return hashContent(`${field.key}\u0000${field.value}`);
}
