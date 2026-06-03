// Provides AI-generated card animation URLs (attack / draw reveal) keyed by
// cardId. Subscribes to Firestore so admin-generated URLs propagate live.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { CardAnimationData, onCardAnimationsChange } from '@/lib/firestore';

interface CardAnimationContextValue {
  animations: Record<string, CardAnimationData>;
  getAttackUrl: (cardId: string) => string | undefined;
  getDrawRevealUrl: (cardId: string) => string | undefined;
}

const CardAnimationContext = createContext<CardAnimationContextValue>({
  animations: {},
  getAttackUrl: () => undefined,
  getDrawRevealUrl: () => undefined,
});

export const CardAnimationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [animations, setAnimations] = useState<Record<string, CardAnimationData>>({});

  useEffect(() => {
    const unsub = onCardAnimationsChange(setAnimations);
    return () => unsub();
  }, []);

  return (
    <CardAnimationContext.Provider
      value={{
        animations,
        getAttackUrl: (id) => animations[id]?.attackUrl,
        getDrawRevealUrl: (id) => animations[id]?.drawRevealUrl,
      }}
    >
      {children}
    </CardAnimationContext.Provider>
  );
};

export const useCardAnimations = () => useContext(CardAnimationContext);
