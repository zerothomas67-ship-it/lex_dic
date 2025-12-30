
import React from 'react';
import { ExampleSource } from '../types';

interface ExampleCardProps {
  example: ExampleSource;
}

const ExampleCard: React.FC<ExampleCardProps> = ({ example }) => {
  return (
    <div className="py-2 border-l-2 border-slate-100 pl-6 hover:border-red-900 transition-colors group">
      <div className="mb-2">
        <p className="text-slate-800 text-lg sm:text-xl serif leading-relaxed">
          "{example.text}"
        </p>
        <p className="text-slate-400 text-sm mt-1 serif italic">
          {example.translation}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest group-hover:text-red-900 transition-colors">
          {example.sourceTitle || 'LITERARY SOURCE'}
        </span>
        {example.sourceType === 'movie' && (
          <>
            <span className="h-[1px] w-4 bg-slate-100"></span>
            <span className="text-slate-300 text-[9px] font-medium uppercase tracking-widest">
              CINEMATIC CONTEXT
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default ExampleCard;
