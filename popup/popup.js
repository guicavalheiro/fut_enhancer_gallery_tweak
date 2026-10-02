const { STORAGE_KEY, formatPlayer } = FutEnhancer;

const status = document.getElementById("status");
const list = document.getElementById("players");
const clearButton = document.getElementById("clear");

function render(lineup) {
  const players = lineup?.players || [];
  list.replaceChildren();
  clearButton.disabled = players.length === 0;

  if (players.length === 0) {
    status.textContent = "No solution saved.";
    return;
  }

  const savedAt = lineup.savedAt ? new Date(lineup.savedAt).toLocaleString("en-US") : "";
  const count = players.length === 1 ? "1 player saved" : `${players.length} players saved`;
  status.textContent = savedAt ? `${count} on ${savedAt}.` : `${count}.`;
  for (const player of players) {
    const item = document.createElement("li");
    item.textContent = formatPlayer(player);
    list.appendChild(item);
  }
}

chrome.storage.local.get(STORAGE_KEY, (data) => {
  render(data[STORAGE_KEY]);
});

clearButton.addEventListener("click", () => {
  chrome.storage.local.remove(STORAGE_KEY, () => {
    render(null);
  });
});
