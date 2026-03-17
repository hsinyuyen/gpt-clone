import React from "react";
import { useCoin } from "@/contexts/CoinContext";
import CoinRewardAnimation from "./CoinRewardAnimation";

const CoinRewardListener: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { recentReward } = useCoin();

  return (
    <>
      {children}
      {recentReward !== null && <CoinRewardAnimation amount={recentReward} />}
    </>
  );
};

export default CoinRewardListener;
