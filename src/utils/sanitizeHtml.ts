const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'br',
  'div',
  'em',
  'i',
  'img',
  'p',
  'small',
  'span',
  'strong',
  'u'
]);

const ALLOWED_ATTRS = new Set(['alt', 'href', 'rel', 'src', 'target', 'title']);

function isSafeHref(raw: string): boolean {
  try {
    const value = raw.trim();
    if (!value) return false;
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function isSafeSrc(raw: string): boolean {
  try {
    const value = raw.trim();
    if (!value) return false;
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function cleanNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) return;

  if (node.nodeType !== Node.ELEMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    const parent = element.parentNode;
    if (!parent) return;
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
    return;
  }

  for (const { name, value } of Array.from(element.attributes)) {
    const attr = name.toLowerCase();
    const isEventAttr = attr.startsWith('on');
    if (!ALLOWED_ATTRS.has(attr) || isEventAttr) {
      element.removeAttribute(name);
      continue;
    }

    if (attr === 'href' && !isSafeHref(value)) {
      element.removeAttribute(name);
      continue;
    }

    if (attr === 'src' && !isSafeSrc(value)) {
      element.removeAttribute(name);
      continue;
    }
  }

  if (tag === 'a' && element.getAttribute('href')) {
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  }

  for (const child of Array.from(element.childNodes)) {
    cleanNode(child);
  }
}

export function sanitizeSidebarHtml(rawHtml: string | undefined): string {
  if (!rawHtml) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return '';
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return '';

  for (const child of Array.from(root.childNodes)) {
    cleanNode(child);
  }

  return root.innerHTML;
}
