(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.FutEnhancer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "futEnhancerLineup";

  function normalizeName(value) {
    return String(value || "")
      .replace(/ß/g, "ss")
      .replace(/æ/gi, "ae")
      .replace(/ø/gi, "o")
      .replace(/ł/gi, "l")
      .replace(/đ/gi, "d")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function parseFutAlt(alt) {
    const match = String(alt || "").match(/^(.+?)\s[-–]\s(\d+)\s[-–]\s(.+)$/);
    if (!match) return null;
    return {
      name: match[1].trim(),
      rating: Number(match[2]),
      rarity: match[3].trim(),
    };
  }

  function parseFutHref(href) {
    const match = String(href || "").match(/\/players\/(\d+)-([^/]+)\/\d+-(\d+)/);
    if (!match) return null;
    return {
      baseId: match[1],
      slug: match[2],
      resourceId: match[3],
    };
  }

  function parseFutPrice(text) {
    const raw = String(text || "").replace(/\s+/g, "").replace(",", ".");
    const match = raw.match(/(\d+(?:\.\d+)?)([KM])?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;
    const unit = (match[2] || "").toUpperCase();
    if (unit === "K") return Math.round(amount * 1000);
    if (unit === "M") return Math.round(amount * 1000000);
    return Math.round(amount);
  }

  function parseWebPrice(text) {
    const raw = String(text || "").trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      return Number(raw.replace(/\./g, ""));
    }
    if (/^\d{2,}$/.test(raw)) {
      return Number(raw);
    }
    return null;
  }

  function namesMatch(player, card) {
    const shortName = normalizeName(player.name);
    const slugName = normalizeName(String(player.slug || "").replace(/-/g, " "));
    const fullName = normalizeName(card.fullName || "");
    const displayName = normalizeName(card.displayName || "");

    if (slugName && fullName && fullName === slugName) return true;
    if (shortName && fullName && (fullName === shortName || fullName.endsWith(` ${shortName}`))) {
      return true;
    }
    if (shortName && displayName && displayName === shortName) return true;
    return false;
  }

  function priceDistance(playerPrice, cardPrice) {
    if (playerPrice == null || cardPrice == null) return 1000000000;
    if (!Number.isFinite(playerPrice) || !Number.isFinite(cardPrice)) return 1000000000;
    return Math.abs(playerPrice - cardPrice);
  }

  function cardSignature(card) {
    const name = normalizeName(card.fullName || card.displayName || "");
    const price = card.price == null ? "na" : String(card.price);
    return `${name}|${card.rating}|${price}`;
  }

  function assignPlayers(players, cards) {
    const pairs = [];
    players.forEach((player, playerIndex) => {
      cards.forEach((card, cardIndex) => {
        if (Number(card.rating) !== Number(player.rating)) return;
        if (!namesMatch(player, card)) return;
        pairs.push({
          playerIndex,
          cardIndex,
          distance: priceDistance(player.price, card.price),
        });
      });
    });

    pairs.sort(
      (a, b) =>
        a.distance - b.distance || a.playerIndex - b.playerIndex || a.cardIndex - b.cardIndex
    );

    const usedPlayers = new Set();
    const usedCards = new Set();
    const assignments = [];

    for (const pair of pairs) {
      if (usedPlayers.has(pair.playerIndex) || usedCards.has(pair.cardIndex)) continue;
      usedPlayers.add(pair.playerIndex);
      usedCards.add(pair.cardIndex);
      assignments.push({
        player: players[pair.playerIndex],
        signature: cardSignature(cards[pair.cardIndex]),
      });
    }

    return {
      assignments,
      missing: players.filter((_, index) => !usedPlayers.has(index)),
    };
  }

function formatPlayer(player) {
  return `${player.name} ${player.rating} · ${player.rarity}`;
}

function matchSignature(card, signature) {
  const priceSep = signature.lastIndexOf("|");
  const ratingSep = signature.lastIndexOf("|", priceSep - 1);
  if (ratingSep <= 0 || priceSep <= ratingSep) return null;

  const name = signature.slice(0, ratingSep);
  const rating = signature.slice(ratingSep + 1, priceSep);
  const price = signature.slice(priceSep + 1);
  const cardName = normalizeName(card.fullName || card.displayName || "");
  if (cardName !== name || String(card.rating) !== rating) return null;
  if (price === "na" || card.price == null) return 0;

  const expected = Number(price);
  if (!Number.isFinite(expected)) return 0;
  const gap = Math.abs(card.price - expected);
  const tolerance = Math.max(5000, expected * 0.15);
  if (gap > tolerance) return null;
  return gap;
}

  return {
    STORAGE_KEY,
    normalizeName,
    parseFutAlt,
    parseFutHref,
    parseFutPrice,
    parseWebPrice,
    namesMatch,
    priceDistance,
    cardSignature,
    assignPlayers,
    formatPlayer,
    matchSignature,
  };
});
