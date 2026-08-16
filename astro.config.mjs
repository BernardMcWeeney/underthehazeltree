// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

const site = 'https://underthehazeltree.com';

export default defineConfig({
  site,
  output: 'static',
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [sitemap({ filter: (page) => !page.includes('/wander') })],
  build: { format: 'directory' },
  // Nothing on the site stores per-visitor state, so skip the KV session store
  // the adapter would otherwise provision.
  session: false,
});
