# Shopify Featured Products — Infinite Scroll

A Shopify Dawn theme implementation that pins all **featured** products to the top of a collection page, followed by remaining products, with **infinite scroll** loading 20 products per batch.

---

## Live Preview

`https://yashg-development-store.myshopify.com/collections/demo-collection`
Password: rteode

## GitHub Repository

`https://github.com/yashG2701/hopify-featured-infinite-scroll`

---

## File Structure

```
assets/
  inf-featured.js       # Infinite scroll + featured pinning logic
  inf-featured.css      # All styles (scoped with inf- prefix)
sections/
  inf-featured-section.liquid   # Main section (markup + config JSON)
snippets/
  inf-featured-card.liquid      # Product card renderer
templates/
  collection.inf-featured.json  # Template assigned to collection
```

---

## How to Install

1. Upload all files to your Dawn theme via Shopify Admin → Online Store → Themes → Edit code
2. Go to **Customize** → select your collection → switch template to **"Inf Featured"**
3. Save

---

## Approach & Logic

### 1. How featured vs non-featured products are loaded and separated

**The core challenge:** Shopify's Liquid templating only provides products on the _current page_. A featured product could be on page 4 of a 100-product collection. There is no server-side way to guarantee all 15 featured products appear first without pre-fetching.

**Solution — fetch all, sort client-side:**

On page load, JavaScript fetches all products using the public Shopify AJAX API:

```
GET /collections/{handle}/products.json?limit=250&page=1
GET /collections/{handle}/products.json?limit=250&page=2
...
```

Each product's `tags` field is checked. Products tagged `featured` go into a `featured[]` array; everything else into `normal[]`. A `Set` of seen IDs prevents duplicates.

A master ordered list is built: `[...featured, ...normal]`

For a 100-product collection this is only 1 API call. For 1,000 products it's 4 calls.

---

### 2. How infinite scroll was implemented

An `IntersectionObserver` watches an invisible sentinel `<div>` placed below the product grid. When the sentinel scrolls into view (within 300px of the viewport), the next batch of 20 is rendered.

```
Batch 0 (initial): featured[0–14] + normal[0–4]  = 20 items
Batch 1 (scroll):  normal[5–24]                  = 20 items
Batch 2 (scroll):  normal[25–44]                 = 20 items
...
```

Rendering is purely in-memory after the initial fetch — no additional API calls — making each scroll instant.

---

### 3. How duplicate products are prevented

A `Set<number>` called `seenIds` tracks every product ID processed. Before inserting any product:

```javascript
if (seenIds.has(p.id)) continue; // Skip duplicates
seenIds.add(p.id);
```

This handles edge cases where Shopify's API pagination might overlap between pages.

---

### 4. How the solution scales for large collections

- **API pagination:** Maximum page size of 250 products per request minimises round trips
- **Lazy DOM rendering:** Products are appended in batches of 20 only when the user scrolls — a 10,000-product collection never creates more than 20 DOM nodes at a time
- **In-memory arrays:** Plain JS arrays are extremely memory-efficient — 1,000 products ≈ ~500KB RAM
- **No re-renders:** Master list is computed once. Subsequent batches just slice the array — O(1) per render

---

### 5. How filtering & sorting are handled

When the user changes sort or applies a filter, the page reloads with new URL parameters. Liquid detects if `sort_by` differs from default or if any filters are active, and sets `overrideMode: true` in the JSON config.

In **override mode** featured pinning is completely bypassed. JS performs standard paginated infinite scroll with the active sort/filter params passed through — respecting Shopify's native behaviour exactly.

---

### 6. Limitations of Liquid and how they were solved

| Limitation                                       | Workaround                                                 |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Liquid only renders products on the current page | Fetch all products client-side via AJAX API                |
| No server-side way to pin products across pages  | Build master ordered list in JavaScript after full fetch   |
| Liquid cannot run asynchronously                 | Pass config as `<script type="application/json">` block    |
| Sort/filter params need server-side processing   | Reload page so Liquid applies them, then use override mode |

---

## Edge Cases Handled

| Scenario                             | Behaviour                                                           |
| ------------------------------------ | ------------------------------------------------------------------- |
| No products tagged `featured`        | Normal infinite scroll — no pinning                                 |
| All products tagged `featured`       | All appear at top, no duplicates on later batches                   |
| Featured products on later API pages | All pages fetched before rendering, so all featured captured        |
| Sort or filter applied               | Override mode: featured pinning disabled, Shopify native order used |
| Very large collections               | API pagination + lazy DOM rendering handles this transparently      |
| Fast scrolling                       | `loading` flag prevents concurrent renders                          |

---

## Process Explanation

1. **Featured vs non-featured:** Fetched via AJAX API, separated by checking `product.tags` for `"featured"`, stored in separate arrays
2. **Infinite scroll:** `IntersectionObserver` on a sentinel div triggers `renderBatch()` every time user scrolls near the bottom
3. **Duplicate prevention:** `Set` of product IDs checked before every insert
4. **Scale:** 250 products per API call + lazy 20-at-a-time DOM rendering
5. **Sort/filter:** Detected server-side in Liquid, passed to JS via JSON config — override mode skips featured logic entirely
6. **Liquid limitations:** Solved by using client-side AJAX API and a JSON data bridge pattern
