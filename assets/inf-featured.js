
(function () {
  'use strict';

  const PER_BATCH = 20;
  const API_LIMIT = 250;

  let featured  = [];
  let normal    = [];
  let seenIds   = new Set();
  let batchIdx  = 0;
  let loading   = false;
  let done      = false;

  let overrideMode = false;
  let overridePage = 2;

  let grid, sentinel, loader, endMsg, cfg;

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    grid     = document.getElementById('inf-grid');
    sentinel = document.getElementById('inf-sentinel');
    loader   = document.getElementById('inf-loader');
    endMsg   = document.getElementById('inf-end');

    const cfgEl = document.getElementById('inf-config');
    if (!cfgEl || !grid) return;

    try {
      cfg = JSON.parse(cfgEl.textContent);
    } catch (e) {
      console.error('[inf] Could not parse config:', e);
      return;
    }

    overrideMode = cfg.overrideMode;

    // Make sentinel visible and in flow immediately
    if (sentinel) {
      sentinel.style.display  = 'block';
      sentinel.style.height   = '10px';
      sentinel.style.width    = '100%';
      sentinel.style.clear    = 'both';
    }

    attachToolbar();

    if (overrideMode) {
      setupObserver();
    } else {
      grid.innerHTML = '';
      setLoader(true);

      try {
        await fetchAll();
      } catch (e) {
        console.error('[inf] fetchAll error:', e);
        setLoader(false);
        return;
      }

      setLoader(false);
      renderBatch();      
      setupObserver();    
    }
  }

  async function fetchAll() {
    let page = 1;
    while (true) {
      const url = '/collections/' + cfg.handle + '/products.json?limit=' + API_LIMIT + '&page=' + page;
      let data;
      try {
        data = await getJson(url);
      } catch (e) {
        console.error('[inf] API error page', page, e);
        break;
      }

      const products = data.products || [];
      if (products.length === 0) break;

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        if (hasTag(p, 'featured')) {
          featured.push(p);
        } else {
          normal.push(p);
        }
      }

      console.log('[inf] fetched page', page, '— featured:', featured.length, 'normal:', normal.length);

      if (products.length < API_LIMIT) break;
      page++;
    }

    console.log('[inf] fetch complete — total featured:', featured.length, 'normal:', normal.length);
  }

  function renderBatch() {
    if (loading || done) return;
    loading = true;

    const master = featured.concat(normal);
    const start  = batchIdx * PER_BATCH;
    const slice  = master.slice(start, start + PER_BATCH);

    console.log('[inf] renderBatch', batchIdx, '— rendering', slice.length, 'products (start:', start, ')');

    if (slice.length === 0) {
      done = true;
      showEnd();
      loading = false;
      return;
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < slice.length; i++) {
      frag.appendChild(makeCard(slice[i]));
    }
    grid.appendChild(frag);
    batchIdx++;

    if (start + PER_BATCH >= master.length) {
      done = true;
      showEnd();
    }

    loading = false;
  }

  // ── Override mode: paginated fetch ───────────────────────────────
  async function fetchOverridePage() {
    if (loading || done) return;
    loading = true;
    setLoader(true);

    const params = new URLSearchParams(window.location.search);
    params.set('page', overridePage);
    params.set('limit', PER_BATCH);

    try {
      const data     = await getJson('/collections/' + cfg.handle + '/products.json?' + params.toString());
      const products = data.products || [];
      const frag     = document.createDocumentFragment();

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          frag.appendChild(makeCard(p));
        }
      }
      grid.appendChild(frag);
      overridePage++;

      if (products.length < PER_BATCH) {
        done = true;
        showEnd();
      }
    } catch (e) {
      console.error('[inf] override fetch error:', e);
    }

    setLoader(false);
    loading = false;
  }

  // ── IntersectionObserver ──────────────────────────────────────────
  function setupObserver() {
    if (!sentinel) return;

    console.log('[inf] observer set up on sentinel');

    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        console.log('[inf] sentinel intersecting:', entry.isIntersecting, 'loading:', loading, 'done:', done);
        if (entry.isIntersecting && !loading && !done) {
          if (overrideMode) {
            fetchOverridePage();
          } else {
            renderBatch();
          }
        }
      });
    }, { root: null, rootMargin: '300px', threshold: 0 });

    observer.observe(sentinel);
  }

  // ── Toolbar ───────────────────────────────────────────────────────
  function attachToolbar() {
    const sortEl = document.querySelector('[data-inf-sort]');
    if (sortEl) {
      sortEl.addEventListener('change', function() {
        const url = new URL(window.location.href);
        url.searchParams.set('sort_by', sortEl.value);
        url.searchParams.delete('page');
        window.location.href = url.toString();
      });
    }

    document.querySelectorAll('[data-inf-filter]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        const url = new URL(window.location.href);
        document.querySelectorAll('[data-inf-filter]').forEach(function(i) { url.searchParams.delete(i.name); });
        document.querySelectorAll('[data-inf-filter]:checked').forEach(function(i) { url.searchParams.append(i.name, i.value); });
        url.searchParams.delete('page');
        window.location.href = url.toString();
      });
    });
  }

  // ── Build card DOM element ────────────────────────────────────────
  function makeCard(p) {
    const isFeatured = hasTag(p, 'featured');
    const variant    = (p.variants && p.variants[0]) || {};
    const price      = parseFloat(variant.price || 0);
    const compare    = parseFloat(variant.compare_at_price || 0);
    const image      = p.images && p.images[0];

    let priceStr, compareStr;
    if (window.Shopify && window.Shopify.formatMoney) {
      priceStr   = window.Shopify.formatMoney(Math.round(price * 100));
      compareStr = window.Shopify.formatMoney(Math.round(compare * 100));
    } else {
      const sym  = 'Rs.';
      priceStr   = sym + ' ' + price.toFixed(2);
      compareStr = sym + ' ' + compare.toFixed(2);
    }

    const priceHtml = (compare > price)
      ? '<s class="inf-card__price--was">' + compareStr + '</s> <span class="inf-card__price--now">' + priceStr + '</span>'
      : priceStr;

    const imgSrc = image
      ? image.src.replace(/(\.[a-zA-Z]+)(\?.*)?$/, '_400x$1$2')
      : '';

    const imgHtml = image
      ? '<img src="' + esc(imgSrc) + '" alt="' + esc(image.alt || p.title) + '" width="400" loading="lazy" class="inf-card__img">'
      : '<div class="inf-card__img-placeholder"></div>';

    const badgeHtml = isFeatured ? '<span class="inf-card__badge">&#11088; Featured</span>' : '';

    const el = document.createElement('div');
    el.className = 'inf-card' + (isFeatured ? ' inf-card--featured' : '');
    el.setAttribute('data-product-id', p.id);
    el.innerHTML =
      '<a href="/products/' + esc(p.handle) + '" class="inf-card__link">' +
        '<div class="inf-card__img-wrap">' + imgHtml + badgeHtml + '</div>' +
        '<div class="inf-card__body">' +
          '<p class="inf-card__vendor">' + esc(p.vendor) + '</p>' +
          '<h3 class="inf-card__title">' + esc(p.title) + '</h3>' +
          '<p class="inf-card__price">' + priceHtml + '</p>' +
        '</div>' +
      '</a>';

    return el;
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function hasTag(product, tag) {
    if (!product.tags) return false;
    const tags = Array.isArray(product.tags) ? product.tags : product.tags.split(', ');
    return tags.map(function(t) { return t.trim().toLowerCase(); }).indexOf(tag.toLowerCase()) !== -1;
  }

  async function getJson(url) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.json();
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setLoader(show) {
    if (loader) loader.hidden = !show;
  }

  function showEnd() {
    if (endMsg)   endMsg.hidden = false;
    // Hide sentinel only when truly done
    if (sentinel) sentinel.style.display = 'none';
    setLoader(false);
  }

})();
