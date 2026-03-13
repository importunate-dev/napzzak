'use client';

// 납짝 마스코트: 보라색 픽셀 문어 (납서) + 너구리 기사 (짝이)
// 픽셀 아트 스타일, img/ 폴더의 레퍼런스 기반

/** 보라색 픽셀 문어 마스코트 */
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
      {/* 머리 */}
      <rect x="4" y="1" width="8" height="7" fill="#8B2FC9" />
      <rect x="3" y="2" width="10" height="5" fill="#8B2FC9" />
      {/* 눈 흰자 */}
      <rect x="5" y="3" width="2" height="2" fill="#000" />
      <rect x="9" y="3" width="2" height="2" fill="#000" />
      {/* 눈 빛 */}
      <rect x="5" y="3" width="1" height="1" fill="#fff" />
      <rect x="9" y="3" width="1" height="1" fill="#fff" />
      {/* 입 */}
      <rect x="7" y="6" width="1" height="1" fill="#000" />
      <rect x="8" y="5" width="1" height="1" fill="#000" />
      {/* 몸통 */}
      <rect x="4" y="8" width="8" height="3" fill="#8B2FC9" />
      {/* 다리 1 */}
      <rect x="2" y="9" width="2" height="4" fill="#7A1FB8" />
      <rect x="2" y="13" width="2" height="1" fill="#6A15A0" />
      {/* 다리 2 */}
      <rect x="5" y="10" width="2" height="4" fill="#7A1FB8" />
      <rect x="5" y="14" width="2" height="1" fill="#6A15A0" />
      {/* 다리 3 */}
      <rect x="9" y="10" width="2" height="4" fill="#7A1FB8" />
      <rect x="9" y="14" width="2" height="1" fill="#6A15A0" />
      {/* 다리 4 */}
      <rect x="12" y="9" width="2" height="4" fill="#7A1FB8" />
      <rect x="12" y="13" width="2" height="1" fill="#6A15A0" />
      {/* 외곽선 강조 */}
      <rect x="3" y="1" width="10" height="1" fill="#000" />
      <rect x="2" y="2" width="1" height="5" fill="#000" />
      <rect x="13" y="2" width="1" height="5" fill="#000" />
    </svg>
  );
}

/** 너구리 기사 마스코트 (납짝 전) */
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
      {/* 투구 */}
      <rect x="4" y="0" width="8" height="4" fill="#888" />
      <rect x="3" y="1" width="10" height="3" fill="#999" />
      <rect x="5" y="0" width="6" height="1" fill="#aaa" />
      {/* 황금 장식 */}
      <rect x="6" y="1" width="4" height="1" fill="#F5A623" />
      {/* 너구리 얼굴 */}
      <rect x="3" y="4" width="10" height="6" fill="#C8A882" />
      {/* 눈 마스크 (너구리 특징) */}
      <rect x="3" y="5" width="4" height="3" fill="#555" />
      <rect x="9" y="5" width="4" height="3" fill="#555" />
      {/* 눈 */}
      <rect x="4" y="6" width="2" height="1" fill="#fff" />
      <rect x="10" y="6" width="2" height="1" fill="#fff" />
      <rect x="5" y="6" width="1" height="1" fill="#4A90E2" />
      <rect x="10" y="6" width="1" height="1" fill="#4A90E2" />
      {/* 코 */}
      <rect x="7" y="8" width="2" height="1" fill="#333" />
      {/* 입 */}
      <rect x="6" y="9" width="4" height="1" fill="#C8A882" />
      <rect x="6" y="9" width="1" height="1" fill="#999" />
      <rect x="9" y="9" width="1" height="1" fill="#999" />
      {/* 몸통 (파란 갑옷) */}
      <rect x="3" y="10" width="10" height="5" fill="#4A90E2" />
      <rect x="4" y="11" width="8" height="3" fill="#357ABD" />
      {/* 빨간 스카프 */}
      <rect x="3" y="10" width="10" height="2" fill="#D0021B" />
      {/* 팔 */}
      <rect x="1" y="10" width="2" height="4" fill="#C8A882" />
      <rect x="13" y="10" width="2" height="4" fill="#C8A882" />
      {/* 다리 */}
      <rect x="4" y="15" width="3" height="4" fill="#8B6914" />
      <rect x="9" y="15" width="3" height="4" fill="#8B6914" />
      {/* 꼬리 줄무늬 (너구리 특징) */}
      <rect x="1" y="14" width="1" height="3" fill="#888" />
      <rect x="1" y="15" width="1" height="1" fill="#444" />
      <rect x="1" y="17" width="1" height="1" fill="#444" />
    </svg>
  );
}

/** 납짝된 너구리 마스코트 */
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
      {/* 납짝한 너구리 몸통 */}
      <rect x="1" y="3" width="18" height="3" fill="#C8A882" />
      <rect x="0" y="4" width="20" height="2" fill="#B8976E" />
      {/* 납짝한 머리 */}
      <rect x="5" y="2" width="10" height="2" fill="#C8A882" />
      {/* 눈이 빙글빙글 (x 눈) */}
      <rect x="6" y="2" width="1" height="1" fill="#333" />
      <rect x="7" y="3" width="1" height="1" fill="#333" />
      <rect x="12" y="2" width="1" height="1" fill="#333" />
      <rect x="11" y="3" width="1" height="1" fill="#333" />
      {/* 혀 */}
      <rect x="9" y="4" width="2" height="1" fill="#FF6B6B" />
      {/* 납짝한 갑옷 */}
      <rect x="2" y="4" width="16" height="2" fill="#4A90E2" />
      {/* 빨간 스카프 납짝 */}
      <rect x="3" y="3" width="14" height="1" fill="#D0021B" />
      {/* 별 효과 */}
      <rect x="0" y="1" width="1" height="1" fill="#F5A623" />
      <rect x="2" y="0" width="1" height="1" fill="#F5A623" />
      <rect x="17" y="0" width="1" height="1" fill="#F5A623" />
      <rect x="19" y="1" width="1" height="1" fill="#F5A623" />
    </svg>
  );
}

/** 문어가 망치를 들고 있는 모습 */
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
      {/* 망치 자루 */}
      <rect x="14" y="4" width="1" height="8" fill="#8B6914" />
      {/* 망치 머리 */}
      <rect x="12" y="2" width="5" height="3" fill="#888" />
      <rect x="13" y="1" width="3" height="1" fill="#aaa" />
      {/* 문어 머리 */}
      <rect x="4" y="5" width="8" height="7" fill="#8B2FC9" />
      <rect x="3" y="6" width="10" height="5" fill="#8B2FC9" />
      {/* 눈 */}
      <rect x="5" y="7" width="2" height="2" fill="#000" />
      <rect x="9" y="7" width="2" height="2" fill="#000" />
      <rect x="5" y="7" width="1" height="1" fill="#fff" />
      <rect x="9" y="7" width="1" height="1" fill="#fff" />
      {/* 입 (웃는) */}
      <rect x="6" y="10" width="4" height="1" fill="#000" />
      <rect x="5" y="9" width="1" height="1" fill="#000" />
      <rect x="10" y="9" width="1" height="1" fill="#000" />
      {/* 몸통 */}
      <rect x="4" y="12" width="8" height="3" fill="#8B2FC9" />
      {/* 다리 */}
      <rect x="2" y="13" width="2" height="4" fill="#7A1FB8" />
      <rect x="5" y="14" width="2" height="4" fill="#7A1FB8" />
      <rect x="9" y="14" width="2" height="4" fill="#7A1FB8" />
      <rect x="13" y="13" width="2" height="3" fill="#7A1FB8" />
      {/* 팔 (망치 들기) */}
      <rect x="12" y="9" width="3" height="3" fill="#8B2FC9" />
    </svg>
  );
}
