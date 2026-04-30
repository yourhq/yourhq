"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface SpendSparklineProps {
  data: { day: string; spend_usd: number }[];
}

export function SpendSparkline({ data }: SpendSparklineProps) {
  if (data.length < 2) return null;

  return (
    <div className="h-[40px] w-[52px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--status-info)"
                stopOpacity={0.3}
              />
              <stop
                offset="100%"
                stopColor="var(--status-info)"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="spend_usd"
            stroke="var(--status-info)"
            strokeWidth={1.5}
            fill="url(#spendFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
