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
  PlayerCard,
  PlayerCardCollection,
  CardDefinition,
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

interface CardContextType {
  collection: PlayerCardCollection | null;
  isLoading: boolean;
  cardImageMap: Record<string, string>;
  getCardDef: (cardId: string) => CardDefinition | undefined;
  drawSingle: (poolId: string) => Promise<CardDefinition | null>;
  drawMulti: (poolId: string) => Promise<CardDefinition[]>;
  strengthenWithCoins: (cardId: string) => boolean;
  updateDeck: (cardIds: string[]) => void;
  refreshCollection: () => Promise<void>;
}

const CardContext = createContext<CardContextType | null>(null);

export const useCards = (): CardContextType => {
  const context = useContext(CardContext);
  if (!context) {
    return {
      collection: null,
      isLoading: true,
      cardImageMap: {},
      getCardDef: () => undefined,
      drawSingle: async () => null,
      drawMulti: async () => [],
      strengthenWithCoins: () => false,
      updateDeck: () => {},
      refreshCollection: async () => {},
    };
  }
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
        setCollection(data);
      } else {
        // New player: generate starter deck
        const starterCards = generateStarterDeck(BASIC_POOL_CARDS);
        const newCollection: PlayerCardCollection = {
          userId: user.id,
          cards: starterCards,
          activeDeckCardIds: starterCards.slice(0, 20).map((c) => c.cardId),
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

  const getCardDefFn = useCallback((cardId: string) => {
    const def = CARD_MAP.get(cardId);
    if (!def) return undefined;
    return hydrateImage(def);
  }, [hydrateImage]);

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
        lastDrawAt: new Date().toISOString(),
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
        lastDrawAt: new Date().toISOString(),
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

      const xpGain = cost * 2; // 1 coin = 2 XP
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

  const updateDeck = useCallback(
    (cardIds: string[]) => {
      if (!collection) return;
      const updatedCards = collection.cards.map((c) => ({
        ...c,
        isInDeck: cardIds.includes(c.cardId),
      }));
      save({
        ...collection,
        cards: updatedCards,
        activeDeckCardIds: cardIds,
      });
    },
    [collection, save]
  );

  const refreshCollection = useCallback(async () => {
    if (!user) return;
    const data = await getCardCollection(user.id);
    if (data) setCollection(data);
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
        updateDeck,
        refreshCollection,
      }}
    >
      {children}
    </CardContext.Provider>
  );
};
