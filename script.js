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
