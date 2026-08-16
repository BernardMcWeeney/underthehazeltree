import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Poems, stories and journal entries share a shape — only the tone and the
 * typography differ — so they share a schema too.
 */
const piece = (base: string, extra = {}) =>
  defineCollection({
    loader: glob({ pattern: '**/*.md', base }),
    schema: z.object({
      title: z.string(),
      date: z.coerce.date(),
      /** Shown on cards and in listings; also used as the meta description. */
      excerpt: z.string(),
      /** Basename of an illustration in `public/img`, e.g. `wood-path`. */
      art: z.string(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      ...extra,
    }),
  });

export const collections = {
  poems: piece('./src/content/poems'),
  stories: piece('./src/content/stories'),
  journal: piece('./src/content/journal'),
};
