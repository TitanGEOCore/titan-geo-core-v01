import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "blockquote", "pre", "code",
  "span", "div", "section", "article",
  "figure", "figcaption",
  "details", "summary",
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "width", "height",
  "class", "id", "target", "rel",
];

/**
 * Sanitize HTML output from the AI engine.
 * Strips scripts, event handlers, iframes, and inline styles.
 * @param {string} html - Raw HTML string from Gemini.
 * @returns {string} Clean, safe HTML.
 */
export function sanitizeHtml(html) {
  if (!html) return "";

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "script", "iframe", "form", "input", "textarea", "select"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover"],
  });
}
