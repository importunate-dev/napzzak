'use client';

import { DialogueLanguage } from '@/lib/types';

interface Props {
  current: DialogueLanguage;
  onChange: (language: DialogueLanguage) => void;
  disabled?: boolean;
}

const LANGUAGES: { id: DialogueLanguage; label: string }[] = [
  { id: 'ko', label: 'KO' },
  { id: 'en', label: 'EN' },
];

export default function LanguageToggle({ current, onChange, disabled }: Props) {
  return (
    <div className="flex justify-center mb-6">
      <div className="inline-flex items-center gap-2">
        <span className="text-gray-500 text-xs mr-1">대사 언어</span>
        <div className="inline-flex bg-gray-900 rounded-lg p-0.5 gap-0.5">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => onChange(lang.id)}
              disabled={disabled}
              className={`
                px-3 py-1.5 rounded-md text-xs font-bold tracking-wider transition-all duration-200
                ${current === lang.id
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
