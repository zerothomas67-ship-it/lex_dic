
import React from 'react';
import { ExampleSource } from '../types';

interface ExampleCardProps {
  example: ExampleSource;
}

const ExampleCard: React.FC<ExampleCardProps> = ({ example }) => {
  return (
    <div className="py-8 border-b border-stone-50 group last:border-0">
      <div className="mb-4">
        <p className="text-stone-800 text-2xl sm:text-3xl serif leading-relaxed">
          "{example.text}"
        </p>
        <p className="text-stone-400 text-lg mt-3 serif italic">
          {example.translation}
        </p>
      </div>
      <div className="mt-4">
        <span className="text-[9px] font-bold text-stone-300 uppercase tracking-[0.3em] transition-colors group-hover:text-stone-400">
          {example.sourceTitle || 'DAILY CONVERSATIONAL USAGE'}
        </span>
      </div>
    </div>
  );
};

export default ExampleCard;
