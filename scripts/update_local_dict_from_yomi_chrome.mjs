#!/usr/bin/env node
import fs from "node:fs";

const sourceURL = process.argv[2] || "https://raw.githubusercontent.com/TastyHeadphones/yomi-ruby-chrome/main/background.js";
const outJsPath = "/Volumes/RC20/Github/yomi-ruby-safari/YomiRubySafariExtension/Resources/local-dict.js";
const outJsonPath = "/Volumes/RC20/Github/yomi-ruby-safari/YomiRubySafariExtension/Resources/local-dict.json";

async function main() {
  const response = await fetch(sourceURL, {
    headers: {
      "User-Agent": "yomi-ruby-safari-dict-updater"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download source (${response.status}): ${sourceURL}`);
  }

  const source = await response.text();

  const wordsMatch = source.match(/const\s+MOCK_WORD_READINGS\s*=\s*(\[[\s\S]*?\]);/);
  const charsMatch = source.match(/const\s+MOCK_CHAR_READINGS\s*=\s*(\{[\s\S]*?\});/);

  if (!wordsMatch || !charsMatch) {
    throw new Error("Could not find MOCK_WORD_READINGS / MOCK_CHAR_READINGS in source.");
  }

  const words = Function(`"use strict"; return (${wordsMatch[1]});`)();
  const chars = Function(`"use strict"; return (${charsMatch[1]});`)();

  if (!Array.isArray(words) || !chars || typeof chars !== "object") {
    throw new Error("Parsed dictionary is invalid.");
  }

  const payload = { words, chars };

  const jsOutput =
    "// Generated from yomi-ruby-chrome/background.js MOCK_WORD_READINGS + MOCK_CHAR_READINGS\n" +
    "// Source: https://github.com/TastyHeadphones/yomi-ruby-chrome\n" +
    `globalThis.YomiRubyLocalDict = Object.freeze(${JSON.stringify(payload, null, 2)});\n`;

  fs.writeFileSync(outJsPath, jsOutput);
  fs.writeFileSync(outJsonPath, JSON.stringify(payload, null, 2) + "\n");

  console.log(`Dictionary updated: ${words.length} words, ${Object.keys(chars).length} chars.`);
  console.log(`- ${outJsPath}`);
  console.log(`- ${outJsonPath}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
