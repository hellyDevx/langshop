(function () {
  var switcher = document.querySelector(".langshop-switcher");
  if (!switcher) return;

  var currentLocale = switcher.dataset.currentLocale;
  var autoDetect = switcher.dataset.autoDetect === "true";
  var autoRedirect = switcher.dataset.autoRedirect === "true";

  var button = switcher.querySelector(".langshop-switcher__button");
  var list = switcher.querySelector(".langshop-switcher__list");

  if (button && list) {
    button.addEventListener("click", function (e) {
      e.stopPropagation();
      var expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (expanded) {
        list.setAttribute("hidden", "");
      } else {
        list.removeAttribute("hidden");
      }
    });
    document.addEventListener("click", function (e) {
      if (!switcher.contains(e.target)) {
        button.setAttribute("aria-expanded", "false");
        list.setAttribute("hidden", "");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        button.setAttribute("aria-expanded", "false");
        list.setAttribute("hidden", "");
      }
    });
  }

  if (!autoDetect) return;

  var STORAGE_KEY = "langshop_preferred_locale";
  var stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (e) {}
  if (stored) return;

  var availableLocales = Array.prototype.slice
    .call(switcher.querySelectorAll("a[hreflang]"))
    .map(function (a) {
      return a.getAttribute("hreflang");
    });

  var browserLang = (navigator.language || "").toLowerCase();
  var browserPrimary = browserLang.split("-")[0];

  var match = availableLocales.find(function (l) {
    var lower = (l || "").toLowerCase();
    return lower === browserLang || lower === browserPrimary || lower.indexOf(browserPrimary + "-") === 0;
  });

  if (!match || match === currentLocale) return;

  try {
    localStorage.setItem(STORAGE_KEY, match);
  } catch (e) {}

  if (autoRedirect) {
    var redirectUrl = new URL(window.location.href);
    redirectUrl.searchParams.set("locale", match);
    window.location.href = redirectUrl.toString();
  }
})();
