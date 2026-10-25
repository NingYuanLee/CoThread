export type CitationKind = string;

export type CitationItem = {
  id: string;
  kind?: CitationKind | null;
  label: string;
  title?: string | null;
  target?: string | null;
  pageId?: string | null;
};

export function inferCitationKind(label?: string | null, pageId?: string | null): string;
export function citationTitle(label?: string | null): string;
export function citeGroupId(kind?: string | null): string;
export function groupCitations<T extends { kind?: string | null }>(
  items?: T[] | null,
): { id: string; label: string; items: T[] }[];
export function isPublicWebUrl(value?: string | null): boolean;
export function webCitationsInBody(body?: string | null): CitationItem[];
export function annotateWebCitations(body?: string | null, items?: CitationItem[] | null): string;
export function webMarkNumber(items: CitationItem[] | null | undefined, item: CitationItem): number;
