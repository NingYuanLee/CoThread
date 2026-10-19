export const openVersion = { current: (_id: string) => {} };

export function bindMessageMarkdownOpener(open: (id: string) => void) {
  openVersion.current = open;
}
