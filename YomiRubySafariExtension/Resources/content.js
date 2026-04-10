const browserAPI = globalThis.browser || globalThis.chrome;

const JAPANESE_TEXT_REGEX = /[ぁ-ゖァ-ヺー一-龯々〆ヵヶ]/;
const KANJI_REGEX = /[一-龯々〆ヵヶ]/;
const SKIP_SELECTOR = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "[role='navigation']",
  "textarea",
  "input",
  "select",
  "option",
  "button",
  "code",
  "pre",
  "kbd",
  "samp",
  "ruby",
  "rt",
  "rp",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']"
].join(",");

const FALLBACK_WORD_READINGS = normalizeFallbackWords(globalThis.YomiRubyLocalDict?.words);
const FALLBACK_CHAR_READINGS = normalizeFallbackChars(globalThis.YomiRubyLocalDict?.chars);


browserAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "annotatePage") {
    return false;
  }

  void annotatePage()
    .then((result) => sendResponse(result))
    .catch((error) =>
      sendResponse({
        ok: false,
        processed: 0,
        applied: 0,
        error: normalizeError(error)
      })
    );

  return true;
});

async function annotatePage() {
  const candidates = collectCandidateTextNodes();

  if (candidates.length === 0) {
    return { ok: true, processed: 0, applied: 0, message: "No eligible Japanese text was found on this page." };
  }

  let tokensByText = null;
  let tokenizerError = null;

  try {
    const response = await browserAPI.runtime.sendMessage({
      type: "tokenizeBatch",
      texts: candidates.map((candidate) => candidate.text)
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Tokenizer request failed.");
    }

    if (!Array.isArray(response.tokensByText) || response.tokensByText.length !== candidates.length) {
      throw new Error("Tokenizer returned invalid batch result.");
    }

    tokensByText = response.tokensByText;
  } catch (error) {
    tokenizerError = error;
  }

  const annotations = candidates.map((candidate, index) => ({
    id: candidate.id,
    tokens: tokensByText
      ? tokenizeWithKuromojiTokens(candidate.text, tokensByText[index])
      : tokenizeWithFallbackDictionary(candidate.text)
  }));

  const appliedCount = applyAnnotations(candidates, annotations);

  if (!tokensByText && tokenizerError) {
    return {
      ok: true,
      processed: candidates.length,
      applied: appliedCount,
      message: `Tokenizer initialization failed, used fallback dictionary: ${normalizeError(tokenizerError)}`
    };
  }

  return { ok: true, processed: candidates.length, applied: appliedCount };
}

function collectCandidateTextNodes() {
  const root = getAnnotationRoot();
  if (!root) {
    return [];
  }

  const candidates = [];
  let sequence = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text)) {
        return NodeFilter.FILTER_REJECT;
      }

      const text = node.textContent || "";
      if (!isTextEligible(node, text)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let textNode;
  while ((textNode = walker.nextNode())) {
    const text = textNode.textContent || "";

    candidates.push({
      id: `node-${sequence++}`,
      node: textNode,
      text
    });
  }

  return candidates;
}

function getAnnotationRoot() {
  return document.querySelector("#mw-content-text, article, main, [role='main']") || document.body;
}

function isTextEligible(textNode, text) {
  if (!text || text.trim() === "") {
    return false;
  }

  if (!JAPANESE_TEXT_REGEX.test(text) || !KANJI_REGEX.test(text)) {
    return false;
  }

  const parent = textNode.parentElement;
  if (!parent) {
    return false;
  }

  if (parent.closest(SKIP_SELECTOR)) {
    return false;
  }

  if (isHidden(parent)) {
    return false;
  }

  return hasVisibleClientRect(textNode);
}

function isHidden(element) {
  let current = element;

  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function hasVisibleClientRect(textNode) {
  try {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const visible = range.getClientRects().length > 0;
    range.detach?.();
    return visible;
  } catch {
    return false;
  }
}

function tokenizeWithKuromojiTokens(text, rawTokens) {

  if (!Array.isArray(rawTokens) || rawTokens.length === 0) {
    return [{ surface: text, furigana: "" }];
  }

  const tokens = [];

  for (const token of rawTokens) {
    const surface = typeof token?.surface_form === "string" ? token.surface_form : "";
    if (!surface) {
      continue;
    }

    let reading = "";

    if (typeof token.reading === "string" && token.reading !== "*") {
      reading = katakanaToHiragana(token.reading);
    } else if (typeof token.pronunciation === "string" && token.pronunciation !== "*") {
      reading = katakanaToHiragana(token.pronunciation);
    } else if (surface.length === 1 && KANJI_REGEX.test(surface)) {
      reading = FALLBACK_CHAR_READINGS[surface] || "";
    }

    tokens.push({ surface, furigana: reading });
  }

  if (tokens.length === 0) {
    return [{ surface: text, furigana: "" }];
  }

  return mergePlainTokens(tokens);
}

function tokenizeWithFallbackDictionary(text) {
  const tokens = [];
  let index = 0;

  while (index < text.length) {
    const longestWord = findLongestFallbackWord(text, index);
    if (longestWord) {
      tokens.push({ surface: longestWord.surface, furigana: longestWord.furigana });
      index += longestWord.surface.length;
      continue;
    }

    const char = text[index];
    if (KANJI_REGEX.test(char)) {
      tokens.push({
        surface: char,
        furigana: FALLBACK_CHAR_READINGS[char] || ""
      });
      index += 1;
      continue;
    }

    const runStart = index;
    index += 1;

    while (index < text.length) {
      const hasWordMatch = !!findLongestFallbackWord(text, index);
      const isKanji = KANJI_REGEX.test(text[index]);
      if (hasWordMatch || isKanji) {
        break;
      }
      index += 1;
    }

    tokens.push({ surface: text.slice(runStart, index), furigana: "" });
  }

  return mergePlainTokens(tokens);
}

function findLongestFallbackWord(text, startIndex) {
  for (const entry of FALLBACK_WORD_READINGS) {
    if (text.startsWith(entry.surface, startIndex)) {
      return entry;
    }
  }

  return null;
}

function normalizeFallbackWords(rawWords) {
  const words = Array.isArray(rawWords) ? rawWords : [];

  return words
    .filter((item) => Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "string")
    .map((item) => ({ surface: item[0].trim(), furigana: item[1].trim() }))
    .filter((item) => item.surface && item.furigana)
    .sort((a, b) => b.surface.length - a.surface.length);
}

function normalizeFallbackChars(rawChars) {
  const chars = {};

  if (!rawChars || typeof rawChars !== "object") {
    return chars;
  }

  for (const [key, value] of Object.entries(rawChars)) {
    if (typeof key !== "string" || typeof value !== "string") {
      continue;
    }

    const char = key.trim();
    const reading = value.trim();

    if (char && reading) {
      chars[char] = reading;
    }
  }

  return chars;
}

function mergePlainTokens(tokens) {
  const merged = [];

  for (const token of tokens) {
    if (!token.surface) {
      continue;
    }

    const previous = merged[merged.length - 1];
    if (previous && !previous.furigana && !token.furigana) {
      previous.surface += token.surface;
    } else {
      merged.push({ surface: token.surface, furigana: token.furigana || "" });
    }
  }

  return merged;
}

function applyAnnotations(candidates, annotations) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  let applied = 0;

  for (const annotation of annotations) {
    if (typeof annotation?.id !== "string" || !Array.isArray(annotation?.tokens)) {
      continue;
    }

    const candidate = candidateById.get(annotation.id);
    if (!candidate || !candidate.node.isConnected) {
      continue;
    }

    if ((candidate.node.textContent || "") !== candidate.text) {
      continue;
    }

    const fragment = buildRubyFragment(candidate.text, annotation.tokens);
    if (!fragment || fragment.childNodes.length === 0) {
      continue;
    }

    candidate.node.replaceWith(fragment);
    applied += 1;
  }

  return applied;
}

function buildRubyFragment(originalText, tokens) {
  const normalizedTokens = tokens
    .filter((token) => token && typeof token.surface === "string")
    .map((token) => ({
      surface: token.surface,
      furigana: typeof token.furigana === "string" ? token.furigana.trim() : ""
    }));

  if (normalizedTokens.length === 0) {
    return null;
  }

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let hasRuby = false;

  for (const token of normalizedTokens) {
    const index = originalText.indexOf(token.surface, cursor);
    if (index < 0) {
      return fallbackBuildByDictionary(originalText, normalizedTokens);
    }

    if (index > cursor) {
      fragment.appendChild(document.createTextNode(originalText.slice(cursor, index)));
    }

    if (shouldCreateRuby(token.surface, token.furigana)) {
      fragment.appendChild(createRubyElement(token.surface, token.furigana));
      hasRuby = true;
    } else {
      fragment.appendChild(document.createTextNode(token.surface));
    }

    cursor = index + token.surface.length;
  }

  if (cursor < originalText.length) {
    fragment.appendChild(document.createTextNode(originalText.slice(cursor)));
  }

  return hasRuby ? fragment : null;
}

function fallbackBuildByDictionary(originalText, tokens) {
  const readingMap = new Map();
  for (const token of tokens) {
    if (shouldCreateRuby(token.surface, token.furigana)) {
      readingMap.set(token.surface, token.furigana);
    }
  }

  if (readingMap.size === 0) {
    return null;
  }

  const dictionarySurfaces = [...readingMap.keys()].sort((a, b) => b.length - a.length);
  const fragment = document.createDocumentFragment();
  let index = 0;
  let hasRuby = false;

  while (index < originalText.length) {
    let matchedSurface = "";
    let matchedReading = "";

    for (const surface of dictionarySurfaces) {
      if (originalText.startsWith(surface, index)) {
        matchedSurface = surface;
        matchedReading = readingMap.get(surface) || "";
        break;
      }
    }

    if (matchedSurface) {
      fragment.appendChild(createRubyElement(matchedSurface, matchedReading));
      index += matchedSurface.length;
      hasRuby = true;
      continue;
    }

    const start = index;
    index += 1;
    while (index < originalText.length) {
      const hasMatch = dictionarySurfaces.some((surface) => originalText.startsWith(surface, index));
      if (hasMatch) {
        break;
      }
      index += 1;
    }

    fragment.appendChild(document.createTextNode(originalText.slice(start, index)));
  }

  return hasRuby ? fragment : null;
}

function shouldCreateRuby(surface, furigana) {
  if (!surface || !furigana) {
    return false;
  }

  if (!KANJI_REGEX.test(surface)) {
    return false;
  }

  return surface.replace(/\s+/g, "") !== furigana.replace(/\s+/g, "");
}

function createRubyElement(surface, furigana) {
  const ruby = document.createElement("ruby");
  ruby.appendChild(document.createTextNode(surface));

  const rpOpen = document.createElement("rp");
  rpOpen.textContent = "(";

  const rt = document.createElement("rt");
  rt.textContent = furigana;

  const rpClose = document.createElement("rp");
  rpClose.textContent = ")";

  ruby.appendChild(rpOpen);
  ruby.appendChild(rt);
  ruby.appendChild(rpClose);

  return ruby;
}

function katakanaToHiragana(text) {
  if (typeof text !== "string" || text.length === 0) {
    return "";
  }

  return text.replace(/[ァ-ン]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60)
  );
}

function normalizeError(error) {
  if (typeof error === "string" && error) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    if (typeof error.message === "string" && error.message) {
      return error.message;
    }

    if (typeof error.type === "string" && error.type) {
      return `Extension event error: ${error.type}`;
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Ignore JSON serialization errors and use fallback text.
    }
  }

  return "Unexpected extension error.";
}
