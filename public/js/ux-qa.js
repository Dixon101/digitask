(function(){
  // Namespace
  const UX = {};

  // ----- Accessibility & Focus Styles Injection -----
  function injectGlobalStyles(){
    const css = `
      :root { --focus-ring: 2px solid #2563eb; }
      .focus-outline:focus { outline: var(--focus-ring); outline-offset: 2px; }
      *:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation: none !important; transition: none !important; }
      }
      img, svg, video { max-width: 100%; height: auto; }
      .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
      .skeleton { background: linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 37%,#f3f4f6 63%); background-size: 400% 100%; animation: shimmer 1.4s ease infinite; }
      @keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
      .empty-state { color: #6b7280; text-align: center; padding: 1.25rem; }
      .visually-hidden { position: absolute !important; height: 1px; width: 1px; overflow: hidden; clip: rect(1px, 1px, 1px, 1px); white-space: nowrap; }
    `;
    const style = document.createElement('style');
    style.setAttribute('data-uxqa', 'true');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ----- Skip Link Injection -----
  function injectSkipLink(){
    if (document.querySelector('a[data-skip-link]')) return;
    const a = document.createElement('a');
    a.href = '#main';
    a.textContent = 'Skip to content';
    a.setAttribute('data-skip-link','true');
    a.style.position = 'absolute';
    a.style.left = '0.5rem';
    a.style.top = '-40px';
    a.style.background = '#111827';
    a.style.color = '#fff';
    a.style.padding = '8px 12px';
    a.style.borderRadius = '6px';
    a.style.transition = 'top .2s ease';
    a.style.zIndex = '1000';
    a.addEventListener('focus',()=>{ a.style.top = '0.5rem'; });
    a.addEventListener('blur',()=>{ a.style.top = '-40px'; });
    document.body.prepend(a);
  }

  // ----- SEO / Meta defaults -----
  function ensureMeta(){
    const getOrCreate = (sel, createFn) => {
      let el = document.querySelector(sel);
      if (!el) { el = createFn(); document.head.appendChild(el); }
      return el;
    };

    const pageTitle = document.querySelector('meta[name="page:title"]')?.content || document.title || 'DigiTask';
    const pageDesc = document.querySelector('meta[name="description"]')?.content || 'Hire top freelancers or sell your digital services and products on DigiTask.';
    const pageUrl = window.location.origin + window.location.pathname;
    const ogImage = document.querySelector('meta[property="og:image"]')?.content || '/icons/icon-192x192.png';

    // Description
    getOrCreate('meta[name="description"]', () => {
      const m = document.createElement('meta'); m.name = 'description'; m.content = pageDesc; return m;
    }).setAttribute('content', pageDesc);

    // Theme color
    getOrCreate('meta[name="theme-color"]', () => {
      const m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#4F46E5'; return m;
    });

    // Open Graph
    const ogPairs = {
      'og:title': pageTitle,
      'og:description': pageDesc,
      'og:type': 'website',
      'og:url': pageUrl,
      'og:image': ogImage
    };
    Object.entries(ogPairs).forEach(([prop, val]) => {
      getOrCreate(`meta[property="${prop}"]`, () => { const m = document.createElement('meta'); m.setAttribute('property', prop); m.content = val; return m; }).setAttribute('content', val);
    });

    // Twitter
    const twPairs = {
      'twitter:card': 'summary_large_image',
      'twitter:title': pageTitle,
      'twitter:description': pageDesc,
      'twitter:image': ogImage
    };
    Object.entries(twPairs).forEach(([name, val]) => {
      getOrCreate(`meta[name="${name}"]`, () => { const m = document.createElement('meta'); m.name = name; m.content = val; return m; }).setAttribute('content', val);
    });
  }

  // ----- Loading & Empty State helpers -----
  UX.showLoading = function(container){
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const loader = document.createElement('div');
    loader.className = 'skeleton';
    loader.style.height = '2.5rem';
    loader.style.borderRadius = '0.5rem';
    loader.setAttribute('role','status');
    loader.setAttribute('aria-live','polite');
    loader.innerHTML = '<span class="visually-hidden">Loading…</span>';
    el.innerHTML = '';
    el.appendChild(loader);
  };
  UX.hideLoading = function(container){
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return; el.innerHTML = '';
  };
  UX.showEmptyState = function(container, text){
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = `<div class="empty-state" role="status" aria-live="polite">${text || 'Nothing to display yet.'}</div>`;
  };

  // ----- ARIA roles for known components -----
  function enhanceDropdowns(){
    document.querySelectorAll('.multi-select-dropdown').forEach(drop => {
      drop.setAttribute('role','combobox');
      drop.setAttribute('aria-haspopup','listbox');
      const header = drop.querySelector('.multi-select-dropdown-header');
      const list = drop.querySelector('.multi-select-dropdown-list');
      if (header) header.setAttribute('aria-controls', list ? list.id || 'dropdown-list-' + Math.random().toString(36).slice(2) : '');
      if (list && !list.id) list.id = 'dropdown-list-' + Math.random().toString(36).slice(2);
      if (list) list.setAttribute('role','listbox');
      drop.querySelectorAll('.multi-select-option input[type="checkbox"]').forEach(cb => {
        const label = cb.closest('label') || cb.parentElement;
        if (label) label.setAttribute('role','option');
      });
      const observer = new MutationObserver(() => {
        const opened = list && list.classList.contains('open');
        drop.setAttribute('aria-expanded', opened ? 'true' : 'false');
      });
      if (list) observer.observe(list, { attributes:true, attributeFilter:['class'] });
    });
  }

  function init(){
    injectGlobalStyles();
    injectSkipLink();
    ensureMeta();
    enhanceDropdowns();
    // ---- User display helpers (initials, display name) ----
    // Returns a single uppercase initial from a username/full name; falls back to 'U'.
    UX.getInitial = function(name){
      try {
        const n = (name || '').trim();
        if (!n) return 'U';
        return n[0].toUpperCase();
      } catch (_) { return 'U'; }
    };
    // Returns a nicely capitalized username (first letter upper, rest as-is if already mixed, or lowercased by default)
    UX.getDisplayName = function(name){
      const n = (name || '').trim();
      if (!n) return 'User';
      // If name has spaces, prefer the first token (first name)
      const token = n.split(/\s+/)[0];
      return token.charAt(0).toUpperCase() + token.slice(1);
    };
    window.UX = Object.assign(window.UX || {}, UX);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
