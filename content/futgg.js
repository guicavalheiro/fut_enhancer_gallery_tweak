const { STORAGE_KEY, parseFutAlt, parseFutHref, parseFutPrice, formatPlayer } = FutEnhancer;

let refreshTimer = 0;
let dismissed = false;

function scrapeLineup() {
  const list = document.querySelector('ul[data-gallery-lineup="true"]');
  if (!list) return null;

  const players = [];
  let skipped = 0;

  for (const item of list.querySelectorAll("li[data-gallery-lineup-player]")) {
    const done = item.querySelector('button[role="checkbox"]')?.getAttribute("aria-checked") === "true";
    if (done) {
      skipped += 1;
      continue;
    }

    const image = item.querySelector("img[alt]");
    const link = item.querySelector('a[href*="/players/"]');
    const identity = parseFutAlt(image?.getAttribute("alt"));
    const ids = parseFutHref(link?.getAttribute("href"));
    if (!identity) continue;

    const coin = item.querySelector('img[alt="Coin"]');
    players.push({
      resourceId: ids?.resourceId || item.getAttribute("data-gallery-lineup-player"),
      baseId: ids?.baseId || null,
      slug: ids?.slug || "",
      name: identity.name,
      rating: identity.rating,
      rarity: identity.rarity,
      price: parseFutPrice(coin?.parentElement?.textContent || ""),
    });
  }

  return { players, skipped };
}

function dismissPanel() {
  dismissed = true;
  document.getElementById("fe2-panel")?.remove();
}

function ensurePanel() {
  if (dismissed) return null;
  let panel = document.getElementById("fe2-panel");
  if (panel) return panel;

  panel = document.createElement("section");
  panel.id = "fe2-panel";
  panel.innerHTML = `
    <div class="fe2-header">
      <h2>FUT Gallery</h2>
      <button type="button" id="fe2-close" class="fe2-close" aria-label="Close">×</button>
    </div>
    <div class="fe2-body">
      <p id="fe2-status"></p>
      <div class="fe2-actions">
        <button type="button" id="fe2-send">Send to Web App</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector("#fe2-close").addEventListener("click", dismissPanel);
  panel.querySelector("#fe2-send").addEventListener("click", sendLineup);
  return panel;
}

function renderStatus(lineup) {
  const panel = ensurePanel();
  if (!panel) return;
  const status = panel.querySelector("#fe2-status");
  const button = panel.querySelector("#fe2-send");

  if (!lineup || lineup.players.length === 0) {
    status.textContent = lineup
      ? "Every player in this solution is already marked as done."
      : "Open a FUT Gallery solution to send the list.";
    button.disabled = true;
    return;
  }

  const preview = lineup.players.slice(0, 3).map(formatPlayer).join(", ");
  const extra = lineup.players.length > 3 ? ` and ${lineup.players.length - 3} more` : "";
  const skipped = lineup.skipped
    ? lineup.skipped === 1
      ? " 1 player already marked as done was left out."
      : ` ${lineup.skipped} players already marked as done were left out.`
    : "";
  const ready =
    lineup.players.length === 1 ? "1 player ready" : `${lineup.players.length} players ready`;
  status.textContent = `${ready}: ${preview}${extra}.${skipped}`;
  button.disabled = false;
}

async function sendLineup() {
  const lineup = scrapeLineup();
  const status = document.querySelector("#fe2-status");
  if (!lineup || lineup.players.length === 0) {
    renderStatus(lineup);
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      sourceUrl: location.href,
      savedAt: Date.now(),
      players: lineup.players,
    },
  });

  const sent = lineup.players.length === 1 ? "1 player sent" : `${lineup.players.length} players sent`;
  status.textContent = `${sent}. In the Web App, open the list and click Select players.`;
}

function refresh() {
  const lineup = scrapeLineup();
  if (!lineup && !document.getElementById("fe2-panel")) return;
  renderStatus(lineup);
}

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refresh, 250);
}

scheduleRefresh();
new MutationObserver((mutations) => {
  const touchedPanel = mutations.some((mutation) => {
    const target = mutation.target;
    return target instanceof Element && target.closest("#fe2-panel");
  });
  if (!touchedPanel) scheduleRefresh();
}).observe(document.documentElement, { childList: true, subtree: true });
