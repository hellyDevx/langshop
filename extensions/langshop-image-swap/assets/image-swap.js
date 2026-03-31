(function () {
  var config = window.__langshop;
  if (!config || !config.locale) return;

  // If on default locale and no cached data, skip early (but still check)
  var isDefaultLocale = config.locale === config.shopLocale;

  // Only run on product pages
  var pathParts = window.location.pathname.split("/");
  var productsIndex = pathParts.indexOf("products");
  if (productsIndex === -1) {
    document.documentElement.classList.add("langshop-images-ready");
    return;
  }

  var productHandle = pathParts[productsIndex + 1];
  if (!productHandle) {
    document.documentElement.classList.add("langshop-images-ready");
    return;
  }
  productHandle = productHandle.split("?")[0];

  // Check localStorage cache first for instant swap
  var cacheKey = "langshop_gallery_" + productHandle + "_" + config.locale;
  var cached = null;
  try {
    var raw = localStorage.getItem(cacheKey);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed.ts && Date.now() - parsed.ts < 300000) { // 5 min cache
        cached = parsed.gallery;
      }
    }
  } catch (e) {}

  if (cached && cached.length > 0) {
    // Instant swap from cache
    var urlMap = buildUrlMap(cached);
    waitForImagesAndSwap(urlMap);
  }

  // Always fetch fresh data (updates cache for next visit)
  getProductId(productHandle, function (productId) {
    if (!productId) {
      revealImages();
      return;
    }

    fetchGallery(productId, config.locale, config.shop, function (gallery) {
      // Cache the result
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), gallery: gallery }));
      } catch (e) {}

      if (!gallery || gallery.length === 0) {
        revealImages();
        return;
      }

      var urlMap = buildUrlMap(gallery);
      waitForImagesAndSwap(urlMap);
    });
  });

  // --- Functions ---

  function revealImages() {
    document.documentElement.classList.add("langshop-images-ready");
  }

  function waitForImagesAndSwap(urlMap) {
    // Try immediately
    swapImages(urlMap);

    // Also try after DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        swapImages(urlMap);
        revealImages();
      });
    } else {
      revealImages();
    }

    // Watch for dynamic changes
    var observer = new MutationObserver(function () {
      swapImages(urlMap);
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Failsafe: reveal after 3 seconds even if swap hasn't happened
    setTimeout(revealImages, 3000);
  }

  function getProductId(handle, callback) {
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
      callback(window.ShopifyAnalytics.meta.product.id);
      return;
    }

    var scripts = document.querySelectorAll('script[type="application/json"]');
    for (var j = 0; j < scripts.length; j++) {
      try {
        var data = JSON.parse(scripts[j].textContent);
        if (data && data.id && data.variants) {
          callback(data.id);
          return;
        }
      } catch (e) {}
    }

    fetch("/products/" + handle + ".js")
      .then(function (r) { return r.json(); })
      .then(function (p) { callback(p ? p.id : null); })
      .catch(function () { callback(null); });
  }

  function fetchGallery(productId, locale, shop, callback) {
    var apiUrl =
      "/apps/langshop/api/image-gallery" +
      "?shop=" + encodeURIComponent(shop) +
      "&productId=" + encodeURIComponent(productId) +
      "&locale=" + encodeURIComponent(locale);

    fetch(apiUrl)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        callback(data && data.gallery ? data.gallery : []);
      })
      .catch(function () {
        callback([]);
      });
  }

  function buildUrlMap(gallery) {
    var map = {};
    gallery.forEach(function (item) {
      if (item.originalUrl && item.translatedUrl) {
        map[normalizeUrl(item.originalUrl)] = item.translatedUrl;
      }
    });
    return map;
  }

  function normalizeUrl(url) {
    try {
      var u = new URL(url, "https://placeholder.com");
      var path = u.pathname
        .replace(/_\d+x\d*/g, "")
        .replace(/_\d*x\d+/g, "")
        .replace(/_crop_[a-z]+/g, "")
        .replace(/@\dx/g, "");
      // Normalize hostname - Shopify uses both cdn.shopify.com and {store}.myshopify.com/cdn
      return path.replace(/^\/cdn\/shop\//, "/s/files/").replace(/\/s\/files\/\d+\/\d+\/\d+\/\d+\//, "/");
    } catch (e) {
      return url;
    }
  }

  function extractFilename(url) {
    return (url || "")
      .split("/").pop()
      .split("?")[0]
      .replace(/_\d+x\d*/g, "")
      .replace(/_\d*x\d+/g, "");
  }

  function findMatch(src, urlMap) {
    if (!src) return null;

    // Direct normalized match
    var normalized = normalizeUrl(src);
    for (var key in urlMap) {
      if (normalizeUrl(key) === normalized) return urlMap[key];
    }

    // Filename match fallback
    var srcFile = extractFilename(src);
    for (var key2 in urlMap) {
      if (extractFilename(key2) === srcFile) return urlMap[key2];
    }

    return null;
  }

  function swapImages(urlMap) {
    var images = document.querySelectorAll("img");

    images.forEach(function (img) {
      if (img.dataset.langshopSwapped) return;

      var src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      if (!src) return;

      var newUrl = findMatch(src, urlMap);
      if (!newUrl) return;

      img.setAttribute("src", newUrl);

      if (img.hasAttribute("srcset")) {
        var newSrcset = img.getAttribute("srcset")
          .split(",")
          .map(function (entry) {
            var parts = entry.trim().split(/\s+/);
            return newUrl + (parts[1] ? " " + parts[1] : "");
          })
          .join(", ");
        img.setAttribute("srcset", newSrcset);
      }

      var picture = img.closest("picture");
      if (picture) {
        picture.querySelectorAll("source").forEach(function (source) {
          var srcset = source.getAttribute("srcset");
          if (srcset) {
            var newSSrcset = srcset
              .split(",")
              .map(function (entry) {
                var parts = entry.trim().split(/\s+/);
                return newUrl + (parts[1] ? " " + parts[1] : "");
              })
              .join(", ");
            source.setAttribute("srcset", newSSrcset);
          }
        });
      }

      img.dataset.langshopSwapped = "true";
    });
  }
})();
