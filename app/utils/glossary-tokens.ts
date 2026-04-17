const OPEN = "\uE000";
const CLOSE = "\uE001";

export function makePlaceholder(index: number): string {
  return `${OPEN}${index}${CLOSE}`;
}

export const PLACEHOLDER_REGEX = /\uE000(\d+)\uE001/g;
