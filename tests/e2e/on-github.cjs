// What the browser tests leave out on GitHub to save time, where `CI` is set.
// A run anywhere else leaves nothing out.

/**
 * Whether the full-page accessibility scan runs for this language in this
 * theme. Everywhere: yes. On GitHub each language is scanned in one theme, the
 * languages taking the themes in turn (English light, Chinese dark …), so
 * that every language and every theme is still scanned there; with fewer
 * languages than themes, every pair runs.
 */
function fullScanRuns(languages, themes, language, theme, onGitHub = Boolean(process.env.CI)) {
  if (!onGitHub || languages.length < themes.length) return true;
  return themes[languages.indexOf(language) % themes.length] === theme;
}

module.exports = { fullScanRuns };
