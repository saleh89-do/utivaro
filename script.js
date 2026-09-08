"use strict";

/* Utivaro V1
   Shared utility functions
*/

const Utivaro = {
  copyText: async function (text, button) {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);

      if (button) {
        const original = button.textContent;
        button.textContent = "Copied ✓";

        setTimeout(() => {
          button.textContent = original;
        }, 1500);
      }
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  },

  clearInput: function (id) {
    const element = document.getElementById(id);

    if (element) {
      element.value = "";
      element.dispatchEvent(new Event("input"));
      element.focus();
    }
  },

  formatNumber: function (number) {
    return new Intl.NumberFormat("en-US").format(number);
  }
};

/* WORD + CHARACTER COUNTER */

function updateTextStats() {
  const input = document.getElementById("textInput");
  if (!input) return;

  const text = input.value;

  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, "").length;

  const trimmed = text.trim();

  const words = trimmed
    ? trimmed.split(/\s+/).filter(Boolean).length
    : 0;

  const sentences = trimmed
    ? (trimmed.match(/[.!?]+(?=\s|$)/g) || []).length
    : 0;

  const paragraphs = trimmed
    ? trimmed.split(/\n\s*\n/).filter(p => p.trim()).length
    : 0;

  const readingTime =
    words === 0 ? 0 : Math.max(1, Math.ceil(words / 225));

  setText("wordCount", words);
  setText("characterCount", characters);
  setText("characterNoSpaces", charactersNoSpaces);
  setText("sentenceCount", sentences);
  setText("paragraphCount", paragraphs);
  setText("readingTime", readingTime);
}

/* PERCENTAGE CALCULATOR */

function calculatePercentage() {
  const value = parseFloat(
    document.getElementById("percentageValue")?.value
  );

  const percentage = parseFloat(
    document.getElementById("percentageRate")?.value
  );

  const result = document.getElementById("percentageResult");

  if (!result) return;

  if (Number.isNaN(value) || Number.isNaN(percentage)) {
    result.textContent = "Enter both numbers";
    return;
  }

  const answer = (value * percentage) / 100;

  result.textContent =
    Number.isInteger(answer)
      ? answer
      : parseFloat(answer.toFixed(6));
}

/* DAYS BETWEEN DATES */

function calculateDaysBetween() {
  const startValue =
    document.getElementById("startDate")?.value;

  const endValue =
    document.getElementById("endDate")?.value;

  const result =
    document.getElementById("daysResult");

  if (!result) return;

  if (!startValue || !endValue) {
    result.textContent = "Select both dates";
    return;
  }

  const start = new Date(startValue + "T00:00:00");
  const end = new Date(endValue + "T00:00:00");

  const milliseconds = end - start;
  const days = Math.round(
    milliseconds / (1000 * 60 * 60 * 24)
  );

  result.textContent =
    Math.abs(days) +
    (Math.abs(days) === 1 ? " day" : " days");
}

/* BASE64 */

function encodeBase64() {
  const input =
    document.getElementById("base64Input");

  const output =
    document.getElementById("base64Output");

  if (!input || !output) return;

  try {
    output.value = btoa(
      unescape(
        encodeURIComponent(input.value)
      )
    );
  } catch (error) {
    output.value = "Unable to encode this text.";
  }
}

function decodeBase64() {
  const input =
    document.getElementById("base64Input");

  const output =
    document.getElementById("base64Output");

  if (!input || !output) return;

  try {
    output.value = decodeURIComponent(
      escape(
        atob(input.value.trim())
      )
    );
  } catch (error) {
    output.value = "Invalid Base64 input.";
  }
}

/* GENERAL HELPERS */

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initToolSearch();
  const textInput =
    document.getElementById("textInput");

  if (textInput) {
    textInput.addEventListener(
      "input",
      updateTextStats
    );

    updateTextStats();
  }

  const year =
    document.getElementById("currentYear");

  if (year) {
    year.textContent =
      new Date().getFullYear();
  }
});

/* HOMEPAGE TOOL SEARCH */
function initToolSearch() {
  const search = document.getElementById("toolSearch");
  const cards = Array.from(document.querySelectorAll(".searchable-tool"));
  const empty = document.getElementById("noToolsFound");
  if (!search || !cards.length) return;
  const filter = () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach(card => {
      const haystack = ((card.dataset.search || "") + " " + card.textContent).toLowerCase();
      const show = !q || haystack.includes(q);
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (empty) empty.hidden = visible !== 0;
  };
  search.addEventListener("input", filter);
}

/* ===== Utivaro Navigation Redesign V2 ===== */
const UTIVARO_TOOL_GROUPS = {
  images: [
    ["/tools/heic-to-jpg","📸","HEIC to JPG"], ["/tools/webp-to-jpg","🖼️","WebP to JPG"], ["/tools/jpg-to-webp","🗜️","JPG to WebP"], ["/tools/image-resizer","↔️","Image Resizer"], ["/tools/color-picker","🎨","Color Picker"]
  ],
  calculators: [
    ["/tools/percentage-calculator","%","Percentage"], ["/tools/age-calculator","🎂","Age Calculator"], ["/tools/days-between-dates","📅","Days Between"], ["/tools/tip-calculator","💵","Tip Calculator"]
  ],
  text: [["/tools/word-counter","📝","Word Counter"], ["/tools/character-counter","🔤","Character Counter"]],
  developer: [["/tools/base64","</>","Base64"], ["/tools/json-formatter","{ }","JSON Formatter"], ["/tools/uuid-generator","🆔","UUID Generator"]],
  generators: [["/tools/password-generator","🔐","Password Generator"], ["/tools/random-number-generator","🎲","Random Number"]],
  converters: [["/tools/unit-converter","⇄","Unit Converter"]]
};

function utivaroCurrentGroup(path) {
  return Object.entries(UTIVARO_TOOL_GROUPS).find(([, tools]) => tools.some(t => t[0] === path));
}

function initUtivaroToolNavigation() {
  const path = window.location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  if (!path.startsWith("/tools/")) return;
  const found = utivaroCurrentGroup(path);
  if (!found) return;
  const [groupName, groupTools] = found;
  const groupLabel = {images:"Image Tools",calculators:"Calculators",text:"Text Tools",developer:"Developer Tools",generators:"Generators",converters:"Converters"}[groupName];

  const main = document.querySelector("main");
  if (main) {
    const quick = document.createElement("nav");
    quick.className = "tool-quick-nav";
    quick.setAttribute("aria-label","Tool categories");
    quick.innerHTML = `<a href="/#categories">☰ All Categories</a><a href="/">⌂ Home</a><a href="/#all-tools">⌕ Search Tools</a><a href="/#categories">${groupLabel}</a>`;
    main.insertBefore(quick, main.firstChild);
  }

  const related = groupTools.filter(t => t[0] !== path).slice(0,4);
  if (related.length) {
    const block = document.createElement("section");
    block.className = "related-tools-v2";
    block.innerHTML = `<div class="related-tools-head"><h2>Related ${groupLabel}</h2><a href="/#categories">See all tools →</a></div><div class="related-tools-grid">${related.map(t => `<a class="related-tool-link" href="${t[0]}"><span>${t[1]}</span>${t[2]}</a>`).join("")}</div>`;
    const footer = document.querySelector("footer");
    if (footer) footer.parentNode.insertBefore(block, footer); else document.body.appendChild(block);
  }
}

function initUtivaroMobileNav() {
  const path = window.location.pathname.replace(/\.html$/, "");
  const nav = document.createElement("nav");
  nav.className = "mobile-tool-nav";
  nav.setAttribute("aria-label","Mobile navigation");
  nav.innerHTML = `<a href="/" class="${path === "/" ? "active" : ""}"><span>⌂</span>Home</a><a href="/#categories"><span>▦</span>Categories</a><a href="/#all-tools"><span>⌕</span>Search</a><a href="/#all-tools" class="${path.startsWith("/tools/") ? "active" : ""}"><span>🧰</span>All Tools</a>`;
  document.body.appendChild(nav);
}

document.addEventListener("DOMContentLoaded", () => {
  initUtivaroToolNavigation();
  initUtivaroMobileNav();
});
