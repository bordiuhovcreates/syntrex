// Новини: список статей (новіші — першими), час читання, дата і адреса сторінки.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'news'>;

export async function getNews(): Promise<Post[]> {
  const all = await getCollection('news', (e) => !e.data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

// Час читання рахується з тексту статті: ~180 слів на хвилину (уважне читання)
export const readTime = (post: Post) => Math.max(1, Math.ceil((post.body || '').trim().split(/\s+/).length / 180));

export const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const postHref = (post: Post) => `news/${post.id}/`;
