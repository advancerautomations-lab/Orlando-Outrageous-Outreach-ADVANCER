import React, { useState, useEffect } from 'react';

interface FunnelStep {
  label: string;
  count: number;
}

interface Props {
  steps: FunnelStep[];
}

const FunnelChart: React.FC<Props> = ({ steps }) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  if (steps.length === 0) return null;

  const maxCount = steps[0].count || 1;

  return (
    <div className="glass-card rounded-2xl p-6 mb-6" role="img" aria-label={`Email sequence funnel: ${steps.map(s => `${s.label} ${s.count} sent`).join(', ')}`}>
      <h3 className="font-serif font-bold text-lg mb-5">Sequence Drop-off</h3>

      <div className="flex items-end gap-3" style={{ height: '140px' }}>
        {steps.map((step, idx) => {
          const percentage = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
          const minHeight = 20;

          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              {/* Bar */}
              <div className="w-full flex flex-col items-center justify-end flex-1">
                <div
                  className="w-full bg-[#522B47] rounded-t-lg transition-all duration-500 ease-out relative group"
                  style={{
                    height: animated ? `${Math.max(percentage, minHeight)}%` : '0%',
                    opacity: Math.max(0.3, percentage / 100),
                    transitionDelay: `${idx * 80}ms`,
                  }}
                >
                  {/* Count inside bar */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{step.count}</span>
                  </div>
                </div>
              </div>

              {/* Label */}
              <div className="text-center flex-shrink-0">
                <p className="text-[10px] font-medium text-gray-700 leading-tight line-clamp-1 max-w-[80px] mx-auto">
                  {step.label}
                </p>
                <p className="text-[10px] text-gray-400 font-medium">
                  {percentage.toFixed(0)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FunnelChart;
