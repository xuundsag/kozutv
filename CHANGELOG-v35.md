# V35 partial — report, header and watchlist UI
- Added a Report form to the dropdown. Only show submission success after successful DB INSERT; no website report listing. `user_reports` is queried privately by the database owner. Endpoint validates sizes, uses a rate limit, and parameterized inserts. Playwright submitted, retrieved and removed one test record from the actual configured database.
- Shifted header left and reduced visual gap; mobile button and wordmark hit boxes are adjacent. Dropdown stays flush.
- Hero/detail watchlist icons update optimistically and show a failure message if the write fails; server still waits for database confirmation. The requested server-side background persistence for all actions is NOT implemented.
- EmbedWave removal, Hindi replacement and caption corrections are NOT implemented pending working replacement source and reproducible caption example. No deployment performed.
