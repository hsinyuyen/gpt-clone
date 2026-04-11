import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useCoin } from "./CoinContext";
import {
  getCardCollection,
  saveCardCollection,
  getCardImages,
  CardImageMap,
} from "@/lib/firestore";
import {
  PlayerCardCollection,
  CardDefinition,
  SavedDeck,
} from "@/types/Card";
import { ALL_CARDS, CARD_MAP, getActivePools } from "@/data/cards/pools";
import { BASIC_POOL_CARDS } from "@/data/cards/basic-pool";
import {
  singleDraw,
  multiDraw,
  addCardToCollection,
  generateStarterDeck,
} from "@/utils/gacha";
import { xpToNextLevel } from "@/utils/cardStats";

export const MAX_DECK_SIZE = 20;
export const MAX_DECKS = 8;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Migrate legacy PlayerCardCollection docs that only have `activeDeckCardIds`.
 * Creates a first SavedDeck from those IDs and sets it as active.
 */
function migrateCollection(raw: PlayerCardCollection): PlayerCardCollection {
  if (raw.decks && raw.decks.length > 0) {
    // Already in the new format — just make sure activeDeckId is valid.
    if (!raw.activeDeckId || !raw.decks.find((d) => d.id === raw.activeDeckId)) {
      return { ...raw, activeDeckId: raw.decks[0].id };
    }
    return raw;
  }

  const legacyIds = raw.activeDeckCardIds || [];
  const firstDeck: SavedDeck = {
    id: makeId("deck"),
    name: "我的主力",
    description: "從舊牌組自動建立",
    cardIds: legacyIds.slice(0, MAX_DECK_SIZE),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  return {
    ...raw,
    decks: [firstDeck],
    activeDeckId: firstDeck.id,
  };
}

interface CardContextType {
  collection: PlayerCardCollection | null;
  isLoading: boolean;
  cardImageMap: Record<string, string>;
  getCardDef: (cardId: string) => CardDefinition | undefined;
  drawSingle: (poolId: string) => Promise<CardDefinition | null>;
  drawMulti: (poolId: string) => Promise<CardDefinition[]>;
  strengthenWithCoins: (cardId: string) => boolean;

  // Multi-deck API
  /** Get the deck currently selected for battle, or undefined if none. */
  activeDeck: SavedDeck | undefined;
  /** Create a new empty deck, returns the new deck ID. Returns null if at max decks. */
  createDeck: (name: string) => string | null;
  /** Delete a deck. Refuses to delete the last remaining deck. */
  deleteDeck: (deckId: string) => void;
  /** Rename / update description / cover card. */
  updateDeckMeta: (deckId: string, patch: Partial<Pick<SavedDeck, "name" | "description" | "coverCardId">>) => void;
  /** Replace the cardIds for a deck. */
  updateDeckCards: (deckId: string, cardIds: string[]) => void;
  /** Select a deck as the one used for PvE / PvP battles. */
  setActiveDeck: (deckId: string) => void;
  /** Copy an existing deck into a new one. */
  duplicateDeck: (deckId: string) => string | null;

  refreshCollection: () => Promise<void>;
}

const CardContext = createContext<CardContextType | null>(null);

const NOOP_VALUE: CardContextType = {
  collection: null,
  isLoading: true,
  cardImageMap: {},
  getCardDef: () => undefined,
  drawSingle: async () => null,
  drawMulti: async () => [],
  strengthenWithCoins: () => false,
  activeDeck: undefined,
  createDeck: () => null,
  deleteDeck: () => {},
  updateDeckMeta: () => {},
  updateDeckCards: () => {},
  setActiveDeck: () => {},
  duplicateDeck: () => null,
  refreshCollection: async () => {},
};

export const useCards = (): CardContextType => {
  const context = useContext(CardContext);
  if (!context) return NOOP_VALUE;
  return context;
};

export const CardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { spendCoins, canAfford } = useCoin();
  const [collection, setCollection] = useState<PlayerCardCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cardImageUrls, setCardImageUrls] = useState<CardImageMap>({});

  // Load card image URLs from Firestore
  useEffect(() => {
    getCardImages().then((images) => {
      setCardImageUrls(images);
    });
  }, []);

  // Load or create collection
  useEffect(() => {
    if (!user) {
      setCollection(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    getCardCollection(user.id).then((data) => {
      if (data) {
        const migrated = migrateCollection(data);
        setCollection(migrated);
        // Persist migration if it changed anything
        if (migrated !== data) {
          saveCardCollection(user.id, migrated);
        }
      } else {
        // New player: generate starter collection + starter deck
        const starterCards = generateStarterDeck(BASIC_POOL_CARDS);
        const starterDeck: SavedDeck = {
          id: makeId("deck"),
          name: "我的主力",
          description: "初始牌組",
          cardIds: starterCards.slice(0, MAX_DECK_SIZE).map((c) => c.cardId),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        const newCollection: PlayerCardCollection = {
          userId: user.id,
          cards: starterCards,
          decks: [starterDeck],
          activeDeckId: starterDeck.id,
          totalDraws: 0,
          pityCounter: 0,
        };
        setCollection(newCollection);
        saveCardCollection(user.id, newCollection);
      }
      setIsLoading(false);
    });
  }, [user]);

  const save = useCallback(
    (col: PlayerCardCollection) => {
      setCollection(col);
      if (user) {
        saveCardCollection(user.id, col);
      }
    },
    [user]
  );

  /** Apply the Firestore-stored image URL override if the definition has none. */
  const hydrateImage = useCallback(
    (def: CardDefinition): CardDefinition => {
      const storedUrl = cardImageUrls[def.id];
      if (storedUrl && !def.imageUrl) {
        return { ...def, imageUrl: storedUrl };
      }
      return def;
    },
    [cardImageUrls]
  );

  const getCardDefFn = useCallback(
    (cardId: string) => {
      const def = CARD_MAP.get(cardId);
      if (!def) return undefined;
      return hydrateImage(def);
    },
    [hydrateImage]
  );

  const drawSingle = useCallback(
    async (poolId: string): Promise<CardDefinition | null> => {
      if (!collection) return null;
      const pools = getActivePools();
      const pool = pools.find((p) => p.id === poolId);
      if (!pool) return null;

      if (!canAfford(pool.singleDrawCost)) return null;
      const spent = spendCoins(pool.singleDrawCost, `卡牌單抽 - ${pool.name}`);
      if (!spent) return null;

      const { card, newPityCounter } = singleDraw(pool, ALL_CARDS, collection.pityCounter);
      if (!card) return null;

      const newCards = addCardToCollection(collection.cards, card.id);
      const updated: PlayerCardCollection = {
        ...collection,
        cards: newCards,
        totalDraws: collection.totalDraws + 1,
        pityCounter: newPityCounter,
        lastDrawAt: nowIso(),
      };
      save(updated);
      return hydrateImage(card);
    },
    [collection, canAfford, spendCoins, save, hydrateImage]
  );

  const drawMulti = useCallback(
    async (poolId: string): Promise<CardDefinition[]> => {
      if (!collection) return [];
      const pools = getActivePools();
      const pool = pools.find((p) => p.id === poolId);
      if (!pool) return [];

      if (!canAfford(pool.multiDrawCost)) return [];
      const spent = spendCoins(pool.multiDrawCost, `卡牌十連抽 - ${pool.name}`);
      if (!spent) return [];

      const { cards, newPityCounter } = multiDraw(
        pool,
        ALL_CARDS,
        collection.pityCounter,
        pool.multiDrawCount
      );

      let newCards = [...collection.cards];
      for (const card of cards) {
        newCards = addCardToCollection(newCards, card.id);
      }

      const updated: PlayerCardCollection = {
        ...collection,
        cards: newCards,
        totalDraws: collection.totalDraws + cards.length,
        pityCounter: newPityCounter,
        lastDrawAt: nowIso(),
      };
      save(updated);
      return cards.map(hydrateImage);
    },
    [collection, canAfford, spendCoins, save, hydrateImage]
  );

  const strengthenWithCoins = useCallback(
    (cardId: string): boolean => {
      if (!collection) return false;
      const cost = 50;
      if (!canAfford(cost)) return false;

      const card = collection.cards.find((c) => c.cardId === cardId);
      if (!card || card.level >= 10) return false;

      const spent = spendCoins(cost, `強化卡牌`);
      if (!spent) return false;

      const xpGain = cost * 2;
      const newXp = card.xp + xpGain;
      const needed = xpToNextLevel(card.level);
      const shouldLevelUp = needed > 0 && newXp >= needed;

      const updatedCards = collection.cards.map((c) =>
        c.cardId === cardId
          ? {
              ...c,
              xp: shouldLevelUp ? newXp - needed : newXp,
              level: shouldLevelUp ? Math.min(c.level + 1, 10) : c.level,
            }
          : c
      );

      save({ ...collection, cards: updatedCards });
      return true;
    },
    [collection, canAfford, spendCoins, save]
  );

  // === Multi-deck API ===

  const activeDeck = collection?.decks.find((d) => d.id === collection.activeDeckId);

  const createDeck = useCallback(
    (name: string): string | null => {
      if (!collection) return null;
      if (collection.decks.length >= MAX_DECKS) return null;
      const newDeck: SavedDeck = {
        id: makeId("deck"),
        name: name.trim() || `牌組 ${collection.decks.length + 1}`,
        cardIds: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      save({
        ...collection,
        decks: [...collection.decks, newDeck],
        activeDeckId: collection.activeDeckId || newDeck.id,
      });
      return newDeck.id;
    },
    [collection, save]
  );

  const deleteDeck = useCallback(
    (deckId: string) => {
      if (!collection) return;
      if (collection.decks.length <= 1) return; // refuse to leave player with zero decks
      const remaining = collection.decks.filter((d) => d.id !== deckId);
      const newActive =
        collection.activeDeckId === deckId ? remaining[0].id : collection.activeDeckId;
      save({
        ...collection,
        decks: remaining,
        activeDeckId: newActive,
      });
    },
    [collection, save]
  );

  const updateDeckMeta = useCallback(
    (deckId: string, patch: Partial<Pick<SavedDeck, "name" | "description" | "coverCardId">>) => {
      if (!collection) return;
      save({
        ...collection,
        decks: collection.decks.map((d) =>
          d.id === deckId ? { ...d, ...patch, updatedAt: nowIso() } : d
        ),
      });
    },
    [collection, save]
  );

  const updateDeckCards = useCallback(
    (deckId: string, cardIds: string[]) => {
      if (!collection) return;
      const clamped = cardIds.slice(0, MAX_DECK_SIZE);
      save({
        ...collection,
        decks: collection.decks.map((d) =>
          d.id === deckId ? { ...d, cardIds: clamped, updatedAt: nowIso() } : d
        ),
      });
    },
    [collection, save]
  );

  const setActiveDeck = useCallback(
    (deckId: string) => {
      if (!collection) return;
      if (!collection.decks.find((d) => d.id === deckId)) return;
      save({ ...collection, activeDeckId: deckId });
    },
    [collection, save]
  );

  const duplicateDeck = useCallback(
    (deckId: string): string | null => {
      if (!collection) return null;
      if (collection.decks.length >= MAX_DECKS) return null;
      const source = collection.decks.find((d) => d.id === deckId);
      if (!source) return null;
      const copy: SavedDeck = {
        ...source,
        id: makeId("deck"),
        name: `${source.name} (複製)`,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      save({
        ...collection,
        decks: [...collection.decks, copy],
      });
      return copy.id;
    },
    [collection, save]
  );

  const refreshCollection = useCallback(async () => {
    if (!user) return;
    const data = await getCardCollection(user.id);
    if (data) setCollection(migrateCollection(data));
  }, [user]);

  return (
    <CardContext.Provider
      value={{
        collection,
        isLoading,
        cardImageMap: cardImageUrls,
        getCardDef: getCardDefFn,
        drawSingle,
        drawMulti,
        strengthenWithCoins,
        activeDeck,
        createDeck,
        deleteDeck,
        updateDeckMeta,
        updateDeckCards,
        setActiveDeck,
        duplicateDeck,
        refreshCollection,
      }}
    >
      {children}
    </CardContext.Provider>
  );
};
