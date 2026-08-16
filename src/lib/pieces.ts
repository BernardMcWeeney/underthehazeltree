import { getCollection, type CollectionEntry, type CollectionKey } from 'astro:content';

export type PieceCollection = 'poems' | 'stories' | 'journal';
export type Piece = CollectionEntry<PieceCollection>;

const LABELS: Record<PieceCollection, string> = {
  poems: 'Poem',
  stories: 'Story',
  journal: 'Journal',
};

export const kindLabel = (collection: CollectionKey | string) =>
  LABELS[collection as PieceCollection] ?? 'Piece';

export const pieceHref = (collection: CollectionKey | string, id: string) => `/${collection}/${id}/`;

const byNewest = (a: Piece, b: Piece) => b.data.date.valueOf() - a.data.date.valueOf();

/** Published entries of one collection, newest first. Drafts are kept out of builds. */
export async function getPieces(collection: PieceCollection): Promise<Piece[]> {
  const entries = await getCollection(collection, ({ data }) => import.meta.env.DEV || !data.draft);
  return entries.sort(byNewest);
}

/** Everything across all three collections, newest first. */
export async function getAllPieces(): Promise<Piece[]> {
  const groups = await Promise.all(['poems', 'stories', 'journal'].map((c) => getPieces(c as PieceCollection)));
  return groups.flat().sort(byNewest);
}

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);

export const formatDateShort = (date: Date) =>
  new Intl.DateTimeFormat('en-IE', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
