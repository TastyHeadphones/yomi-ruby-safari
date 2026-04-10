const browserAPI = globalThis.browser || globalThis.chrome;
const runtimeAPI = browserAPI?.runtime;

let tokenizerPromise = null;

browserAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "annotateActiveTab") {
    void annotateActiveTab()
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "tokenizeBatch") {
    void tokenizeBatch(message.texts)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "extensionStatus") {
    sendResponse({
      ok: true,
      mode: "local-dictionary",
      message: "Local dictionary mode is active. No API key is required."
    });
    return false;
  }

  sendResponse({ ok: false, error: "Unsupported message type." });
  return false;
});

async function annotateActiveTab() {
  try {
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab || typeof activeTab.id !== "number") {
      return { ok: false, error: "No active tab is available." };
    }

    return await browserAPI.tabs.sendMessage(activeTab.id, { type: "annotatePage" });
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

async function tokenizeBatch(texts) {
  if (!Array.isArray(texts)) {
    return { ok: false, error: "Invalid tokenization request payload." };
  }

  const tokenizer = await getTokenizer();
  const tokensByText = texts.map((text) => tokenizeText(tokenizer, typeof text === "string" ? text : ""));
  return { ok: true, tokensByText };
}

function tokenizeText(tokenizer, text) {
  if (!text) {
    return [];
  }

  try {
    const rawTokens = tokenizer.tokenize(text);
    if (!Array.isArray(rawTokens)) {
      return [];
    }

    return rawTokens.map((token) => ({
      surface_form: typeof token?.surface_form === "string" ? token.surface_form : "",
      reading: typeof token?.reading === "string" ? token.reading : "",
      pronunciation: typeof token?.pronunciation === "string" ? token.pronunciation : ""
    }));
  } catch {
    return [];
  }
}

function getTokenizer() {
  if (tokenizerPromise) {
    return tokenizerPromise;
  }

  tokenizerPromise = initializeTokenizer().catch((error) => {
    tokenizerPromise = null;
    throw error;
  });

  return tokenizerPromise;
}

async function initializeTokenizer() {
  const kuromoji = globalThis.kuromoji;
  if (!kuromoji || typeof kuromoji.builder !== "function") {
    throw new Error("kuromoji.js is not loaded in background.");
  }

  if (!runtimeAPI || typeof runtimeAPI.getURL !== "function") {
    throw new Error("Extension runtime API is unavailable.");
  }

  const dictionaryPaths = getDictionaryPaths();
  const attemptErrors = [];

  for (const dictPath of dictionaryPaths) {
    try {
      return await buildTokenizer(kuromoji, dictPath);
    } catch (error) {
      attemptErrors.push(`[${dictPath || "(relative root)"}] ${normalizeError(error)}`);
    }
  }

  throw new Error(`Tokenizer initialization failed for all dictionary paths: ${attemptErrors.join(" | ")}`);
}

function getDictionaryPaths() {
  const paths = [
    "",
    ensureTrailingSlash(runtimeAPI.getURL("")),
    "dict/",
    ensureTrailingSlash(runtimeAPI.getURL("dict/"))
  ];
  return [...new Set(paths)];
}

function buildTokenizer(kuromoji, dictPath) {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: dictPath }).build((error, tokenizer) => {
      if (error) {
        reject(error);
        return;
      }

      if (!tokenizer || typeof tokenizer.tokenize !== "function") {
        reject(new Error("kuromoji tokenizer initialization returned invalid instance."));
        return;
      }

      resolve(tokenizer);
    });
  });
}

function ensureTrailingSlash(url) {
  if (typeof url !== "string" || url.length === 0) {
    return "";
  }
  return url.endsWith("/") ? url : `${url}/`;
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
