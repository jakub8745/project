/**
 * Sidebar management: build, listeners, and button setup.
 */

/**
 * Build the sidebar DOM elements based on configuration.
 * @param {Object} sidebarConfig - Configuration for the sidebar.
 * @param {Object} sidebarConfig.logo - Logo settings ({ text }).
 * @param {Array<Object>} sidebarConfig.items - Sidebar items array.
 */
export function buildSidebar(sidebarConfig) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
  
    const navList = sidebar.querySelector('.nav-list');
    const logoDiv = sidebar.querySelector('.logo_name');
    logoDiv.textContent = sidebarConfig.logo.text;
  
    sidebarConfig.items.forEach(item => {
      const li = document.createElement('li');
      if (item.link) {
        li.innerHTML = `
          <a href="${item.link}" target="_blank">
            <span class="links_name">
              <img src="${item.img?.src || item.icon}" />
              ${item.label}
            </span>
          </a>`;
      } else {
        li.innerHTML = `
          <a href="#" id="${item.id}" data-divid="${item.target}">
            <span class="links_name">
              <img src="${item.img?.src || item.icon}" />
              ${item.label}
            </span>
          </a>
          <div class="info_sidebar" id="${item.target}">
            <span class="info_text">${item.content}</span>
          </div>`;
      }
      navList.appendChild(li);
    });
  
    sidebar.style.display = 'block';
    sidebar.style.animation = 'fadeIn 2s forwards';
    sidebar.classList.toggle('open');
    const btn = document.querySelector('#btn');
    btn?.classList.toggle('open');
  
    setTimeout(() => {
      const helpBtn = document.querySelector('#help-icon');
      const helpDiv = document.getElementById('how_to_move');
      if (helpBtn && helpDiv) {
        helpDiv.classList.add('open');
        helpBtn.classList.add('active');
      }
    }, 500);
  }
  
  /**
   * Prevent sidebar clicks from propagating and toggle sidebar open/closed.
   */
  export function addSidebarListeners() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
  
    ['pointerdown', 'mousedown', 'touchstart'].forEach(type => {
      sidebar.addEventListener(type, e => e.stopPropagation());
    });
  
    const btn = document.querySelector('#btn');
    btn?.addEventListener('pointerdown', e => {
      e.preventDefault();
      sidebar.classList.toggle('open');
      btn.classList.toggle('open');
      btn.classList.remove('hidden');
    });
  }
  
  /**
   * Wire up item buttons to show/hide info panels and embed map if needed.
   * @param {Object} deps - Dependencies containing sceneMap and rendererMap.
   */
  export function setupSidebarButtons(deps) {
    document.querySelectorAll('[data-divid]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const divID = btn.getAttribute('data-divid');
        if (!divID) return;
  
        const targetDiv = document.getElementById(divID);
        const isOpen = targetDiv?.classList.contains('open');
  
        document.querySelectorAll('.info_sidebar').forEach(div => div.classList.remove('open'));
  
        if (targetDiv && !isOpen) {
          targetDiv.classList.add('open');
          if (divID.includes('map') && deps.sceneMap) {
            targetDiv.innerHTML = '';
            targetDiv.appendChild(deps.rendererMap.domElement);
          }
        }
      });
    });
  }
  