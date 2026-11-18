# Submission: Cognizant BrAInstorm Challenge 2026

What Team AgriCan submitted on November 18, 2026, kept here so it can be downloaded and reused.

| File | What it is |
|---|---|
| [AgriGenesis AI - demo video.mp4](AgriGenesis%20AI%20-%20demo%20video.mp4) | The 3-minute demo video (2:58). GitHub may not play it in the browser; use the download button (↓). |
| [AgriGenesis AI - slide deck.pptx](AgriGenesis%20AI%20-%20slide%20deck.pptx) | The 10-slide deck: problem, solution, AI agent, features, architecture, impact. |
| [AgriGenesis AI - video thumbnail.jpg](AgriGenesis%20AI%20-%20video%20thumbnail.jpg) | YouTube thumbnail (1280×720). |
| [AgriGenesis AI - video subtitles.srt](AgriGenesis%20AI%20-%20video%20subtitles.srt) | Subtitles for the video, with timings. |
| [mentor-decks/](mentor-decks) | The two decks from the mentor sessions (kickoff and review). |
| [deck-source/](deck-source) | The deck's source: one HTML file per slide plus `deck.css` and `deck.json`. |

## How to reproduce

**The app.** Follow [Getting started](../README.md#getting-started) in the main README: install Node.js 20.19+, run `npm install`, create a `.env` with `ADAPTION_API_KEY=...`, then `npm run dev`. Run `npm test` for the 32 automated tests. The demo uses PID `25158932`.

**The slide deck.** Edit the `.pptx` directly in PowerPoint, Keynote or Google Slides. `deck-source/` has the text and layout of each slide (fonts: Fraunces for headings, Inter for body; colours: ink `#0F1C15`, oat `#F4F1E8`, leaf `#5FD38D`, sun `#F2B84B`). Its images were hosted separately, so the HTML will not show them on its own; matching app screenshots are in [`docs/screenshots/`](../docs/screenshots).

**The video.** It is a screen recording of the app running the demo above (Plan Farm → Climate Risk → Crop Care) with a voice-over. The voice-over script is the `.srt` file. To remake it, record the same flow, then add the voice-over and subtitles in any video editor.
