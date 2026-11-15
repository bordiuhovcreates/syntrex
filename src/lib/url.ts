// Додає до шляху адресу сайту (base), щоб посилання і картинки працювали
// і на github.io/назва-репозиторію, і на своєму домені.
// Використання: url('images/photo.jpg'), url('/thanks/'), url('#contacts')
// Головна сторінка? (для посилань меню на блоки)
export function isHome(pathname: string): boolean {
  return pathname.replace(/\/$/, '') === url('/').replace(/\/$/, '');
}

// Посилання меню: на головній — '#block-3', на інших сторінках — '/#block-3' (з переходом на головну)
export function navHref(href: string, pathname: string): string {
  if (href.startsWith('#') && !isHome(pathname)) return url('/') + href;
  return url(href);
}

export function url(path = ''): string {
  if (!path) return '';
  if (/^(https?:|mailto:|tel:|#|data:)/.test(path)) return path;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
