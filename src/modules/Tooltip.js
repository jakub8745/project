const TOOLTIP_ID = 'pointerHoverTooltip';
const DEFAULT_CLASS = 'pointer-tooltip';

function ensureTooltipElement(className) {
  let tooltip = document.getElementById(TOOLTIP_ID);
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    document.body.appendChild(tooltip);
  }

  if (className) {
    tooltip.className = className;
  }

  return tooltip;
}

function renderFormattedText(target, text) {
  target.replaceChildren();
  const parts = String(text)
    .split(/(\*[^*]+\*)/g)
    .filter((part) => part.length > 0);

  parts.forEach((part) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      const em = document.createElement('em');
      em.textContent = part.slice(1, -1);
      target.appendChild(em);
      return;
    }
    target.appendChild(document.createTextNode(part));
  });
}

export function createTooltip(options = {}) {
  const className = options.className || DEFAULT_CLASS;
  const tooltip = ensureTooltipElement(className);
  tooltip.style.display = 'none';

  let currentKey = null;

  const setText = (text, key = text) => {
    if (!tooltip) return;
    if (currentKey !== key || tooltip.dataset.rawText !== text) {
      renderFormattedText(tooltip, text);
      tooltip.dataset.rawText = text;
      currentKey = key;
    }
  };

  const show = ({ x, y, text, key }) => {
    if (!tooltip || !text) return;
    setText(text, key);
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.style.display = 'block';
  };

  const hide = () => {
    if (!tooltip) return;
    tooltip.style.display = 'none';
    delete tooltip.dataset.rawText;
    currentKey = null;
  };

  const destroy = () => {
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
    currentKey = null;
  };

  return {
    show,
    hide,
    destroy,
    get currentKey() {
      return currentKey;
    }
  };
}

export default {
  createTooltip
};
