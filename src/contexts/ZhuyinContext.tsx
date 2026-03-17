import { createContext, useContext, useState, ReactNode, useEffect } from "react";

type FontSize = "small" | "medium" | "large";

interface ZhuyinContextType {
  zhuyinMode: boolean;
  setZhuyinMode: (value: boolean) => void;
  fontSize: FontSize;
  setFontSize: (value: FontSize) => void;
}

const fontSizeMap: Record<FontSize, string> = {
  small: "0.875rem",
  medium: "1rem",
  large: "1.25rem",
};

const ZhuyinContext = createContext<ZhuyinContextType>({
  zhuyinMode: false,
  setZhuyinMode: () => {},
  fontSize: "medium",
  setFontSize: () => {},
});

export const ZhuyinProvider = ({ children }: { children: ReactNode }) => {
  const [zhuyinMode, setZhuyinMode] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>("medium");

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--zhuyin-font-size",
      fontSizeMap[fontSize]
    );
  }, [fontSize]);

  return (
    <ZhuyinContext.Provider value={{ zhuyinMode, setZhuyinMode, fontSize, setFontSize }}>
      {children}
    </ZhuyinContext.Provider>
  );
};

export const useZhuyin = () => useContext(ZhuyinContext);

export default ZhuyinContext;
