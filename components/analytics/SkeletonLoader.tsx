import React from 'react';

const Pulse = ({ className = '' }: { className?: string }) => (
  <div className={`bg-gray-200 animate-pulse rounded ${className}`} />
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({ rows = 6, cols = 6 }) => (
  <div className="glass-card rounded-2xl overflow-hidden" role="status" aria-label="Loading table data">
    {/* Header */}
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
      {Array.from({ length: cols }, (_, i) => (
        <Pulse key={i} className={`h-3 ${i === 0 ? 'w-8' : i === 1 ? 'w-32' : 'w-20'}`} />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }, (_, rowIdx) => (
      <div key={rowIdx} className="flex items-center gap-4 px-4 py-4 border-b border-gray-50">
        {Array.from({ length: cols }, (_, colIdx) => (
          <Pulse
            key={colIdx}
            className={`h-3 ${
              colIdx === 0 ? 'w-6' :
              colIdx === 1 ? (rowIdx % 2 === 0 ? 'w-28' : 'w-36') :
              colIdx === 2 ? 'w-24' :
              'w-16'
            }`}
          />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonCards: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div role="status" aria-label="Loading statistics">
    {/* Stat cards */}
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="glass-card p-5 rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <Pulse className="w-10 h-10 rounded-xl" />
            <Pulse className="h-3 w-20" />
          </div>
          <Pulse className="h-7 w-16 mb-2" />
          <Pulse className="h-2.5 w-24" />
        </div>
      ))}
    </div>
    {/* Chart area */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="glass-card p-6 rounded-2xl lg:col-span-2">
        <Pulse className="h-5 w-48 mb-6" />
        <Pulse className="h-[280px] w-full rounded-xl" />
      </div>
      <div className="glass-card p-6 rounded-2xl">
        <Pulse className="h-5 w-36 mb-6" />
        <Pulse className="h-[280px] w-full rounded-full mx-auto max-w-[200px]" />
      </div>
    </div>
  </div>
);

export const SkeletonPipeline: React.FC = () => (
  <div role="status" aria-label="Loading campaign data">
    {/* Funnel placeholder */}
    <div className="glass-card rounded-2xl p-6 mb-6">
      <Pulse className="h-5 w-40 mb-4" />
      <div className="flex items-end gap-3 h-32">
        {[100, 80, 60, 40].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <Pulse className="w-full rounded" style={{ height: `${h}%` }} />
            <Pulse className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
    {/* Pipeline cards */}
    {Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="flex items-stretch gap-4 mb-4">
        <div className="flex flex-col items-center">
          <Pulse className="w-10 h-10 rounded-full" />
          {i < 2 && <Pulse className="w-0.5 flex-1 mt-2" />}
        </div>
        <div className="flex-1">
          <div className="p-4 bg-white rounded-xl border border-gray-100">
            <Pulse className="h-4 w-48 mb-3" />
            <div className="flex gap-6">
              {Array.from({ length: 4 }, (_, j) => (
                <Pulse key={j} className="h-3 w-16" />
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }, (_, j) => (
                <Pulse key={j} className="h-2 w-full rounded-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);
