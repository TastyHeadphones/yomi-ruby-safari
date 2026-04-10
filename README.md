# yomi-ruby-safari

Minimal iPhone Safari Web Extension packaged in an iOS app.

This version is fully local and does not use any external API.

Implemented scope:

- Full local furigana tokenization with `kuromoji.js` + IPADIC dictionary (no network requests)
- Fallback dictionary imported from `yomi-ruby-chrome` mock dictionary data
- Extension popup with a single `Annotate Current Page` action
- Conservative visible-text traversal
- Semantic HTML output with `<ruby>`, `<rt>`, and `<rp>`

## Project Structure

- `YomiRubySafari/` iOS container app (instructions/status only)
- `YomiRubySafariExtension/` Safari Web Extension target + web assets
- `project.yml` XcodeGen spec
- `YomiRubySafari.xcodeproj/` generated Xcode project

## Configuration Points

1. Local dictionary entries:
   - `YomiRubySafariExtension/Resources/kuromoji.js`
   - `YomiRubySafariExtension/Resources/dict/*.dat.gz` (IPADIC files)
   - `YomiRubySafariExtension/Resources/local-dict.js` (loaded at runtime)
   - `YomiRubySafariExtension/Resources/local-dict.json` (raw copy)
   - Fallback dictionary parsing in `YomiRubySafariExtension/Resources/content.js`
   - Vendoring script: `scripts/vendor_kuromoji_dict.sh`
   - Refresh script: `scripts/update_local_dict_from_yomi_chrome.mjs`

2. Annotation limits and traversal filters:
   - `YomiRubySafariExtension/Resources/content.js`
   - `MAX_NODES`, `MAX_TOTAL_CHARS`, `MAX_SINGLE_NODE_CHARS`
   - `SKIP_SELECTOR`

3. Popup/background behavior:
   - `YomiRubySafariExtension/Resources/popup.js`
   - `YomiRubySafariExtension/Resources/background.js`

## Setup

1. Install tools:
   - Xcode 16+
   - `xcodegen`

2. Generate project:

```bash
xcodegen generate
```

Optional: refresh local dictionary from `yomi-ruby-chrome` latest main branch:

```bash
node scripts/update_local_dict_from_yomi_chrome.mjs
```

Optional: re-vendor full kuromoji/IPADIC files:

```bash
./scripts/vendor_kuromoji_dict.sh
```

3. Open `YomiRubySafari.xcodeproj`.

4. Set signing team and bundle IDs.

5. Build/run on iPhone.

6. Enable extension on iPhone:
   - `Settings > Safari > Extensions > Yomi Ruby Extension`

7. In Safari, open extension popup and tap `Annotate Current Page`.

## DOM Annotation Strategy

`content.js` scans text nodes with `TreeWalker` and only processes nodes that:

- contain Japanese text including Kanji
- are visibly rendered
- are not inside inputs/editable regions/scripts/styles/code/pre/ruby contexts
- stay within conservative per-run node/character limits

For each candidate node, the extension tokenizes text with `kuromoji` (full local IPADIC), then replaces eligible segments with:

- `<ruby>surface<rp>(</rp><rt>reading</rt><rp>)</rp></ruby>` for matched dictionary terms
- plain text for unmatched segments

The replacement is applied only when token surfaces reconstruct the original text exactly, to minimize page breakage.

## iOS Safari Limitations (MVP)

- Extension runs only on pages where website access is granted.
- SPA re-renders can overwrite annotations.
- Large pages are intentionally capped by node/character limits.
- First annotation run may be slower because tokenizer/dictionary initialization is heavy.
- If tokenizer initialization fails, extension falls back to `local-dict.js`.
## Dictionary Source

- Full tokenizer dictionary:
  - `https://www.npmjs.com/package/kuromoji` (`build/kuromoji.js` + `dict/*.dat.gz`)
- Fallback dictionary:
  - `https://github.com/TastyHeadphones/yomi-ruby-chrome`
  - `background.js` constants: `MOCK_WORD_READINGS`, `MOCK_CHAR_READINGS`
