// Фото в статтях (Markdown):
// 1) шлях /images/... отримує адресу сайту (BASE_PATH), щоб працювало і на github.io/назва-репозиторію;
// 2) фото з підписом — ![опис](/images/x.webp "Підпис") — стає <figure> з <figcaption>;
// 3) усі фото вантажаться ліниво.
export default function rehypeImages(base = '/') {
  const prefix = base.replace(/\/$/, '');
  const fix = (src) => (src && src.startsWith('/') && !src.startsWith(prefix + '/') ? prefix + src : src);

  const walk = (node) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      // внутрішні посилання (/privacy-policy/) теж отримують адресу сайту
      if (child.type === 'element' && child.tagName === 'a' && typeof child.properties.href === 'string' && !child.properties.href.startsWith('//')) {
        child.properties.href = fix(child.properties.href);
      }
      if (child.type === 'element' && child.tagName === 'img') {
        child.properties.src = fix(child.properties.src);
        child.properties.loading = 'lazy';
      }
      // абзац, у якому лише одне фото з підписом → figure
      if (child.type === 'element' && child.tagName === 'p') {
        const kids = child.children.filter((k) => !(k.type === 'text' && !k.value.trim()));
        const img = kids.length === 1 && kids[0].type === 'element' && kids[0].tagName === 'img' ? kids[0] : null;
        if (img) {
          img.properties.src = fix(img.properties.src);
          img.properties.loading = 'lazy';
          const caption = img.properties.title;
          delete img.properties.title;
          return {
            type: 'element', tagName: 'figure', properties: {},
            children: caption
              ? [img, { type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: String(caption) }] }]
              : [img],
          };
        }
      }
      walk(child);
      return child;
    });
  };

  return (tree) => walk(tree);
}
