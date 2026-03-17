import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";

export interface ThemeDefinition {
  id: string;
  name: string;
  label: string;
  price: number;
  preview: string; // primary color hex for preview swatch
  vars: Record<string, string>;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "amber",
    name: "Amber Classic",
    label: "琥珀經典",
    price: 0, // default, free
    preview: "#d4a056",
    vars: {
      "--terminal-bg": "#0d0a06",
      "--terminal-primary": "#d4a056",
      "--terminal-primary-dim": "#a67c3d",
      "--terminal-primary-glow": "rgba(212, 160, 86, 0.3)",
      "--terminal-secondary": "#8b6914",
      "--terminal-accent": "#e8c88a",
      "--terminal-highlight": "#fff3d4",
      "--terminal-red": "#cc6644",
      "--terminal-border": "rgba(212, 160, 86, 0.3)",
    },
  },
  {
    id: "matrix",
    name: "Matrix Green",
    label: "駭客綠",
    price: 30,
    preview: "#00ff88",
    vars: {
      "--terminal-bg": "#060d06",
      "--terminal-primary": "#00ff88",
      "--terminal-primary-dim": "#00aa55",
      "--terminal-primary-glow": "rgba(0, 255, 136, 0.3)",
      "--terminal-secondary": "#006633",
      "--terminal-accent": "#88ffbb",
      "--terminal-highlight": "#d4fff0",
      "--terminal-red": "#ff4444",
      "--terminal-border": "rgba(0, 255, 136, 0.3)",
    },
  },
  {
    id: "cyber",
    name: "Cyber Blue",
    label: "科幻藍",
    price: 30,
    preview: "#4dc9f6",
    vars: {
      "--terminal-bg": "#060a0d",
      "--terminal-primary": "#4dc9f6",
      "--terminal-primary-dim": "#2d8ab8",
      "--terminal-primary-glow": "rgba(77, 201, 246, 0.3)",
      "--terminal-secondary": "#1a6089",
      "--terminal-accent": "#8ae0ff",
      "--terminal-highlight": "#d4f3ff",
      "--terminal-red": "#ff6666",
      "--terminal-border": "rgba(77, 201, 246, 0.3)",
    },
  },
  {
    id: "sakura",
    name: "Sakura Pink",
    label: "櫻花粉",
    price: 30,
    preview: "#f5a0c0",
    vars: {
      "--terminal-bg": "#0d060a",
      "--terminal-primary": "#f5a0c0",
      "--terminal-primary-dim": "#c07090",
      "--terminal-primary-glow": "rgba(245, 160, 192, 0.3)",
      "--terminal-secondary": "#904060",
      "--terminal-accent": "#ffccdd",
      "--terminal-highlight": "#ffe8f0",
      "--terminal-red": "#ff5555",
      "--terminal-border": "rgba(245, 160, 192, 0.3)",
    },
  },
  {
    id: "neon",
    name: "Neon Purple",
    label: "霓虹紫",
    price: 30,
    preview: "#b388ff",
    vars: {
      "--terminal-bg": "#08060d",
      "--terminal-primary": "#b388ff",
      "--terminal-primary-dim": "#8055cc",
      "--terminal-primary-glow": "rgba(179, 136, 255, 0.3)",
      "--terminal-secondary": "#5533aa",
      "--terminal-accent": "#d4bbff",
      "--terminal-highlight": "#eedeff",
      "--terminal-red": "#ff6688",
      "--terminal-border": "rgba(179, 136, 255, 0.3)",
    },
  },
  {
    id: "ice",
    name: "Ice Silver",
    label: "冰銀白",
    price: 30,
    preview: "#c0d0e0",
    vars: {
      "--terminal-bg": "#0a0c0e",
      "--terminal-primary": "#c0d0e0",
      "--terminal-primary-dim": "#8899aa",
      "--terminal-primary-glow": "rgba(192, 208, 224, 0.3)",
      "--terminal-secondary": "#556677",
      "--terminal-accent": "#dde8f0",
      "--terminal-highlight": "#f0f5fa",
      "--terminal-red": "#ee6655",
      "--terminal-border": "rgba(192, 208, 224, 0.3)",
    },
  },
];

interface ThemeContextType {
  currentTheme: ThemeDefinition;
  purchasedThemes: string[];
  setTheme: (themeId: string) => void;
  purchaseTheme: (themeId: string) => void;
  hasTheme: (themeId: string) => boolean;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    // SSR-safe defaults
    return {
      currentTheme: THEMES[0],
      purchasedThemes: ["amber"],
      setTheme: () => {},
      purchaseTheme: () => {},
      hasTheme: (id: string) => id === "amber",
    };
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currentThemeId, setCurrentThemeId] = useState("amber");
  const [purchasedThemes, setPurchasedThemes] = useState<string[]>(["amber"]);

  // Load from localStorage per user
  useEffect(() => {
    if (user) {
      const savedTheme = localStorage.getItem(`theme_active_${user.id}`);
      const savedPurchased = localStorage.getItem(`theme_purchased_${user.id}`);
      if (savedTheme) setCurrentThemeId(savedTheme);
      if (savedPurchased) {
        try {
          const parsed = JSON.parse(savedPurchased);
          if (Array.isArray(parsed)) setPurchasedThemes(parsed);
        } catch {}
      }
    }
  }, [user]);

  // Apply CSS variables when theme changes
  useEffect(() => {
    const theme = THEMES.find((t) => t.id === currentThemeId) || THEMES[0];
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    // Update legacy variable mappings
    root.style.setProperty("--terminal-green", "var(--terminal-primary)");
    root.style.setProperty("--terminal-green-dim", "var(--terminal-primary-dim)");
    root.style.setProperty("--terminal-green-glow", "var(--terminal-primary-glow)");
    root.style.setProperty("--terminal-amber", "var(--terminal-accent)");
    root.style.setProperty("--terminal-cyan", "var(--terminal-highlight)");
  }, [currentThemeId]);

  const setTheme = useCallback(
    (themeId: string) => {
      setCurrentThemeId(themeId);
      if (user) {
        localStorage.setItem(`theme_active_${user.id}`, themeId);
      }
    },
    [user]
  );

  const purchaseTheme = useCallback(
    (themeId: string) => {
      setPurchasedThemes((prev) => {
        if (prev.includes(themeId)) return prev;
        const updated = [...prev, themeId];
        if (user) {
          localStorage.setItem(`theme_purchased_${user.id}`, JSON.stringify(updated));
        }
        return updated;
      });
    },
    [user]
  );

  const hasTheme = useCallback(
    (themeId: string) => purchasedThemes.includes(themeId),
    [purchasedThemes]
  );

  const currentTheme = THEMES.find((t) => t.id === currentThemeId) || THEMES[0];

  return (
    <ThemeContext.Provider value={{ currentTheme, purchasedThemes, setTheme, purchaseTheme, hasTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
