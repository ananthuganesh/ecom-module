"use client";

import React from "react";

const TickerBar = () => {
  const items = [...Array(8)];

  const TickerList = () => (
    <div
      className="flex items-center whitespace-nowrap shrink-0"
      style={{
        animation: "ticker 25s linear infinite",
        willChange: "transform",
      }}
    >
      {items.map((_, i) => (
        <div
          key={i}
          className="inline-flex items-center gap-4 px-7"
          style={{ height: "32px" }}
        >
          <span
            className="w-[4px] h-[4px] rounded-full bg-brand-red shrink-0"
            style={{ marginTop: 0 }}
          />
          <span
            className="text-[15px] font-bold text-red-500"
            style={{ lineHeight: 1, display: "inline-flex", alignItems: "center" }}
          >
            അർബൻ ആന
          </span>
          <span
            className="w-px bg-red-900/40 shrink-0"
            style={{ height: "16px", display: "inline-block" }}
          />
          <span
            className="text-[13px] font-extrabold tracking-[0.18em] text-white uppercase"
            style={{ lineHeight: 1, display: "inline-flex", alignItems: "center" }}
          >
            Urban Aana
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full overflow-hidden border-y border-white/[0.08] bg-black py-2 flex select-none">
      <TickerList />
      <TickerList />

      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
};

export default TickerBar;
