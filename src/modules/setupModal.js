/**
 * Modal management: show, hide, and draggable behavior.
 */

/**
 * Initialize modal functionality and return a showModal callback.
 * @param {Object} imagesMap - Mapping from interactive names to metadata ({ title, description, author, img }).
 * @returns {Function} showModal(userData)
 */
export function setupModal(imagesMap) {

  const modalOverlay = document.getElementById('modalOverlay');
  //const modalLoader = document.getElementById('modalLoader');
  const modalImg = document.getElementById('modalImage');
  const modalDesc = modalOverlay.querySelector('.modal-description');
  const closeBtn = document.getElementById('closeModal');
  const sidebar = document.querySelector('.sidebar');
  const btn = document.getElementById('btn');
  const modal = modalOverlay.querySelector('.modal');

  let draggableInitialized = false;



  //modalLoader.classList.add('hidden');
  modalImg.classList.add('hidden');

  modalOverlay.addEventListener('pointerdown', (e) => {
    if (!modal.contains(e.target)) hideModal();
  });
  closeBtn.addEventListener('click', hideModal);
  modal.style.transform = '';

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


  function hideModal() {
    modalOverlay.classList.remove('show');

    modalOverlay.addEventListener('transitionend', function handleTransitionEnd(e) {
      if (e.target !== modalOverlay) return; // Only react to overlay's transition end
      if (!modalOverlay.classList.contains('show')) {
        modalOverlay.classList.add('hidden');

        // 🔥 Only clear the content AFTER fade-out completes
        modalImg.src = '';
        modalDesc.textContent = '';
        modalImg.classList.add('hidden');
      }
      modalOverlay.removeEventListener('transitionend', handleTransitionEnd);
    });
  }



  return function showModal(userData) {
    if (!userData?.name) return;

    if (sidebar?.classList.contains('open')) {
      sidebar.classList.remove('open');
      btn?.classList.remove('open');
    }

    modal.style.transform = 'translate(-50%, -50%)';

    const meta = imagesMap[userData.name];
    if (!meta) return;

    modalOverlay.classList.remove('hidden');
    void modalOverlay.offsetWidth; // force reflow
    modalOverlay.classList.add('show');

    modalDesc.innerHTML = `
    <h3>${meta.title}</h3>
    <p>${meta.description || ''}</p>
    ${meta.author ? `<p><em>By ${meta.author}</em></p>` : ''}
  `;

    modalImg.classList.add('hidden');

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
      // Already preloaded → show immediately
      modalImg.src = meta.img.src;
      modalImg.onload = () => modalImg.classList.remove('hidden');
      modalImg.onerror = () => {
        modalDesc.insertAdjacentHTML(
          "beforeend",
          "<p style='color:red'>⚠️ Failed to load image.</p>"
        );
      };
    } else {
      // Not preloaded yet → show a loading message
      const loadingMsg = document.createElement("p");
      loadingMsg.innerHTML = "<em>Loading image…</em>";
      loadingMsg.classList.add("loading-msg");
      modalDesc.appendChild(loadingMsg);

      // Try to fetch the image immediately (so user doesn’t wait indefinitely)
      loadImageWithFallback(meta.imagePath)
        .then(img => {
          meta.img = img; // cache it for next time
          modalImg.src = img.src;
          modalImg.onload = () => {
            modalImg.classList.remove("hidden");
            loadingMsg.remove(); // ✅ remove loading message once ready
          };
        })
        .catch(err => {
          console.warn("⚠️ Could not load image in modal:", err);
          loadingMsg.textContent = "⚠️ Could not load image.";
          loadingMsg.style.color = "red";
        });
    }



    if (!draggableInitialized) {
      modal.style.transform = '';
      makeModalDraggable(modal);
      draggableInitialized = true;
    }
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
