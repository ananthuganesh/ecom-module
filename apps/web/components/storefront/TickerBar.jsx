"use client";

import React from "react";

function TickerList() {
  const items = [...Array(8)];

  return (
    <div
      className="flex shrink-0 items-center whitespace-nowrap"
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
            className="h-[4px] w-[4px] shrink-0 rounded-full bg-brand-red"
            style={{ marginTop: 0 }}
          />
          <span
            className="text-[15px] font-bold text-red-500"
            style={{ lineHeight: 1, display: "inline-flex", alignItems: "center" }}
          >
            അർബൻ ആന
          </span>
          <span
            className="w-px shrink-0 bg-red-900/40"
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
}

const TickerBar = () => {
  return (
    <div className="flex w-full select-none overflow-hidden border-y border-white/[0.08] bg-black py-2">
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
