(function () {
  var config = window.__langshop;
  if (!config || !config.locale) return;

  // Only run on product pages
  var pathParts = window.location.pathname.split("/");
  var productsIndex = pathParts.indexOf("products");
  if (productsIndex === -1) return;

  var productHandle = pathParts[productsIndex + 1];
  if (!productHandle) return;
  productHandle = productHandle.split("?")[0];

  // Check localStorage cache first for instant swap (no flash)
  var cacheKey = "langshop_gallery_" + productHandle + "_" + config.locale;
  var cached = null;
  try {
    var raw = localStorage.getItem(cacheKey);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed.ts && Date.now() - parsed.ts < 300000) {
        cached = parsed.gallery;
      }
    }
  } catch (e) {}

  // If we have cached translations, hide images immediately to prevent flash
  if (cached && cached.length > 0) {
    var productMedia = document.querySelector(".product__media, .product-media-container, .product__media-wrapper, [data-media-id]");
    if (productMedia) productMedia.classList.add("langshop-hiding");
    var urlMap = buildUrlMap(cached);
    waitForImagesAndSwap(urlMap);
  }

  // Fetch fresh data
  getProductId(productHandle, function (productId) {
    if (!productId) {
      revealImages();
      return;
    }

    fetchGallery(productId, config.locale, config.shop, function (gallery) {
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

  function revealImages() {
    document.querySelectorAll(".langshop-hiding").forEach(function (el) {
      el.classList.remove("langshop-hiding");
    });
    document.documentElement.classList.add("langshop-images-ready");
  }

  function waitForImagesAndSwap(urlMap) {
    swapImages(urlMap);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        swapImages(urlMap);
        revealImages();
      });
    } else {
      swapImages(urlMap);
      revealImages();
    }

    var observer = new MutationObserver(function () {
      swapImages(urlMap);
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

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
        map[extractFilename(item.originalUrl)] = item.translatedUrl;
      }
    });
    return map;
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
    var srcFile = extractFilename(src);
    if (urlMap[srcFile]) return urlMap[srcFile];
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

      if (img.hasAttribute("data-src")) {
        img.setAttribute("data-src", newUrl);
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
