// src/modules/main.js

import { buildGallery } from './AppBuilder.js';
import { preloadConfigAssets } from './preloadConfigAssets.js';

// your “official” default, e.g. the Puno85 exhibit
const DEFAULT_CONFIG_URL =
  'https://bafybeiacxiiqnajlgll6naaulp6ervnfte6kbp75hkhsj4gzpzz7wxze7m.ipfs.w3s.link/exhibit_puno85_config.json';

/**
 * If no override is provided, grab from the URL query string.
 */
function _getConfigUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('configUrl');
}

/**
 * Main entry point.
 * @param {string} [overrideConfigUrl] — the config URL to load; if omitted,
 *                                       will look for ?configUrl=… in the URL,
 *                                       then fall back to DEFAULT_CONFIG_URL.
 */
export async function init(overrideConfigUrl) {
  const loaderText = document.getElementById('loaderText');

  // decide which URL to use
  const CONFIG_URL =
    overrideConfigUrl ??
    _getConfigUrlFromQuery() ??
    DEFAULT_CONFIG_URL;

  console.info('Gallery config URL:', CONFIG_URL);

  try {
    const res = await fetch(CONFIG_URL);
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    const config = await res.json();

    await preloadConfigAssets(config, (p) => {
      if (loaderText) {
        loaderText.textContent = `${Math.floor(p * 100)}%`;
      }
    });

    await buildGallery(config);
  } catch (err) {
    console.error('Error loading gallery:', err);
    if (loaderText) {
      loaderText.textContent = 'Error loading gallery';
    }
  }
}

// Optional: automatically run if someone includes this script via a <script> tag
// without calling init() themselves.
// Comment this out if you never load main.js directly in HTML.
if (
  typeof window !== 'undefined' &&
  document.currentScript?.getAttribute('data-auto-init') === 'true'
) {
  // allows <script src="main.js" data-auto-init="true"></script>
  init();
}
