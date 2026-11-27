# V25 — remove comments and replace reaction icons

Reverted v24's comment section and its server/DB code to the v23 behavior. No existing database tables or rows were dropped: the unused `media_comments` and `media_comment_votes` tables from the previous test remain untouched, so nothing is silently destroyed. Existing account state, anime grouping, and previous v23 changes remain. Replaced player reactions with Google Material Icons thumb_up outlined/filled (Apache 2.0; https://github.com/google/material-design-icons), in white without boxes; dislike is the same icon rotated.

Home page screenshots were captured from the local application with live catalogue imagery, not a production deployment. Tests verified visible posters at mobile and desktop, icon white/outline/selected states, absence of comment section, player fit/instant reactions, header gap, and description wrapping. Worker is kozutv-v9.

Production was not deployed. ZIP includes actual .env credentials; keep private. Back up live data/ and .env before deployment. Do not overwrite live data/states.json or data/user.json; exclude .env too if retaining the destination copy. See CHANGELOG-v21.md for deployment details.
