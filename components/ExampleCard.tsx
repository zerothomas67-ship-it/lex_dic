
import React from 'react';
import { ExampleSource } from '../types';

interface ExampleCardProps {
  example: ExampleSource;
}

const ExampleCard: React.FC<ExampleCardProps> = ({ example }) => {
  return (
    <div className="py-3 sm:py-4 border-l-2 border-slate-100 pl-4 sm:pl-6 hover:border-red-900 transition-colors">
      <div className="mb-2">
        <p className="text-slate-800 text-base sm:text-lg serif leading-relaxed">
          "{example.text}"
        </p>
        <p className="text-slate-400 text-xs sm:text-sm mt-1 serif italic">
          {example.translation}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] sm:text-[10px] font-bold text-slate-300 uppercase tracking-widest">
          {example.sourceType}
        </span>
        <span className="h-[1px] w-3 sm:w-4 bg-slate-100"></span>
        <span className="text-slate-400 text-[9px] sm:text-[10px] font-medium uppercase tracking-wider truncate max-w-[150px] sm:max-w-none">
          {example.sourceTitle}
        </span>
      </div>
    </div>
  );
};

export default ExampleCard;
