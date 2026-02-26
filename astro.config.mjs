// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nichtagentur.github.io',
  base: '/glp1-recipes',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()]
  }
});
