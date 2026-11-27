# V23 — description word wrapping

Descriptions on the home hero, detail pages, watch pages, and episode descriptions use break-all so text can break within a word to fill the line instead of moving the whole word to the next line. Hyphenation is left to browser/language support; a visible hyphen is not guaranteed. Single-line episode descriptions remain single-line. The v22 full-width watch description and expand/collapse remain in place.

Browser tests using long example words at 390, 844, and 1280px verified actual mid-word splits and first-line remaining space of 4, 2, and 1 pixels respectively. The v22 full-width and expand/collapse tests also passed. Service-worker cache version is kozutv-v7.

Production not deployed. ZIP includes credentials in .env; keep private. Back up live .env and data before deployment. Protect live data/states.json and data/user.json from overwrite, and exclude destination .env if retaining it. See CHANGELOG-v21.md for deployment notes.
