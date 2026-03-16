'use client';

// Napzzak mascots: Purple pixel octopus (Napseo) + Raccoon knight (Zzagi)
// Pixel art style, based on references in img/ folder

/** Purple pixel octopus mascot */
export function OctopusMascot({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Head */}
      <rect x="4" y="1" width="8" height="7" fill="#8B2FC9" />
      <rect x="3" y="2" width="10" height="5" fill="#8B2FC9" />
      {/* Eye whites */}
      <rect x="5" y="3" width="2" height="2" fill="#000" />
      <rect x="9" y="3" width="2" height="2" fill="#000" />
      {/* Eye highlights */}
      <rect x="5" y="3" width="1" height="1" fill="#fff" />
      <rect x="9" y="3" width="1" height="1" fill="#fff" />
      {/* Mouth */}
      <rect x="7" y="6" width="1" height="1" fill="#000" />
      <rect x="8" y="5" width="1" height="1" fill="#000" />
      {/* Body */}
      <rect x="4" y="8" width="8" height="3" fill="#8B2FC9" />
      {/* Leg 1 */}
      <rect x="2" y="9" width="2" height="4" fill="#7A1FB8" />
      <rect x="2" y="13" width="2" height="1" fill="#6A15A0" />
      {/* Leg 2 */}
      <rect x="5" y="10" width="2" height="4" fill="#7A1FB8" />
      <rect x="5" y="14" width="2" height="1" fill="#6A15A0" />
      {/* Leg 3 */}
      <rect x="9" y="10" width="2" height="4" fill="#7A1FB8" />
      <rect x="9" y="14" width="2" height="1" fill="#6A15A0" />
      {/* Leg 4 */}
      <rect x="12" y="9" width="2" height="4" fill="#7A1FB8" />
      <rect x="12" y="13" width="2" height="1" fill="#6A15A0" />
      {/* Outline emphasis */}
      <rect x="3" y="1" width="10" height="1" fill="#000" />
      <rect x="2" y="2" width="1" height="5" fill="#000" />
      <rect x="13" y="2" width="1" height="5" fill="#000" />
    </svg>
  );
}

/** Raccoon knight mascot (before Napzzak) */
export function RaccoonMascot({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 20"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Helmet */}
      <rect x="4" y="0" width="8" height="4" fill="#888" />
      <rect x="3" y="1" width="10" height="3" fill="#999" />
      <rect x="5" y="0" width="6" height="1" fill="#aaa" />
      {/* Gold decoration */}
      <rect x="6" y="1" width="4" height="1" fill="#F5A623" />
      {/* Raccoon face */}
      <rect x="3" y="4" width="10" height="6" fill="#C8A882" />
      {/* Eye mask (raccoon feature) */}
      <rect x="3" y="5" width="4" height="3" fill="#555" />
      <rect x="9" y="5" width="4" height="3" fill="#555" />
      {/* Eyes */}
      <rect x="4" y="6" width="2" height="1" fill="#fff" />
      <rect x="10" y="6" width="2" height="1" fill="#fff" />
      <rect x="5" y="6" width="1" height="1" fill="#4A90E2" />
      <rect x="10" y="6" width="1" height="1" fill="#4A90E2" />
      {/* Nose */}
      <rect x="7" y="8" width="2" height="1" fill="#333" />
      {/* Mouth */}
      <rect x="6" y="9" width="4" height="1" fill="#C8A882" />
      <rect x="6" y="9" width="1" height="1" fill="#999" />
      <rect x="9" y="9" width="1" height="1" fill="#999" />
      {/* Body (blue armor) */}
      <rect x="3" y="10" width="10" height="5" fill="#4A90E2" />
      <rect x="4" y="11" width="8" height="3" fill="#357ABD" />
      {/* Red scarf */}
      <rect x="3" y="10" width="10" height="2" fill="#D0021B" />
      {/* Arms */}
      <rect x="1" y="10" width="2" height="4" fill="#C8A882" />
      <rect x="13" y="10" width="2" height="4" fill="#C8A882" />
      {/* Legs */}
      <rect x="4" y="15" width="3" height="4" fill="#8B6914" />
      <rect x="9" y="15" width="3" height="4" fill="#8B6914" />
      {/* Tail stripes (raccoon feature) */}
      <rect x="1" y="14" width="1" height="3" fill="#888" />
      <rect x="1" y="15" width="1" height="1" fill="#444" />
      <rect x="1" y="17" width="1" height="1" fill="#444" />
    </svg>
  );
}

/** Flattened raccoon mascot */
export function RaccoonFlatMascot({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.4)}
      viewBox="0 0 20 8"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Flattened raccoon body */}
      <rect x="1" y="3" width="18" height="3" fill="#C8A882" />
      <rect x="0" y="4" width="20" height="2" fill="#B8976E" />
      {/* Flattened head */}
      <rect x="5" y="2" width="10" height="2" fill="#C8A882" />
      {/* Dizzy eyes (x eyes) */}
      <rect x="6" y="2" width="1" height="1" fill="#333" />
      <rect x="7" y="3" width="1" height="1" fill="#333" />
      <rect x="12" y="2" width="1" height="1" fill="#333" />
      <rect x="11" y="3" width="1" height="1" fill="#333" />
      {/* Tongue */}
      <rect x="9" y="4" width="2" height="1" fill="#FF6B6B" />
      {/* Flattened armor */}
      <rect x="2" y="4" width="16" height="2" fill="#4A90E2" />
      {/* Flattened red scarf */}
      <rect x="3" y="3" width="14" height="1" fill="#D0021B" />
      {/* Star effects */}
      <rect x="0" y="1" width="1" height="1" fill="#F5A623" />
      <rect x="2" y="0" width="1" height="1" fill="#F5A623" />
      <rect x="17" y="0" width="1" height="1" fill="#F5A623" />
      <rect x="19" y="1" width="1" height="1" fill="#F5A623" />
    </svg>
  );
}

/** Octopus holding a hammer */
export function OctopusWithHammer({ size = 56, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Hammer handle */}
      <rect x="14" y="4" width="1" height="8" fill="#8B6914" />
      {/* Hammer head */}
      <rect x="12" y="2" width="5" height="3" fill="#888" />
      <rect x="13" y="1" width="3" height="1" fill="#aaa" />
      {/* Octopus head */}
      <rect x="4" y="5" width="8" height="7" fill="#8B2FC9" />
      <rect x="3" y="6" width="10" height="5" fill="#8B2FC9" />
      {/* Eyes */}
      <rect x="5" y="7" width="2" height="2" fill="#000" />
      <rect x="9" y="7" width="2" height="2" fill="#000" />
      <rect x="5" y="7" width="1" height="1" fill="#fff" />
      <rect x="9" y="7" width="1" height="1" fill="#fff" />
      {/* Mouth (smiling) */}
      <rect x="6" y="10" width="4" height="1" fill="#000" />
      <rect x="5" y="9" width="1" height="1" fill="#000" />
      <rect x="10" y="9" width="1" height="1" fill="#000" />
      {/* Body */}
      <rect x="4" y="12" width="8" height="3" fill="#8B2FC9" />
      {/* Legs */}
      <rect x="2" y="13" width="2" height="4" fill="#7A1FB8" />
      <rect x="5" y="14" width="2" height="4" fill="#7A1FB8" />
      <rect x="9" y="14" width="2" height="4" fill="#7A1FB8" />
      <rect x="13" y="13" width="2" height="3" fill="#7A1FB8" />
      {/* Arm (holding hammer) */}
      <rect x="12" y="9" width="3" height="3" fill="#8B2FC9" />
    </svg>
  );
}
