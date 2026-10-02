# FUT Gallery Select

Chrome extension that sends a [FUT.GG](https://www.fut.gg/) Gallery solution and selects those players in the EA FC Ultimate Team Web App.

Players already marked as done on FUT.GG are skipped. The extension matches cards by name, rating, and price, then clicks them in the challenge list that is already open.

## Install in Chrome

This extension is not on the Chrome Web Store. Load it from the project folder.

1. Download the project.
   - On GitHub, open **Code** and choose **Download ZIP**, then unzip it.
   - Or clone it:

     ```bash
     git clone https://github.com/guicavalheiro/fut_enhancer_gallery_tweak.git
     ```

2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the project folder — the one that contains `manifest.json`. If you downloaded a ZIP, select the unzipped folder, not the `.zip` file.
6. **FUT Gallery Select** appears in the extensions list. Pin it from the puzzle icon in the toolbar if you want the popup handy.

To update later, download or pull the latest version, then click the reload icon on the extension card in `chrome://extensions`.

The same steps work in other Chromium browsers that support unpacked extensions, such as Microsoft Edge (`edge://extensions`).

## How to use

Set FUT.GG and the Ultimate Team Web App to **English**. The extension looks for English labels such as `Coin`, `Page 1 of 3`, `Filters`, and `Buy`.

1. On FUT.GG, open a Gallery solution.
2. Use the **FUT Gallery** panel and click **Send to Web App**.
3. Open the [Ultimate Team Web App](https://www.ea.com/ea-sports-fc/ultimate-team/web-app/) and go to the challenge player list.
4. Click **Select players**. The extension reads the pages that are already open and clicks the matching cards.
5. Click **Stop** to cancel a search.
6. Open the extension popup and click **Clear list** to forget the saved solution.

## What each page does

| Page | What the extension does |
| --- | --- |
| FUT.GG Gallery | Reads the solution and saves the players who are not marked as done. |
| Ultimate Team Web App | Shows **Select players** on the challenge list and clicks the matching cards. |
| Extension popup | Shows the saved players and can clear the list. |
