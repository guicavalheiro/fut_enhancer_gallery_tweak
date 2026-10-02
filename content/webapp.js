const {
  STORAGE_KEY,
  parseWebPrice,
  assignPlayers,
  cardSignature,
  formatPlayer,
  matchSignature,
} = FutEnhancer;

let activeToken = 0;
let running = false;
let dismissedTitle = null;
let savedPlayers = [];
let mountTimer = 0;
let awayTimer = 0;
let seenToolbar = null;

function clickElement(element) {
  element.click();
}

function sleep(ms, alive) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (!alive()) {
        resolve(false);
        return;
      }
      if (Date.now() - start >= ms) {
        resolve(true);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function waitFor(alive, predicate, timeout) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (!alive()) {
        resolve(null);
        return;
      }
      const value = predicate();
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - start >= timeout) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 150);
    };
    tick();
  });
}

function findPager() {
  const labels = [...document.querySelectorAll("div, span, p")].filter((element) => {
    if (element.closest("#fe2-panel")) return false;
    const text = element.textContent.trim();
    return /^Page\s+\d+\s+of\s+\d+$/i.test(text) && !element.querySelector("button");
  });
  labels.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
  const label = labels[0];
  if (!label?.parentElement) return null;
  return { label, root: label.parentElement };
}

function readPage(label) {
  const match = label.textContent.trim().match(/^Page\s+(\d+)\s+of\s+(\d+)$/i);
  if (!match) return null;
  return { current: Number(match[1]), total: Number(match[2]) };
}

function findPagerButton(root, label) {
  return [...root.querySelectorAll("button")].find((button) =>
    [...button.querySelectorAll("span")].some((span) => span.textContent.trim() === label)
  );
}

function readCardPrice(card) {
  const priceSpan = [...card.querySelectorAll("span")].find((span) => {
    const className = span.getAttribute("class") || "";
    return className.includes("absolute") && parseWebPrice(span.textContent) != null;
  });
  return priceSpan ? parseWebPrice(priceSpan.textContent) : null;
}

function isBuyButton(button) {
  const text = button.textContent.replace(/\s+/g, " ").trim();
  return /^\+?\s*buy$/i.test(text);
}

function scrapeWebCards() {
  const cards = [];
  for (const card of document.querySelectorAll('[data-slot="card"]')) {
    if (card.closest("#fe2-panel")) continue;
    const rating = Number(card.querySelector(".rating")?.textContent.trim());
    if (!Number.isFinite(rating) || rating <= 0) continue;

    const buyBtn = [...card.querySelectorAll("button")].find(isBuyButton);
    if (!buyBtn) continue;

    const photoBtn = [...card.querySelectorAll("button")].find(
      (button) => button !== buyBtn && (button.getAttribute("aria-label") || "").trim()
    );
    const paragraph = [...card.querySelectorAll("p")]
      .map((node) => node.textContent.trim())
      .find(Boolean);
    const entry = {
      fullName: paragraph || photoBtn?.getAttribute("aria-label")?.trim() || "",
      displayName: (card.querySelector(".main-view.name")?.textContent || "").trim(),
      rating,
      price: readCardPrice(card),
      selectBtn: buyBtn,
      card,
    };
    if (!entry.fullName && !entry.displayName) continue;
    entry.signature = cardSignature(entry);
    cards.push(entry);
  }
  return cards;
}

async function waitForStableCards(alive) {
  let previous = null;
  let stableHits = 0;
  const start = Date.now();

  while (alive() && Date.now() - start < 8000) {
    const cards = scrapeWebCards();
    const snapshot = cards.map((card) => card.signature).join("~");
    if (previous === snapshot) {
      stableHits += 1;
      if (stableHits >= 2) return cards;
    } else {
      stableHits = 0;
      previous = snapshot;
    }
    const ok = await sleep(200, alive);
    if (!ok) return [];
  }

  return scrapeWebCards();
}

async function goToFirst(alive) {
  const pager = findPager();
  if (!pager) return false;
  const page = readPage(pager.label);
  if (!page || page.current === 1) return true;

  const button = findPagerButton(pager.root, "Go to first page");
  if (!button || button.disabled) return page.current === 1;
  clickElement(button);
  const landed = await waitFor(alive, () => {
    const next = findPager();
    return next && readPage(next.label)?.current === 1;
  }, 8000);
  return Boolean(landed);
}

async function goToNext(alive) {
  const pager = findPager();
  if (!pager) return false;
  const before = readPage(pager.label);
  const button = findPagerButton(pager.root, "Go to next page");
  if (!before || !button || button.disabled || before.current >= before.total) return false;

  clickElement(button);
  const landed = await waitFor(alive, () => {
    const next = findPager();
    const page = next && readPage(next.label);
    return page && page.current > before.current ? page : null;
  }, 8000);
  return Boolean(landed);
}

function isShown(element) {
  if (!element?.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  let node = element;
  while (node instanceof Element) {
    if (node.hidden) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    node = node.parentElement;
  }
  return true;
}

function findChallengeToolbar() {
  const toolbars = [];
  for (const list of document.querySelectorAll('[role="tablist"]')) {
    const toolbar = list.parentElement;
    if (!toolbar || toolbar.closest("#fe2-panel") || !isShown(toolbar)) continue;
    const filters = [...toolbar.querySelectorAll("button")].find(
      (button) => button.textContent.replace(/\s+/g, " ").trim() === "Filters"
    );
    if (filters) toolbars.push(toolbar);
  }
  return toolbars.at(-1) || null;
}

function challengeTitle() {
  const toolbar = findChallengeToolbar();
  const root = toolbar?.closest('[class*="max-w-6xl"]') || document;
  const title = [...root.querySelectorAll("span")].find((span) => {
    const className = span.getAttribute("class") || "";
    return className.includes("fn:text-xl") && className.includes("fn:font-semibold");
  });
  return title?.textContent.trim() || "";
}

function cancelRun() {
  activeToken += 1;
  running = false;
}

function forgetChallenge() {
  cancelRun();
  dismissedTitle = null;
  seenToolbar = null;
}

function dismissPanel() {
  activeToken += 1;
  running = false;
  dismissedTitle = challengeTitle() || "__current__";
  document.getElementById("fe2-panel")?.remove();
}

function buildPanel() {
  const panel = document.createElement("section");
  panel.id = "fe2-panel";
  panel.className = "fe2-embedded";
  panel.innerHTML = `
    <div class="fe2-header">
      <div class="fe2-actions">
        <button type="button" id="fe2-run">Select players</button>
        <button type="button" id="fe2-stop" class="fe2-secondary" hidden>Stop</button>
      </div>
      <p id="fe2-status"></p>
      <button type="button" id="fe2-close" class="fe2-close" aria-label="Close">×</button>
    </div>
    <ul id="fe2-missing"></ul>
  `;
  panel.querySelector("#fe2-close").addEventListener("click", dismissPanel);
  panel.querySelector("#fe2-run").addEventListener("click", () => {
    runSelection();
  });
  panel.querySelector("#fe2-stop").addEventListener("click", () => {
    activeToken += 1;
    running = false;
    const status = panel.querySelector("#fe2-status");
    status.className = "";
    status.textContent = "Search stopped.";
    setRunning(false);
  });
  return panel;
}

function ensurePanel() {
  const toolbar = findChallengeToolbar();
  if (!toolbar) return null;

  if (seenToolbar !== toolbar) {
    if (seenToolbar) dismissedTitle = null;
    if (running && seenToolbar && !seenToolbar.isConnected) cancelRun();
    seenToolbar = toolbar;
  }

  const title = challengeTitle() || "__current__";
  if (dismissedTitle != null && dismissedTitle === title) return null;

  let panel = document.getElementById("fe2-panel");
  if (panel?.isConnected && panel.previousElementSibling === toolbar) return panel;
  if (!panel) panel = buildPanel();
  toolbar.insertAdjacentElement("afterend", panel);
  return panel;
}

function scheduleMount() {
  window.clearTimeout(mountTimer);
  mountTimer = window.setTimeout(() => {
    const toolbar = findChallengeToolbar();
    if (!toolbar) {
      if (!awayTimer) {
        awayTimer = window.setTimeout(() => {
          awayTimer = 0;
          if (!findChallengeToolbar()) forgetChallenge();
        }, 400);
      }
      return;
    }

    window.clearTimeout(awayTimer);
    awayTimer = 0;

    const panel = document.getElementById("fe2-panel");
    if (panel?.isConnected && panel.previousElementSibling === toolbar) return;

    if (running) cancelRun();
    renderSaved();
  }, 100);
}

function setRunning(isRunning) {
  const panel = ensurePanel();
  if (!panel) return;
  panel.querySelector("#fe2-run").disabled = isRunning || savedPlayers.length === 0;
  panel.querySelector("#fe2-stop").hidden = !isRunning;
}

function renderSaved() {
  const panel = ensurePanel();
  if (!panel) return;
  const status = panel.querySelector("#fe2-status");
  const missing = panel.querySelector("#fe2-missing");
  status.className = "";
  missing.replaceChildren();

  if (savedPlayers.length === 0) {
    status.textContent = "No solution saved. On FUT.GG, open the squad and click Send to Web App.";
    setRunning(false);
    return;
  }

  const received =
    savedPlayers.length === 1 ? "1 player received" : `${savedPlayers.length} players received`;
  status.textContent = `${received} from FUT.GG. The search uses the list and the pages that are already open.`;
  setRunning(false);
}

function renderNames(players, className) {
  const list = document.querySelector("#fe2-missing");
  if (!list) return;
  list.replaceChildren();
  for (const player of players) {
    const item = document.createElement("li");
    item.className = className;
    item.textContent = formatPlayer(player);
    list.appendChild(item);
  }
}

async function loadSaved() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  savedPlayers = data[STORAGE_KEY]?.players || [];
  if (!running) renderSaved();
}

async function collectCards(alive, onPage) {
  const cards = [];
  const pager = findPager();
  if (!pager) {
    const visible = await waitForStableCards(alive);
    return { cards: visible, paged: false, complete: true };
  }

  const atStart = await goToFirst(alive);
  if (!alive()) return { cards, paged: true, complete: false };
  if (!atStart) return { cards, paged: true, complete: false };

  const seen = new Set();
  while (alive()) {
    const currentPager = findPager();
    const page = currentPager && readPage(currentPager.label);
    if (!page || seen.has(page.current)) break;
    seen.add(page.current);
    onPage(page);

    const pageCards = await waitForStableCards(alive);
    if (!alive()) return { cards, paged: true, complete: false };
    cards.push(...pageCards.map(({ fullName, displayName, rating, price }) => ({
      fullName,
      displayName,
      rating,
      price,
    })));

    if (page.current >= page.total || seen.size >= 40) {
      return { cards, paged: true, complete: true };
    }

    const moved = await goToNext(alive);
    if (!alive()) return { cards, paged: true, complete: false };
    if (!moved) return { cards, paged: true, complete: false };
  }

  return { cards, paged: true, complete: alive() };
}

async function selectAssigned(alive, assignments, onProgress) {
  const queues = new Map();
  for (const assignment of assignments) {
    const queue = queues.get(assignment.signature) || [];
    queue.push(assignment.player);
    queues.set(assignment.signature, queue);
  }

  const selected = [];
  const atStart = findPager() ? await goToFirst(alive) : true;
  if (!alive() || !atStart) {
    return { selected, remaining: [...queues.values()].flat(), complete: false };
  }

  const seen = new Set();
  while (alive()) {
    const remaining = [...queues.values()].reduce((sum, queue) => sum + queue.length, 0);
    if (remaining === 0) return { selected, remaining: [], complete: true };

    await waitForStableCards(alive);
    if (!alive()) break;

    const match = scrapeWebCards()
      .filter((card) => card.card.dataset.fe2Picked !== "1")
      .flatMap((card) =>
        [...queues.entries()]
          .filter(([, queue]) => queue.length > 0)
          .map(([signature]) => ({ card, signature, gap: matchSignature(card, signature) }))
          .filter((candidate) => candidate.gap != null)
      )
      .sort((a, b) => a.gap - b.gap)[0];

    if (match) {
      const queue = queues.get(match.signature);
      const player = queue.shift();
      match.card.card.dataset.fe2Picked = "1";
      clickElement(match.card.selectBtn);
      selected.push(player);
      onProgress(selected.length, assignments.length);
      const ok = await sleep(450, alive);
      if (!ok) break;
      continue;
    }

    const pager = findPager();
    const page = pager && readPage(pager.label);
    if (!pager) break;
    if (!page || seen.has(page.current) || page.current >= page.total) break;
    seen.add(page.current);

    const moved = await goToNext(alive);
    if (!moved) return { selected, remaining: [...queues.values()].flat(), complete: false };
  }

  return {
    selected,
    remaining: [...queues.values()].flat(),
    complete: alive(),
  };
}

function stopIfReplaced(token) {
  if (token === activeToken) return false;
  return true;
}

async function runSelection() {
  if (running || savedPlayers.length === 0) {
    if (!running) renderSaved();
    return;
  }

  const token = ++activeToken;
  const alive = () => token === activeToken;
  running = true;
  setRunning(true);
  const status = document.querySelector("#fe2-status");
  const missingList = document.querySelector("#fe2-missing");
  if (!status || !missingList) {
    running = false;
    return;
  }
  status.className = "";
  missingList.replaceChildren();

  const finish = () => {
    if (token !== activeToken) return;
    running = false;
    setRunning(false);
  };

  try {
  if (scrapeWebCards().length === 0 && !findPager()) {
    status.textContent = "Could not find the player list. Open the card screen and try again.";
    finish();
    return;
  }

  status.textContent = "Reading the list pages…";
  const collected = await collectCards(alive, (page) => {
    if (alive()) status.textContent = `Reading page ${page.current} of ${page.total}…`;
  });

  if (stopIfReplaced(token)) return;

  if (!collected.complete) {
    status.textContent = "Pagination did not advance. Nothing was clicked.";
    finish();
    return;
  }

  const { assignments, missing } = assignPlayers(savedPlayers, collected.cards);
  if (assignments.length === 0) {
    status.className = "fe2-warn";
    status.textContent = "None of the solution players appeared in this list.";
    renderNames(missing, "");
    finish();
    return;
  }

  status.className = "";
  status.textContent = `Selecting 0 of ${assignments.length}…`;
  const result = await selectAssigned(alive, assignments, (done, total) => {
    if (alive()) status.textContent = `Selecting ${done} of ${total}…`;
  });

  if (stopIfReplaced(token)) return;

  const notFound = [...missing, ...result.remaining];
  status.className = notFound.length ? "fe2-warn" : "fe2-ok";
  const selectedLabel =
    result.selected.length === 1 ? "1 player selected" : `${result.selected.length} players selected`;
  const missingLabel =
    notFound.length === 1 ? "1 not found in this list" : `${notFound.length} not found in this list`;
  status.textContent = result.complete
    ? notFound.length
      ? `${selectedLabel}. ${missingLabel}:`
      : `${selectedLabel}.`
    : `Pagination stopped. ${selectedLabel}, ${notFound.length} still not clicked:`;
  renderNames(notFound, "");
  finish();
  } finally {
    if (token === activeToken) {
      running = false;
      setRunning(false);
    }
  }
}

loadSaved();
scheduleMount();
new MutationObserver((mutations) => {
  const insidePanel = mutations.every((mutation) => {
    const target = mutation.target;
    return target instanceof Element && target.closest("#fe2-panel");
  });
  if (!insidePanel) scheduleMount();
}).observe(document.documentElement, { childList: true, subtree: true });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY] || running) return;
  savedPlayers = changes[STORAGE_KEY].newValue?.players || [];
  renderSaved();
});
