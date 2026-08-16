import type { APIRoute } from 'astro';
import { getAllPieces, pieceHref } from '../lib/pieces';

/**
 * The one route that genuinely needs the Worker: it picks a piece at random on
 * each request and redirects there. Everything else on the site is prerendered.
 */
export const prerender = false;

export const GET: APIRoute = async ({ redirect }) => {
  const pieces = await getAllPieces();

  if (pieces.length === 0) {
    return redirect('/', 302);
  }

  const piece = pieces[Math.floor(Math.random() * pieces.length)];

  return new Response(null, {
    status: 302,
    headers: {
      Location: pieceHref(piece.collection, piece.id),
      // A wander should be a fresh wander every time.
      'Cache-Control': 'no-store',
    },
  });
};
