# V28
- Reference-inspired player bottom: time pill and settings/fullscreen above a dark orange seekbar; hidden individual playback, volume, caption, and PiP buttons. Centre tap/play and episode buttons remain; captions remain in settings.
- Refreshed settings popover and settings icon. Thumbnail seek preview code retained.
- Genre-based More like this below episodes; if no matching genre, uses same-type catalogue suggestions. No row if no results are available.
- Updated asset version and essential-shell service worker to kozutv-v12.
- Local browser tests: recommendation placement (mock catalogue), controls, settings tabs, and seek preview frame with sample video; v27 portrait/landscape and v26 grid regressions tested. Does not verify every provider's playback/fullscreen behavior; iframe providers may have their own UI. Not deployed.
