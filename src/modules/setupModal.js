/**
 * Modal management: refactored to use material modal (mmodal).
 */
import { initMaterialModal, openMaterialModal } from './materialModal.ts';

/**
 * Initialize modal functionality and return a showModal callback.
 * @param {Object} imagesMap - Mapping from interactive names to metadata ({ title, description, author, img }).
 * @returns {Function} showModal(userData)
 */
export function setupModal(imagesMap) {

  // Initialize material modal listeners once
  initMaterialModal();

  const sidebar = document.querySelector('.sidebar');
  const btn = document.getElementById('btn');

  // Ensure mmodal structure exists
  let mmodal = document.getElementById('artModal');
  if (!mmodal) {
    mmodal = document.createElement('div');
    mmodal.id = 'artModal';
    mmodal.className = 'mmodal mmodal__bg';
    mmodal.setAttribute('role', 'dialog');
    mmodal.setAttribute('aria-hidden', 'true');
    mmodal.innerHTML = `
      <div class="mmodal__dialog">
        <div class="mmodal__content">
          <a href="#" class="mmodal__close" aria-label="Close">×</a>
          <div class="mmodal__body">
            <div class="mmodal__image-wrap"><img id="mmodalImage" alt="modal image" /></div>
            <div id="mmodalDesc" class="mmodal__desc"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(mmodal);
  }
  const modalImg = document.getElementById('mmodalImage');
  const modalDesc = document.getElementById('mmodalDesc');

  const ipfsGateways = [
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://dweb.link/ipfs/"
  ];

  function ipfsToHttpMulti(ipfsUrl, gatewayIndex = 0) {
    const cid = ipfsUrl.replace("ipfs://", "");
    return ipfsGateways[gatewayIndex] + cid;
  }

  function loadImageWithFallback(url) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const img = new Image();

      const tryLoad = () => {
        const src = url.startsWith("ipfs://")
          ? ipfsToHttpMulti(url, attempts)
          : url;

        img.src = src;

        img.onload = () => resolve(img);

        img.onerror = () => {
          attempts++;
          if (url.startsWith("ipfs://") && attempts < ipfsGateways.length) {
            setTimeout(tryLoad, 100);
          } else {
            reject(new Error(`Failed to load image from all gateways: ${url}`));
          }
        };
      };

      tryLoad();
    });
  }

  // Try primary (could be Oracle HTTP) then fall back to IPFS gateways
  function loadAnyWithFallback(primaryUrl, ipfsUrl) {
    if (!primaryUrl && !ipfsUrl) {
      return Promise.reject(new Error('No URL provided'));
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      let state = 'primary';
      let attempts = 0;
      const gateways = [
        "https://ipfs.io/ipfs/",
        "https://cloudflare-ipfs.com/ipfs/",
        "https://gateway.pinata.cloud/ipfs/",
        "https://dweb.link/ipfs/"
      ];
      const cid = ipfsUrl?.startsWith('ipfs://') ? ipfsUrl.replace('ipfs://', '') : null;

      const tryIpfs = () => {
        if (!cid) return reject(new Error('Primary failed and no IPFS fallback'));
        if (attempts >= gateways.length) return reject(new Error('All IPFS gateways failed'));
        const src = gateways[attempts] + cid;
        img.onload = () => resolve(img);
        img.onerror = () => { attempts++; tryIpfs(); };
        img.src = src;
      };

      const tryPrimary = () => {
        if (!primaryUrl) return tryIpfs();
        img.onload = () => resolve(img);
        img.onerror = () => { state = 'ipfs'; tryIpfs(); };
        img.src = primaryUrl;
      };

      tryPrimary();
    });
  }

  function hideModal() {
    if (modalImg) modalImg.src = '';
    if (modalDesc) modalDesc.textContent = '';
  }



  return function showModal(userData) {
    if (!userData?.name) return;

    if (sidebar?.classList.contains('open')) {
      sidebar.classList.remove('open');
      btn?.classList.remove('open');
    }

    const meta = imagesMap[userData.name];
    if (!meta) return;

    // Fill description underneath image
    modalDesc.innerHTML = `
    <h3>${meta.title}</h3>
    <p>${meta.description || ''}</p>
    ${meta.author ? `<p><em>By ${meta.author}</em></p>` : ''}
  `;


    // ✅ Always ensure an image is attempted, even if not preloaded
    const useImage = (img) => {

      console.log('🎨 Using image:', img.src);
      meta.img = img; // cache
      modalImg.src = img.src;
      modalImg.onload = () => modalImg.classList.remove('hidden');
      modalImg.onerror = () => {
        modalDesc.textContent = '⚠️ Could not display image.';
      };
    };

    if (meta.img) {

      console.log('🎨 Using cached image:', meta.img.src);
      // Already preloaded → show immediately
      modalImg.src = meta.img.src;
      modalImg.onload = () => {};
      modalImg.onerror = () => {
        modalDesc.insertAdjacentHTML(
          "beforeend",
          "<p style='color:red'>⚠️ Failed to load image.</p>"
        );
      };
    } else {
      // Not preloaded yet → show a loading message
      const loadingMsg = document.createElement("p");
      loadingMsg.classList.add("animate-flash");
      loadingMsg.innerHTML = "<em>Loading image…</em>";
      loadingMsg.classList.add("loading-msg");
      modalDesc.appendChild(loadingMsg);

      // Try Oracle first, then fallback to IPFS if provided
      loadAnyWithFallback(meta.imagePath, meta.ipfsImagePath)
        .then(img => {
          meta.img = img; // cache it for next time
          modalImg.src = img.src;
          modalImg.onload = () => {
            loadingMsg.remove(); // ✅ remove loading message once ready
          };
        })
        .catch(err => {
          console.warn("⚠️ Could not load image in modal:", err);
          loadingMsg.textContent = "⚠️ Could not load image.";
          loadingMsg.style.color = "red";
        });
    }

    // Open the material modal programmatically
    openMaterialModal('artModal');
  };

}

/**
 * Make a popup element draggable via pointer events.
 * @param {HTMLElement} popup - The element to drag.
 * @param {HTMLElement} [handle=popup] - The drag handle element.
 */
export function makeModalDraggable(popup, handle = popup) {
  handle.style.cursor = 'move';
  handle.style.userSelect = 'none';

  let startX, startY;
  let baseX = 0, baseY = 0;
  let dragging = false;

  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();

    startX = e.clientX;
    startY = e.clientY;

    const cs = getComputedStyle(popup);
    const matrix = new DOMMatrixReadOnly(
      cs.transform === 'none' ? 'matrix(1,0,0,1,0,0)' : cs.transform
    );
    baseX = matrix.m41;
    baseY = matrix.m42;

    dragging = true;
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
  });

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    popup.style.transform = `translate(${baseX + dx}px, ${baseY + dy}px)`;
  }

  function onPointerUp() {
    dragging = false;
    document.removeEventListener('pointermove', onPointerMove);
  }
}
