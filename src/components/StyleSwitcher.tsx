'use client';

import { ArtStyle } from '@/lib/types';

interface Props {
  current: ArtStyle;
  onChange: (style: ArtStyle) => void;
  disabled?: boolean;
}

const STYLES: { id: ArtStyle; label: string; desc: string }[] = [
  { id: 'GRAPHIC_NOVEL_ILLUSTRATION', label: 'Graphic Novel', desc: 'Comic' },
  { id: 'SOFT_DIGITAL_PAINTING',      label: 'Watercolor',    desc: 'Watercolor' },
  { id: 'FLAT_VECTOR_ILLUSTRATION',   label: 'Flat Vector',   desc: 'Illustration' },
  { id: '3D_ANIMATED_FAMILY_FILM',    label: '3D Animation',  desc: '3D Animated' },
];

export default function StyleSwitcher({ current, onChange, disabled }: Props) {
  return (
    <div className="flex justify-center mb-6">
      <div className="inline-flex bg-gray-900 rounded-xl p-1 gap-1">
        {STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => onChange(style.id)}
            disabled={disabled}
            className={`
              px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              ${current === style.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <span>{style.label}</span>
            <span className="hidden sm:inline text-xs ml-1.5 opacity-60">{style.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
