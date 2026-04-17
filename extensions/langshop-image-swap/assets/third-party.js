(function () {
  var cfg = window.__langshop;
  if (!cfg || !cfg.locale) return;
  if (cfg.locale === cfg.shopLocale) return;
  var selectors =
    cfg.thirdPartySelectors && cfg.thirdPartySelectors.length
      ? cfg.thirdPartySelectors
      : null;
  if (!selectors) return;

  var MAX_NODES_PER_PAGEVIEW = 100;
  var DEBOUNCE_MS = 500;
  var CACHE_KEY_PREFIX = "langshop_tx_v1_";

  var translatedNodes = new WeakSet();
  var pendingByText = new Map();
  var debounceTimer = null;
  var processedCount = 0;

  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  function cacheKey(text) {
    return CACHE_KEY_PREFIX + cfg.locale + "_" + djb2(text);
  }

  function cacheGet(text) {
    try {
      return localStorage.getItem(cacheKey(text));
    } catch (e) {
      return null;
    }
  }

  function evictCache() {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf(CACHE_KEY_PREFIX) === 0) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) {}
  }

  function cacheSet(text, translation) {
    try {
      localStorage.setItem(cacheKey(text), translation);
    } catch (e) {
      evictCache();
      try {
        localStorage.setItem(cacheKey(text), translation);
      } catch (err) {}
    }
  }

  function collectTextNodes(root, into) {
    if (!root || root.nodeType !== 1) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (translatedNodes.has(node)) continue;
      var text = node.nodeValue;
      if (!text) continue;
      var trimmed = text.trim();
      if (trimmed.length < 2) continue;
      into.push({ node: node, text: trimmed });
    }
  }

  function flush() {
    if (processedCount >= MAX_NODES_PER_PAGEVIEW) {
      pendingByText.clear();
      return;
    }

    var entries = [];
    pendingByText.forEach(function (nodes, text) {
      if (entries.length >= MAX_NODES_PER_PAGEVIEW - processedCount) return;
      entries.push({ text: text, nodes: nodes });
    });
    pendingByText.clear();
    if (entries.length === 0) return;

    var textsToFetch = [];
    var fetchIndices = [];

    for (var i = 0; i < entries.length; i++) {
      var cached = cacheGet(entries[i].text);
      if (cached !== null) {
        applyTranslation(entries[i].nodes, cached);
      } else {
        textsToFetch.push(entries[i].text);
        fetchIndices.push(i);
      }
    }
    processedCount += entries.length;

    if (textsToFetch.length === 0) return;

    fetch("/apps/langshop/translate-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: cfg.locale,
        sourceLocale: cfg.shopLocale,
        texts: textsToFetch,
      }),
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data || !data.translations) return;
        for (var j = 0; j < textsToFetch.length; j++) {
          var translation = data.translations[j];
          if (!translation || translation === textsToFetch[j]) continue;
          var entry = entries[fetchIndices[j]];
          applyTranslation(entry.nodes, translation);
          cacheSet(textsToFetch[j], translation);
        }
      })
      .catch(function () {});
  }

  function applyTranslation(nodes, translation) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || translatedNodes.has(node)) continue;
      var original = node.nodeValue || "";
      var trimmed = original.trim();
      if (!trimmed) continue;
      var leading = original.substring(0, original.indexOf(trimmed));
      var trailing = original.substring(
        original.indexOf(trimmed) + trimmed.length,
      );
      node.nodeValue = leading + translation + trailing;
      translatedNodes.add(node);
    }
  }

  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  }

  function scanAndQueue(root) {
    var collected = [];
    collectTextNodes(root, collected);
    for (var i = 0; i < collected.length; i++) {
      var text = collected[i].text;
      var bucket = pendingByText.get(text);
      if (!bucket) {
        bucket = [];
        pendingByText.set(text, bucket);
      }
      bucket.push(collected[i].node);
    }
    if (collected.length > 0) schedule();
  }

  function observe(root) {
    if (!root) return;
    scanAndQueue(root);
    var observer = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var mut = mutations[m];
        if (mut.type === "characterData") {
          var n = mut.target;
          if (n && n.nodeValue && !translatedNodes.has(n)) {
            var trimmed = n.nodeValue.trim();
            if (trimmed.length >= 2) {
              var existing = pendingByText.get(trimmed);
              if (!existing) {
                existing = [];
                pendingByText.set(trimmed, existing);
              }
              existing.push(n);
            }
          }
        } else if (mut.addedNodes) {
          for (var a = 0; a < mut.addedNodes.length; a++) {
            var added = mut.addedNodes[a];
            if (added.nodeType === 1) scanAndQueue(added);
          }
        }
      }
      if (pendingByText.size > 0) schedule();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function init() {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var matches = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < matches.length; j++) observe(matches[j]);
      } catch (e) {
        // invalid selector — skip
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
