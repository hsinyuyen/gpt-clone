import React from "react";
import Sidebar from "./Sidebar";

const MobileSiderbar = (props: any) => {
  const { toggleComponentVisibility } = props;

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80"
        onClick={toggleComponentVisibility}
      />

      {/* Sidebar Panel */}
      <div className="relative flex w-full max-w-xs flex-1 flex-col bg-[var(--terminal-bg)] border-r border-[var(--terminal-green)] boot-animation">
        {/* Close Button */}
        <div className="absolute top-2 right-2 z-10">
          <button
            type="button"
            className="terminal-btn text-xs py-1 px-2"
            onClick={toggleComponentVisibility}
          >
            [×] CLOSE
          </button>
        </div>

        <Sidebar />
      </div>

      <div className="w-14 flex-shrink-0" />
    </div>
  );
};

export default MobileSiderbar;
