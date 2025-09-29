/**
 * Material-style morphing modal (inspired by CodePen modal2).
 *
 * Usage:
 * - Add triggers with either `data-mmodal-target="#id"` or `data-modal="#id"` and class `mmodal__trigger`.
 * - Modal markup:
 *   <div id="example" class="mmodal mmodal__bg" role="dialog" aria-hidden="true">
 *     <div class="mmodal__dialog">
 *       <div class="mmodal__content">
 *         ...
 *         <a href="#" class="mmodal__close">×</a>
 *       </div>
 *     </div>
 *   </div>
 * - Initialize once: initMaterialModal({ contentDelay: 400 })
 */

type Options = {
  contentDelay?: number; // ms to wait before revealing content
};

const SELECTORS = {
  trigger: '.mmodal__trigger',
  modal: '.mmodal',
  bg: '.mmodal__bg',
  dialog: '.mmodal__dialog',
  content: '.mmodal__content',
  contentActive: 'mmodal__content--active',
  modalActive: 'mmodal--active',
  alignTop: 'mmodal--align-top',
  close: '.mmodal__close',
  triggerActive: 'mmodal__trigger--active',
  tempId: 'mmodal__temp',
} as const;

let bound = false;
let opts: Required<Options> = { contentDelay: 400 };

type TransformStyle = CSSStyleDeclaration & { webkitTransform?: string };

function setElementTransform(element: HTMLElement, value: string) {
  const style = element.style as TransformStyle;
  style.transform = value;
  style.webkitTransform = value;
}

export function initMaterialModal(options?: Options) {
  if (options) opts = { ...opts, ...options };
  if (bound) return;
  bound = true;

  // Event delegation for triggers
  document.addEventListener('click', onTriggerClick, false);
  // Close on backdrop or close buttons
  document.addEventListener('click', onCloseClick, false);
}

export function destroyMaterialModal() {
  if (!bound) return;
  document.removeEventListener('click', onTriggerClick, false);
  document.removeEventListener('click', onCloseClick, false);
  bound = false;
}

/** Programmatically open a modal by its DOM element or id. */
export function openMaterialModal(target: string | HTMLElement) {
  const modal = typeof target === 'string' ? document.getElementById(stripHash(target)) : target;
  if (!modal) return;
  const content = modal.querySelector(SELECTORS.content) as HTMLElement | null;
  if (!content) return;
  modal.classList.add(SELECTORS.modalActive);
  content.classList.add(SELECTORS.contentActive);
}

/** Programmatically close a modal by its DOM element or id. */
export function closeMaterialModal(target: string | HTMLElement) {
  const modal = typeof target === 'string' ? document.getElementById(stripHash(target)) : target;
  if (!modal) return;
  const content = modal.querySelector(SELECTORS.content) as HTMLElement | null;
  if (content) content.classList.remove(SELECTORS.contentActive);
  modal.classList.remove(SELECTORS.modalActive);
}

function stripHash(id: string) {
  return id.startsWith('#') ? id.slice(1) : id;
}

function onTriggerClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const trig = target.closest(SELECTORS.trigger) as HTMLElement | null;
  if (!trig) return;
  e.preventDefault();

  const dataAttr = trig.getAttribute('data-mmodal-target') || trig.getAttribute('data-modal');
  if (!dataAttr) return;
  const id = dataAttr.startsWith('#') ? dataAttr.slice(1) : dataAttr;
  const modal = document.getElementById(id);
  if (!modal) return;

  const content = modal.querySelector(SELECTORS.content) as HTMLElement | null;
  if (!content) return;

  const temp = ensureTempDiv(trig);
  moveTrig(trig, modal, content, temp);
}

function onCloseClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const isClose = target.closest(SELECTORS.close);
  const isBg = target.classList?.contains('mmodal__bg');
  if (!isClose && !isBg) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  const temp = document.getElementById(SELECTORS.tempId) as HTMLElement | null;
  if (temp) {
    temp.style.opacity = '1';
    temp.removeAttribute('style');
  }

  // Remove active classes from all modals and contents; reset triggers
  document.querySelectorAll(SELECTORS.modal).forEach(m => m.classList.remove(SELECTORS.modalActive));
  document.querySelectorAll(SELECTORS.content).forEach(c => c.classList.remove(SELECTORS.contentActive));
  document.querySelectorAll(SELECTORS.trigger).forEach(t => {
    const el = t as HTMLElement;
    setElementTransform(el, 'none');
    el.classList.remove(SELECTORS.triggerActive);
  });

  if (temp) {
    const remove = () => temp.remove();
    // Slight delay so the animation looks smooth
    window.setTimeout(() => window.requestAnimationFrame(remove), Math.max(0, opts.contentDelay - 50));
  }
}

function ensureTempDiv(parent: HTMLElement) {
  let div = document.getElementById(SELECTORS.tempId) as HTMLElement | null;
  if (!div) {
    div = document.createElement('div');
    div.id = SELECTORS.tempId;
    parent.appendChild(div);
  }
  return div;
}

function moveTrig(trig: HTMLElement, modal: HTMLElement, contentEl: HTMLElement, temp: HTMLElement) {
  const trigRect = trig.getBoundingClientRect();
  const contRect = contentEl.getBoundingClientRect();

  const xc = window.innerWidth / 2;
  const yc = window.innerHeight / 2;

  trig.classList.add(SELECTORS.triggerActive);

  // Scale to match modal content
  let scaleX = contRect.width / Math.max(1, trigRect.width);
  let scaleY = contRect.height / Math.max(1, trigRect.height);
  scaleX = Number(scaleX.toFixed(3));
  scaleY = Number(scaleY.toFixed(3));

  // Translate trigger to center of window or modal (if align-top)
  const transX = Math.round(xc - trigRect.left - trigRect.width / 2);
  let transY = Math.round(yc - trigRect.top - trigRect.height / 2);
  if (modal.classList.contains(SELECTORS.alignTop)) {
    transY = Math.round(contRect.height / 2 + contRect.top - trigRect.top - trigRect.height / 2);
  }

  setElementTransform(trig, `translate(${transX}px, ${transY}px)`);
  setElementTransform(temp, `scale(${scaleX}, ${scaleY})`);

  window.setTimeout(() => {
    window.requestAnimationFrame(() => openModal(modal, contentEl, temp));
  }, opts.contentDelay);
}

function openModal(modal: HTMLElement, contentEl: HTMLElement, temp: HTMLElement) {
  if (!modal.classList.contains(SELECTORS.modalActive)) {
    modal.classList.add(SELECTORS.modalActive);
    contentEl.classList.add(SELECTORS.contentActive);
    const hide = () => {
      temp.style.opacity = '0';
      contentEl.removeEventListener('transitionend', hide, false);
    };
    contentEl.addEventListener('transitionend', hide, false);
  }
}

export default {
  init: initMaterialModal,
  destroy: destroyMaterialModal,
  open: openMaterialModal,
  close: closeMaterialModal,
};
