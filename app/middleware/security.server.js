/**
 * Titan GEO Core — Security Middleware
 * =====================================
 * Provides rate limiting, input sanitization, API key validation,
 * and CSRF protection utilities for use in Remix route loaders/actions.
 *
 * All functions run server-side only (.server.js convention).
 */

// ─────────────────────────────────────────────
// 1. RATE LIMITING (in-memory, per shop)
// ─────────────────────────────────────────────

/**
 * In-memory store for rate limiting.
 * Structure: Map<string, { count: number, resetAt: number }>
 *
 * NOTE: This is an in-memory store and will reset on server restart.
 * For production at scale, consider using Redis or a similar external store.
 */
const rateLimitStore = new Map();

/**
 * Default rate limit configuration.
 * Can be overridden per-route by passing options.
 */
const DEFAULT_RATE_LIMIT = {
  maxRequests: 60,        // Maximum requests per window
  windowMs: 60 * 1000,    // Window duration in milliseconds (1 minute)
  keyPrefix: "global",     // Prefix for the rate limit key (allows separate limits per feature)
};

/**
 * Clean up expired entries from the rate limit store.
 * Runs automatically to prevent memory leaks.
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
let cleanupInterval = null;
function ensureCleanupRunning() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
    // Allow the process to exit even if interval is running
    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }
  }
}

/**
 * Check if a request from a specific shop exceeds the rate limit.
 *
 * @param {string} shop - The shop domain (e.g., "mystore.myshopify.com")
 * @param {Object} [options] - Rate limit configuration overrides
 * @param {number} [options.maxRequests=60] - Maximum number of requests per window
 * @param {number} [options.windowMs=60000] - Window duration in milliseconds
 * @param {string} [options.keyPrefix="global"] - Key prefix to allow per-feature limits
 * @returns {{ allowed: boolean, remaining: number, resetAt: number, retryAfterMs: number }}
 *
 * @example
 * // In a Remix action:
 * const limit = checkRateLimit(session.shop, { maxRequests: 10, windowMs: 60000, keyPrefix: "optimize" });
 * if (!limit.allowed) {
 *   return json({ error: "Zu viele Anfragen. Bitte warte einen Moment." }, { status: 429 });
 * }
 */
export function checkRateLimit(shop, options = {}) {
  ensureCleanupRunning();

  const config = { ...DEFAULT_RATE_LIMIT, ...options };
  const key = `${config.keyPrefix}:${shop}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // If no entry or window has expired, create a new window
  if (!entry || now > entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  entry.count += 1;

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const retryAfterMs = allowed ? 0 : entry.resetAt - now;

  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
    retryAfterMs,
  };
}

/**
 * Create rate-limit response headers for transparency.
 *
 * @param {{ remaining: number, resetAt: number }} limitInfo - Result from checkRateLimit
 * @returns {Object} Headers object to spread into the Response
 *
 * @example
 * const headers = rateLimitHeaders(limit);
 * return json(data, { headers });
 */
export function rateLimitHeaders(limitInfo) {
  return {
    "X-RateLimit-Remaining": String(limitInfo.remaining),
    "X-RateLimit-Reset": String(Math.ceil(limitInfo.resetAt / 1000)),
  };
}

/**
 * Reset rate limit for a specific shop and prefix.
 * Useful for admin overrides or testing.
 *
 * @param {string} shop - The shop domain
 * @param {string} [keyPrefix="global"] - The key prefix to reset
 */
export function resetRateLimit(shop, keyPrefix = "global") {
  const key = `${keyPrefix}:${shop}`;
  rateLimitStore.delete(key);
}


// ─────────────────────────────────────────────
// 2. INPUT SANITIZATION (XSS Protection)
// ─────────────────────────────────────────────

/**
 * Dangerous HTML tags that should always be stripped.
 */
const DANGEROUS_TAGS_REGEX = /<\s*\/?\s*(script|iframe|object|embed|form|input|button|textarea|select|style|link|meta|base|applet|svg|math|video|audio|source|track)\b[^>]*>/gi;

/**
 * Event handler attributes (onclick, onerror, onload, etc.)
 */
const EVENT_HANDLERS_REGEX = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

/**
 * JavaScript protocol in href/src/action attributes
 */
const JS_PROTOCOL_REGEX = /(href|src|action|data|formaction|poster|background)\s*=\s*(?:"|')?\s*javascript\s*:/gi;

/**
 * Data URIs that could contain scripts
 */
const DATA_URI_SCRIPT_REGEX = /(href|src|action)\s*=\s*(?:"|')?\s*data\s*:\s*text\/html/gi;

/**
 * Strip XSS-dangerous content from user input strings.
 * Preserves safe HTML formatting (p, ul, li, strong, em, br, h1-h6, a with safe href).
 *
 * @param {string} input - The user-provided input string
 * @param {Object} [options] - Sanitization options
 * @param {boolean} [options.stripAllHtml=false] - If true, strip ALL HTML tags (for plain text fields)
 * @param {boolean} [options.trim=true] - Whether to trim whitespace
 * @param {number} [options.maxLength=0] - Maximum allowed length (0 = unlimited)
 * @returns {string} The sanitized string
 *
 * @example
 * // Sanitize a product description (keep safe HTML):
 * const clean = sanitizeInput(userInput);
 *
 * // Sanitize a plain text field (strip all HTML):
 * const clean = sanitizeInput(userInput, { stripAllHtml: true });
 *
 * // Sanitize with length limit:
 * const clean = sanitizeInput(userInput, { stripAllHtml: true, maxLength: 160 });
 */
export function sanitizeInput(input, options = {}) {
  if (typeof input !== "string") {
    return "";
  }

  const { stripAllHtml = false, trim = true, maxLength = 0 } = options;

  let sanitized = input;

  // Step 1: Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");

  // Step 2: Remove dangerous tags
  sanitized = sanitized.replace(DANGEROUS_TAGS_REGEX, "");

  // Step 3: Remove event handler attributes
  sanitized = sanitized.replace(EVENT_HANDLERS_REGEX, "");

  // Step 4: Remove javascript: protocol
  sanitized = sanitized.replace(JS_PROTOCOL_REGEX, "$1=");

  // Step 5: Remove dangerous data URIs
  sanitized = sanitized.replace(DATA_URI_SCRIPT_REGEX, "$1=");

  // Step 6: Optionally strip ALL remaining HTML
  if (stripAllHtml) {
    sanitized = sanitized.replace(/<[^>]*>/g, "");
    // Decode common HTML entities for plain text
    sanitized = sanitized
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'");
  }

  // Step 7: Trim whitespace
  if (trim) {
    sanitized = sanitized.trim();
  }

  // Step 8: Enforce max length
  if (maxLength > 0 && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize an entire FormData object. Returns a plain object with sanitized values.
 *
 * @param {FormData} formData - The FormData from the request
 * @param {Object} [fieldOptions] - Per-field sanitization options
 * @returns {Object} Plain object with sanitized string values
 *
 * @example
 * const data = sanitizeFormData(formData, {
 *   title: { stripAllHtml: true, maxLength: 200 },
 *   description: { stripAllHtml: false },
 *   seoTitle: { stripAllHtml: true, maxLength: 60 },
 * });
 */
export function sanitizeFormData(formData, fieldOptions = {}) {
  const result = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      const opts = fieldOptions[key] || {};
      result[key] = sanitizeInput(value, opts);
    } else {
      // File uploads or other non-string values are passed through
      result[key] = value;
    }
  }

  return result;
}

/**
 * Escape a string for safe insertion into HTML.
 * Use this when you need to embed user content in HTML templates.
 *
 * @param {string} str - The string to escape
 * @returns {string} The HTML-escaped string
 */
export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ─────────────────────────────────────────────
// 3. API KEY VALIDATION
// ─────────────────────────────────────────────

/**
 * Validate that a required API key is present and correctly formatted.
 *
 * @param {string} apiKey - The API key to validate
 * @param {Object} [options] - Validation options
 * @param {number} [options.minLength=10] - Minimum key length
 * @param {number} [options.maxLength=256] - Maximum key length
 * @param {RegExp} [options.pattern] - Optional regex pattern the key must match
 * @returns {{ valid: boolean, error: string|null }}
 *
 * @example
 * const result = validateApiKey(process.env.GEMINI_API_KEY);
 * if (!result.valid) {
 *   console.error("API key error:", result.error);
 *   return json({ error: "Server configuration error" }, { status: 500 });
 * }
 */
export function validateApiKey(apiKey, options = {}) {
  const { minLength = 10, maxLength = 256, pattern = null } = options;

  if (!apiKey || typeof apiKey !== "string") {
    return { valid: false, error: "API key is missing or not a string" };
  }

  const trimmed = apiKey.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "API key is empty" };
  }

  if (trimmed.length < minLength) {
    return { valid: false, error: `API key is too short (min ${minLength} characters)` };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `API key is too long (max ${maxLength} characters)` };
  }

  // Check for common placeholder values
  const placeholders = ["your-api-key", "YOUR_API_KEY", "xxx", "test", "placeholder", "CHANGE_ME"];
  if (placeholders.some(p => trimmed.toLowerCase() === p.toLowerCase())) {
    return { valid: false, error: "API key appears to be a placeholder value" };
  }

  if (pattern && !pattern.test(trimmed)) {
    return { valid: false, error: "API key does not match expected format" };
  }

  return { valid: true, error: null };
}

/**
 * Validate the Gemini API key specifically.
 * Google API keys typically start with "AIza" and are 39 characters.
 *
 * @param {string} [apiKey] - The API key (defaults to process.env.GEMINI_API_KEY)
 * @returns {{ valid: boolean, error: string|null }}
 *
 * @example
 * const check = validateGeminiKey();
 * if (!check.valid) {
 *   return json({ error: "Gemini API ist nicht konfiguriert." }, { status: 500 });
 * }
 */
export function validateGeminiKey(apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  return validateApiKey(key, {
    minLength: 30,
    maxLength: 100,
    pattern: /^AIza[A-Za-z0-9_-]+$/,
  });
}

/**
 * Validate a request's authorization header against an expected API key.
 * Useful if you expose internal API endpoints.
 *
 * @param {Request} request - The incoming Request object
 * @param {string} expectedKey - The expected API key
 * @returns {{ authorized: boolean, error: string|null }}
 *
 * @example
 * const auth = validateRequestAuth(request, process.env.INTERNAL_API_KEY);
 * if (!auth.authorized) {
 *   return json({ error: "Unauthorized" }, { status: 401 });
 * }
 */
export function validateRequestAuth(request, expectedKey) {
  if (!expectedKey) {
    return { authorized: false, error: "Server API key not configured" };
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return { authorized: false, error: "Missing Authorization header" };
  }

  // Support "Bearer <token>" format
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!token) {
    return { authorized: false, error: "Empty authorization token" };
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, expectedKey)) {
    return { authorized: false, error: "Invalid API key" };
  }

  return { authorized: true, error: null };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} Whether the strings are equal
 */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}


// ─────────────────────────────────────────────
// 4. CSRF PROTECTION
// ─────────────────────────────────────────────

/**
 * CSRF Protection Notes for Shopify Remix Apps
 * =============================================
 *
 * Shopify apps embedded in the Shopify Admin are inherently protected
 * against CSRF by the Shopify session token mechanism:
 *
 * 1. **Shopify App Bridge** generates a signed JWT session token that is
 *    validated on every request via `authenticate.admin(request)`.
 *    This token is origin-bound and cannot be forged by third-party sites.
 *
 * 2. **Remix form submissions** within the Shopify admin iframe are protected
 *    because the session token is included via the App Bridge fetch wrapper.
 *
 * 3. **For any non-Shopify-authenticated endpoints** (e.g., public webhooks,
 *    proxy routes, or external API endpoints), you should implement additional
 *    CSRF protection using one of these methods:
 *
 *    a) Verify the `X-Shopify-Hmac-SHA256` header for webhook requests
 *    b) Use the `shopify.authenticate.public()` method for public routes
 *    c) Implement a double-submit cookie pattern for custom public forms
 *
 * The functions below provide utilities for additional CSRF protection
 * when needed outside the Shopify Admin context.
 */

/**
 * Generate a random CSRF token.
 *
 * @param {number} [length=32] - The byte length of the token
 * @returns {string} A hex-encoded random token
 *
 * @example
 * const token = generateCsrfToken();
 * // Store in session and embed in form as hidden field
 */
export function generateCsrfToken(length = 32) {
  const { randomBytes } = require("crypto");
  return randomBytes(length).toString("hex");
}

/**
 * Verify a CSRF token from a form submission against the session token.
 *
 * @param {string} formToken - The token submitted with the form
 * @param {string} sessionToken - The token stored in the session
 * @returns {boolean} Whether the tokens match
 *
 * @example
 * // In your action:
 * const formToken = formData.get("_csrf");
 * const sessionToken = session.get("csrfToken");
 * if (!verifyCsrfToken(formToken, sessionToken)) {
 *   return json({ error: "Invalid CSRF token" }, { status: 403 });
 * }
 */
export function verifyCsrfToken(formToken, sessionToken) {
  if (!formToken || !sessionToken) return false;
  return timingSafeEqual(formToken, sessionToken);
}

/**
 * Verify a Shopify webhook HMAC signature.
 *
 * @param {string} rawBody - The raw request body as a string
 * @param {string} hmacHeader - The X-Shopify-Hmac-SHA256 header value
 * @param {string} secret - The Shopify app secret
 * @returns {boolean} Whether the signature is valid
 *
 * @example
 * const isValid = verifyShopifyWebhook(body, hmacHeader, process.env.SHOPIFY_API_SECRET);
 * if (!isValid) {
 *   return new Response("Unauthorized", { status: 401 });
 * }
 */
export function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!rawBody || !hmacHeader || !secret) return false;

  const { createHmac } = require("crypto");
  const computed = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  return timingSafeEqual(computed, hmacHeader);
}


// ─────────────────────────────────────────────
// 5. CONVENIENCE MIDDLEWARE WRAPPERS
// ─────────────────────────────────────────────

/**
 * Combined security check for route actions.
 * Validates rate limit and optionally sanitizes form data.
 *
 * @param {Request} request - The incoming request
 * @param {string} shop - The shop domain
 * @param {Object} [options] - Configuration
 * @param {Object} [options.rateLimit] - Rate limit options (see checkRateLimit)
 * @param {Object} [options.sanitizeFields] - Field-specific sanitization options (see sanitizeFormData)
 * @returns {Promise<{ ok: boolean, error?: string, status?: number, formData?: Object, headers?: Object }>}
 *
 * @example
 * export const action = async ({ request }) => {
 *   const { session } = await authenticate.admin(request);
 *   const security = await secureAction(request, session.shop, {
 *     rateLimit: { maxRequests: 10, windowMs: 60000, keyPrefix: "optimize" },
 *     sanitizeFields: {
 *       title: { stripAllHtml: true, maxLength: 200 },
 *       description: { stripAllHtml: false },
 *     },
 *   });
 *
 *   if (!security.ok) {
 *     return json({ error: security.error }, { status: security.status });
 *   }
 *
 *   const { formData } = security;
 *   // Use formData.title, formData.description, etc.
 * };
 */
export async function secureAction(request, shop, options = {}) {
  const { rateLimit: rateLimitOpts, sanitizeFields } = options;

  // Check rate limit
  if (rateLimitOpts) {
    const limit = checkRateLimit(shop, rateLimitOpts);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `Zu viele Anfragen. Bitte warte ${Math.ceil(limit.retryAfterMs / 1000)} Sekunden.`,
        status: 429,
        headers: rateLimitHeaders(limit),
      };
    }
  }

  // Parse and sanitize form data
  let formData = {};
  try {
    const rawFormData = await request.formData();
    if (sanitizeFields) {
      formData = sanitizeFormData(rawFormData, sanitizeFields);
    } else {
      // Convert to plain object without sanitization
      for (const [key, value] of rawFormData.entries()) {
        formData[key] = value;
      }
    }
  } catch (e) {
    return {
      ok: false,
      error: "Ungültige Formulardaten.",
      status: 400,
    };
  }

  return {
    ok: true,
    formData,
  };
}
