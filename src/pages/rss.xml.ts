import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllPieces, kindLabel, pieceHref } from '../lib/pieces';

export async function GET(context: APIContext) {
  const pieces = await getAllPieces();

  return rss({
    title: 'Under the Hazel Tree',
    description: 'Poems, stories and quiet reflections.',
    site: context.site ?? 'https://underthehazeltree.com',
    items: pieces.map((piece) => ({
      title: piece.data.title,
      description: piece.data.excerpt,
      pubDate: piece.data.date,
      link: pieceHref(piece.collection, piece.id),
      categories: [kindLabel(piece.collection), ...piece.data.tags],
    })),
    customData: '<language>en-ie</language>',
  });
}
