import { defineConfig } from 'astro/config';
import { SITE_URL, BASE_PATH } from './site.config.mjs';
import rehypeImages from './src/lib/rehype-images.mjs';

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: 'ignore',
  // Фото в статтях: адреса з урахуванням BASE_PATH і підписи під фото
  markdown: { rehypePlugins: [[rehypeImages, BASE_PATH]] },
});
