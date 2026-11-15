// Колекції контенту. Новини — Markdown-файли в src/content/news/ (редагуються в адмінці).
// Назва файлу = адреса статті: freight-outlook.md → /news/freight-outlook/
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    description: z.string(), // короткий опис: картка новини і пошук Google
    category: z.string(), // тема: за нею працює фільтр на сторінці новин
    date: z.coerce.date(),
    image: z.string(), // фото для картки 810×580
    cover: z.string().optional(), // велике фото статті 1840×760
    draft: z.boolean().optional(), // чернетка: не показується на сайті
  }),
});

// Юридичні сторінки: Privacy Policy, Terms of Use (src/content/legal/)
const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date(),
  }),
});

export const collections = { news, legal };
