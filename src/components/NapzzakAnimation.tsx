'use client';

import { useState, useEffect } from 'react';

export type Scene = 'smash' | 'dance' | 'run' | 'search' | 'paint';

// 공통 문어 SVG
function OctopusSVG() {
  return (
    <svg width="52" height="52" viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      <rect x="4" y="1" width="8" height="7" fill="#8B2FC9" />
      <rect x="3" y="2" width="10" height="5" fill="#8B2FC9" />
      <rect x="5" y="3" width="2" height="2" fill="#000" />
      <rect x="9" y="3" width="2" height="2" fill="#000" />
      <rect x="5" y="3" width="1" height="1" fill="#fff" />
      <rect x="9" y="3" width="1" height="1" fill="#fff" />
      <rect x="6" y="6" width="4" height="1" fill="#000" />
      <rect x="5" y="5" width="1" height="1" fill="#000" />
      <rect x="10" y="5" width="1" height="1" fill="#000" />
      <rect x="4" y="8" width="8" height="3" fill="#8B2FC9" />
      <rect x="2" y="9" width="2" height="4" fill="#7A1FB8" />
      <rect x="5" y="10" width="2" height="4" fill="#7A1FB8" />
      <rect x="9" y="10" width="2" height="4" fill="#7A1FB8" />
      <rect x="12" y="9" width="2" height="4" fill="#7A1FB8" />
      <rect x="2" y="13" width="2" height="1" fill="#6A15A0" />
      <rect x="5" y="14" width="2" height="1" fill="#6A15A0" />
      <rect x="9" y="14" width="2" height="1" fill="#6A15A0" />
      <rect x="12" y="13" width="2" height="1" fill="#6A15A0" />
    </svg>
  );
}

// 공통 너구리 SVG
function RaccoonSVG() {
  return (
    <svg width="68" height="68" viewBox="0 0 16 20" style={{ imageRendering: 'pixelated' }}>
      <rect x="4" y="0" width="8" height="4" fill="#888" />
      <rect x="3" y="1" width="10" height="3" fill="#999" />
      <rect x="6" y="1" width="4" height="1" fill="#F5A623" />
      <rect x="3" y="4" width="10" height="6" fill="#C8A882" />
      <rect x="3" y="5" width="4" height="3" fill="#555" />
      <rect x="9" y="5" width="4" height="3" fill="#555" />
      <rect x="4" y="6" width="2" height="1" fill="#fff" />
      <rect x="10" y="6" width="2" height="1" fill="#fff" />
      <rect x="5" y="6" width="1" height="1" fill="#4A90E2" />
      <rect x="10" y="6" width="1" height="1" fill="#4A90E2" />
      <rect x="7" y="8" width="2" height="1" fill="#333" />
      <rect x="3" y="10" width="10" height="5" fill="#4A90E2" />
      <rect x="4" y="11" width="8" height="3" fill="#357ABD" />
      <rect x="3" y="10" width="10" height="2" fill="#D0021B" />
      <rect x="1" y="10" width="2" height="4" fill="#C8A882" />
      <rect x="13" y="10" width="2" height="4" fill="#C8A882" />
      <rect x="4" y="15" width="3" height="4" fill="#8B6914" />
      <rect x="9" y="15" width="3" height="4" fill="#8B6914" />
    </svg>
  );
}

// 장면 1: 납짝 (망치)
export function SmashScene() {
  return (
    <>
      <style>{`
        @keyframes hammerSwing {
          0%, 30%   { transform: rotate(-40deg) translateY(-4px); }
          50%       { transform: rotate(10deg) translateY(4px); }
          55%       { transform: rotate(10deg) translateY(4px); }
          70%, 100% { transform: rotate(-40deg) translateY(-4px); }
        }
        @keyframes raccoonFlatten {
          0%, 45%   { transform: scaleY(1) translateY(0); }
          50%       { transform: scaleY(0.18) translateY(8px); }
          55%, 85%  { transform: scaleY(0.18) translateY(8px); }
          90%, 100% { transform: scaleY(1) translateY(0); }
        }
        @keyframes starsBurst {
          0%, 48%   { opacity: 0; transform: scale(0.5); }
          52%       { opacity: 1; transform: scale(1.2); }
          65%       { opacity: 1; transform: scale(1); }
          80%, 100% { opacity: 0; transform: scale(0.5); }
        }
        @keyframes octopusBounce {
          0%, 40%  { transform: translateY(0); }
          48%      { transform: translateY(6px); }
          54%      { transform: translateY(0); }
          100%     { transform: translateY(0); }
        }
        @keyframes smashText {
          0%, 47%  { opacity: 0; transform: scale(0.3) rotate(-10deg); }
          52%      { opacity: 1; transform: scale(1.3) rotate(-5deg); }
          62%      { opacity: 1; transform: scale(1) rotate(-3deg); }
          80%      { opacity: 0; transform: scale(0.8) rotate(-3deg); }
          100%     { opacity: 0; }
        }
        .hammer-anim     { animation: hammerSwing 2.4s ease-in-out infinite; transform-origin: bottom right; }
        .octopus-anim    { animation: octopusBounce 2.4s ease-in-out infinite; }
        .raccoon-anim    { animation: raccoonFlatten 2.4s ease-in-out infinite; transform-origin: center bottom; }
        .stars-anim      { animation: starsBurst 2.4s ease-in-out infinite; }
        .smash-text-anim { animation: smashText 2.4s ease-in-out infinite; }
      `}</style>

      <div className="relative flex items-end justify-center gap-1" style={{ height: 100, width: 180 }}>
        <div className="octopus-anim flex flex-col items-center" style={{ marginBottom: 8 }}>
          <div className="hammer-anim" style={{ marginRight: -10, marginBottom: -4 }}>
            <svg width="32" height="32" viewBox="0 0 10 10" style={{ imageRendering: 'pixelated' }}>
              <rect x="4" y="0" width="5" height="3" fill="#777" />
              <rect x="5" y="0" width="3" height="1" fill="#999" />
              <rect x="4" y="1" width="1" height="1" fill="#555" />
              <rect x="8" y="0" width="1" height="1" fill="#555" />
              <rect x="6" y="3" width="1" height="6" fill="#8B6914" />
              <rect x="6" y="8" width="2" height="1" fill="#6B5010" />
            </svg>
          </div>
          <OctopusSVG />
        </div>

        <div
          className="smash-text-anim absolute"
          style={{ top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
        >
          <span style={{
            fontFamily: 'monospace', fontWeight: 900, fontSize: 18, color: '#F5A623',
            textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
            letterSpacing: 1,
          }}>
            납짝!
          </span>
        </div>

        <div className="stars-anim absolute" style={{ bottom: 18, left: '50%', transform: 'translateX(-50%)' }}>
          <svg width="60" height="24" viewBox="0 0 30 12" style={{ imageRendering: 'pixelated' }}>
            <rect x="0" y="5" width="2" height="2" fill="#F5A623" />
            <rect x="1" y="4" width="2" height="1" fill="#F5A623" />
            <rect x="1" y="7" width="2" height="1" fill="#F5A623" />
            <rect x="10" y="1" width="2" height="2" fill="#F5A623" />
            <rect x="11" y="0" width="2" height="1" fill="#F5A623" />
            <rect x="11" y="3" width="2" height="1" fill="#F5A623" />
            <rect x="20" y="5" width="2" height="2" fill="#F5A623" />
            <rect x="21" y="4" width="2" height="1" fill="#F5A623" />
            <rect x="21" y="7" width="2" height="1" fill="#F5A623" />
            <rect x="27" y="2" width="2" height="2" fill="#FFD700" />
            <rect x="28" y="1" width="2" height="1" fill="#FFD700" />
            <rect x="28" y="4" width="2" height="1" fill="#FFD700" />
          </svg>
        </div>

        <div className="raccoon-anim" style={{ marginLeft: 4 }}>
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 장면 2: 춤추기
export function DanceScene() {
  return (
    <>
      <style>{`
        @keyframes danceBounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-12px); }
        }
        @keyframes danceSway {
          0%, 100% { transform: rotate(-8deg); }
          50%      { transform: rotate(8deg); }
        }
        @keyframes noteFloat {
          0%       { opacity: 0; transform: translateY(0) scale(0.5); }
          30%      { opacity: 1; transform: translateY(-8px) scale(1); }
          70%      { opacity: 1; transform: translateY(-16px) scale(1); }
          100%     { opacity: 0; transform: translateY(-24px) scale(0.5); }
        }
        .dance-left  { animation: danceBounce 0.8s ease-in-out infinite, danceSway 1.2s ease-in-out infinite; }
        .dance-right { animation: danceBounce 0.8s ease-in-out 0.2s infinite, danceSway 1.2s ease-in-out 0.3s infinite; }
        .note-anim-1 { animation: noteFloat 1.6s ease-out infinite; }
        .note-anim-2 { animation: noteFloat 1.6s ease-out 0.5s infinite; }
        .note-anim-3 { animation: noteFloat 1.6s ease-out 1.0s infinite; }
      `}</style>

      <div className="relative flex items-end justify-center gap-6" style={{ height: 100, width: 180 }}>
        <div className="note-anim-1 absolute" style={{ top: 0, left: 20 }}>
          <span style={{ fontSize: 16, color: '#F5A623' }}>&#9834;</span>
        </div>
        <div className="note-anim-2 absolute" style={{ top: 4, left: 90 }}>
          <span style={{ fontSize: 14, color: '#8B2FC9' }}>&#9835;</span>
        </div>
        <div className="note-anim-3 absolute" style={{ top: 2, right: 20 }}>
          <span style={{ fontSize: 16, color: '#4A90E2' }}>&#9834;</span>
        </div>

        <div className="dance-left" style={{ marginBottom: 8 }}>
          <OctopusSVG />
        </div>
        <div className="dance-right">
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 장면 3: 달리기
export function RunScene() {
  return (
    <>
      <style>{`
        @keyframes runBob {
          0%, 100% { transform: translateY(0) translateX(0); }
          25%      { transform: translateY(-4px) translateX(2px); }
          50%      { transform: translateY(0) translateX(4px); }
          75%      { transform: translateY(-4px) translateX(2px); }
        }
        @keyframes runBobDelay {
          0%, 100% { transform: translateY(0) translateX(0); }
          25%      { transform: translateY(-3px) translateX(2px); }
          50%      { transform: translateY(0) translateX(4px); }
          75%      { transform: translateY(-3px) translateX(2px); }
        }
        @keyframes dustPuff {
          0%       { opacity: 0; transform: translateX(0) scale(0.3); }
          20%      { opacity: 0.8; transform: translateX(-6px) scale(1); }
          60%      { opacity: 0.4; transform: translateX(-16px) scale(1.2); }
          100%     { opacity: 0; transform: translateX(-24px) scale(0.8); }
        }
        @keyframes speedLines {
          0%, 100% { opacity: 0; }
          30%, 70% { opacity: 0.6; }
        }
        .run-octopus { animation: runBob 0.5s ease-in-out infinite; }
        .run-raccoon { animation: runBobDelay 0.5s ease-in-out 0.1s infinite; }
        .dust-1      { animation: dustPuff 0.8s ease-out infinite; }
        .dust-2      { animation: dustPuff 0.8s ease-out 0.3s infinite; }
        .dust-3      { animation: dustPuff 0.8s ease-out 0.6s infinite; }
        .speed-lines { animation: speedLines 0.6s ease-in-out infinite; }
      `}</style>

      <div className="relative flex items-end justify-center gap-2" style={{ height: 100, width: 180 }}>
        {/* 속도선 */}
        <div className="speed-lines absolute" style={{ left: 4, top: 30 }}>
          <svg width="24" height="40" viewBox="0 0 12 20" style={{ imageRendering: 'pixelated' }}>
            <rect x="0" y="2" width="8" height="1" fill="#666" />
            <rect x="2" y="6" width="10" height="1" fill="#555" />
            <rect x="0" y="10" width="6" height="1" fill="#666" />
            <rect x="3" y="14" width="9" height="1" fill="#555" />
            <rect x="1" y="18" width="7" height="1" fill="#666" />
          </svg>
        </div>

        {/* 먼지 */}
        <div className="dust-1 absolute" style={{ bottom: 8, left: 20 }}>
          <svg width="12" height="12" viewBox="0 0 6 6" style={{ imageRendering: 'pixelated' }}>
            <rect x="1" y="1" width="2" height="2" fill="#888" opacity="0.6" />
            <rect x="3" y="2" width="2" height="2" fill="#777" opacity="0.4" />
          </svg>
        </div>
        <div className="dust-2 absolute" style={{ bottom: 14, left: 30 }}>
          <svg width="10" height="10" viewBox="0 0 5 5" style={{ imageRendering: 'pixelated' }}>
            <rect x="1" y="1" width="2" height="2" fill="#999" opacity="0.5" />
          </svg>
        </div>
        <div className="dust-3 absolute" style={{ bottom: 4, left: 40 }}>
          <svg width="8" height="8" viewBox="0 0 4 4" style={{ imageRendering: 'pixelated' }}>
            <rect x="1" y="1" width="2" height="2" fill="#888" opacity="0.5" />
          </svg>
        </div>

        <div className="run-octopus" style={{ marginBottom: 8 }}>
          <OctopusSVG />
        </div>
        <div className="run-raccoon">
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 장면 4: 검색/분석 (돋보기로 살펴보기)
export function SearchScene() {
  return (
    <>
      <style>{`
        @keyframes searchSway {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25%      { transform: translateX(6px) rotate(3deg); }
          75%      { transform: translateX(-6px) rotate(-3deg); }
        }
        @keyframes magnifyBob {
          0%, 100% { transform: translateY(0) rotate(-15deg); }
          50%      { transform: translateY(-6px) rotate(5deg); }
        }
        @keyframes thinkDots {
          0%, 20%  { opacity: 0; }
          30%, 70% { opacity: 1; }
          80%, 100% { opacity: 0; }
        }
        .search-octopus { animation: searchSway 2s ease-in-out infinite; }
        .search-glass   { animation: magnifyBob 1.4s ease-in-out infinite; }
        .think-dot-1    { animation: thinkDots 2s ease-in-out infinite; }
        .think-dot-2    { animation: thinkDots 2s ease-in-out 0.3s infinite; }
        .think-dot-3    { animation: thinkDots 2s ease-in-out 0.6s infinite; }
      `}</style>

      <div className="relative flex items-end justify-center gap-4" style={{ height: 100, width: 180 }}>
        {/* 생각 말풍선 점 */}
        <div className="absolute" style={{ top: 4, right: 30 }}>
          <span className="think-dot-1" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#F5A623', marginRight: 3 }} />
          <span className="think-dot-2" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#8B2FC9', marginRight: 3 }} />
          <span className="think-dot-3" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#4A90E2' }} />
        </div>

        <div className="search-octopus flex flex-col items-center" style={{ marginBottom: 8 }}>
          {/* 돋보기 */}
          <div className="search-glass" style={{ marginBottom: -4 }}>
            <svg width="28" height="28" viewBox="0 0 10 10" style={{ imageRendering: 'pixelated' }}>
              <rect x="2" y="1" width="4" height="1" fill="#F5A623" />
              <rect x="1" y="2" width="1" height="3" fill="#F5A623" />
              <rect x="6" y="2" width="1" height="3" fill="#F5A623" />
              <rect x="2" y="5" width="4" height="1" fill="#F5A623" />
              <rect x="3" y="2" width="2" height="3" fill="#87CEEB" opacity="0.5" />
              <rect x="5" y="5" width="1" height="1" fill="#F5A623" />
              <rect x="6" y="6" width="1" height="2" fill="#8B6914" />
              <rect x="7" y="7" width="1" height="2" fill="#8B6914" />
            </svg>
          </div>
          <OctopusSVG />
        </div>

        <div style={{ marginBottom: 0 }}>
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 장면 5: 그리기/페인팅 (붓으로 그리기)
export function PaintScene() {
  return (
    <>
      <style>{`
        @keyframes paintStroke {
          0%, 100% { transform: translateX(-4px) rotate(-10deg); }
          25%      { transform: translateX(4px) rotate(5deg); }
          50%      { transform: translateX(8px) rotate(-5deg); }
          75%      { transform: translateX(0px) rotate(8deg); }
        }
        @keyframes paintSplash1 {
          0%, 40%  { opacity: 0; transform: scale(0); }
          50%      { opacity: 1; transform: scale(1.2); }
          70%      { opacity: 1; transform: scale(1); }
          90%, 100% { opacity: 0; transform: scale(0.5); }
        }
        @keyframes paintSplash2 {
          0%, 50%  { opacity: 0; transform: scale(0); }
          60%      { opacity: 1; transform: scale(1.2); }
          80%      { opacity: 1; transform: scale(1); }
          95%, 100% { opacity: 0; transform: scale(0.5); }
        }
        @keyframes raccoonHold {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        .paint-octopus  { animation: paintStroke 1.6s ease-in-out infinite; }
        .paint-splash-1 { animation: paintSplash1 1.6s ease-in-out infinite; }
        .paint-splash-2 { animation: paintSplash2 1.6s ease-in-out 0.4s infinite; }
        .paint-raccoon  { animation: raccoonHold 1.6s ease-in-out infinite; }
      `}</style>

      <div className="relative flex items-end justify-center gap-2" style={{ height: 100, width: 180 }}>
        {/* 페인트 스플래시 */}
        <div className="paint-splash-1 absolute" style={{ top: 12, left: 60 }}>
          <svg width="16" height="16" viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
            <rect x="2" y="2" width="4" height="4" fill="#FF6B6B" />
            <rect x="3" y="1" width="2" height="1" fill="#FF6B6B" />
            <rect x="1" y="3" width="1" height="2" fill="#FF6B6B" />
          </svg>
        </div>
        <div className="paint-splash-2 absolute" style={{ top: 8, right: 40 }}>
          <svg width="14" height="14" viewBox="0 0 7 7" style={{ imageRendering: 'pixelated' }}>
            <rect x="2" y="2" width="3" height="3" fill="#4ECDC4" />
            <rect x="3" y="1" width="1" height="1" fill="#4ECDC4" />
            <rect x="1" y="3" width="1" height="1" fill="#4ECDC4" />
          </svg>
        </div>

        <div className="paint-octopus flex flex-col items-center" style={{ marginBottom: 8 }}>
          {/* 붓 */}
          <div style={{ marginBottom: -2 }}>
            <svg width="24" height="28" viewBox="0 0 8 10" style={{ imageRendering: 'pixelated' }}>
              <rect x="3" y="0" width="2" height="3" fill="#FF6B6B" />
              <rect x="2" y="0" width="1" height="2" fill="#E55555" />
              <rect x="5" y="0" width="1" height="2" fill="#E55555" />
              <rect x="3" y="3" width="2" height="1" fill="#C0C0C0" />
              <rect x="3" y="4" width="2" height="5" fill="#8B6914" />
            </svg>
          </div>
          <OctopusSVG />
        </div>

        {/* 캔버스를 들고 있는 너구리 */}
        <div className="paint-raccoon flex flex-col items-center">
          <div style={{ marginBottom: -2 }}>
            <svg width="32" height="24" viewBox="0 0 16 12" style={{ imageRendering: 'pixelated' }}>
              <rect x="1" y="1" width="14" height="10" fill="#fff" />
              <rect x="0" y="0" width="16" height="1" fill="#8B6914" />
              <rect x="0" y="11" width="16" height="1" fill="#8B6914" />
              <rect x="0" y="0" width="1" height="12" fill="#8B6914" />
              <rect x="15" y="0" width="1" height="12" fill="#8B6914" />
              {/* 캔버스 위 그림 */}
              <rect x="3" y="3" width="4" height="3" fill="#87CEEB" />
              <rect x="8" y="4" width="3" height="4" fill="#4CAF50" />
              <rect x="5" y="5" width="2" height="3" fill="#F5A623" />
            </svg>
          </div>
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 장면 6: 박스 운반 (업로드 완료)
export function CarryScene() {
  return (
    <>
      <style>{`
        @keyframes carryWalk {
          0%, 100% { transform: translateY(0) translateX(0); }
          25%      { transform: translateY(-3px) translateX(2px); }
          50%      { transform: translateY(0) translateX(4px); }
          75%      { transform: translateY(-3px) translateX(2px); }
        }
        @keyframes carryWalkDelay {
          0%, 100% { transform: translateY(0) translateX(0); }
          25%      { transform: translateY(-2px) translateX(2px); }
          50%      { transform: translateY(0) translateX(4px); }
          75%      { transform: translateY(-2px) translateX(2px); }
        }
        @keyframes boxBob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25%      { transform: translateY(-2px) rotate(1deg); }
          75%      { transform: translateY(-2px) rotate(-1deg); }
        }
        .carry-left  { animation: carryWalk 0.7s ease-in-out infinite; }
        .carry-right { animation: carryWalkDelay 0.7s ease-in-out 0.15s infinite; }
        .carry-box   { animation: boxBob 0.7s ease-in-out infinite; }
      `}</style>

      <div className="relative flex items-end justify-center" style={{ height: 100, width: 180 }}>
        {/* 박스 */}
        <div className="carry-box absolute" style={{ top: 6, left: '50%', transform: 'translateX(-50%)' }}>
          <svg width="60" height="44" viewBox="0 0 20 14" style={{ imageRendering: 'pixelated' }}>
            <rect x="1" y="2" width="18" height="11" fill="#C8956B" />
            <rect x="0" y="0" width="20" height="3" fill="#D4A574" />
            <rect x="8" y="0" width="4" height="14" fill="#A67B5B" />
            <rect x="6" y="1" width="8" height="1" fill="#8B6914" />
            <rect x="2" y="4" width="6" height="4" fill="#B8855A" />
            <rect x="12" y="4" width="6" height="4" fill="#B8855A" />
          </svg>
        </div>

        <div className="carry-left" style={{ marginBottom: 0, marginRight: 30 }}>
          <OctopusSVG />
        </div>
        <div className="carry-right" style={{ marginBottom: 0, marginLeft: 30 }}>
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 장면 7: 마이크 노래 + 헤드셋 듣기 (대사 추출)
export function MicScene() {
  return (
    <>
      <style>{`
        @keyframes singBounce {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25%      { transform: translateY(-6px) rotate(-3deg); }
          75%      { transform: translateY(-6px) rotate(3deg); }
        }
        @keyframes listenNod {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-2px) rotate(3deg); }
        }
        @keyframes singNote1 {
          0%       { opacity: 0; transform: translateY(0) translateX(0) scale(0.5); }
          30%      { opacity: 1; transform: translateY(-10px) translateX(4px) scale(1); }
          70%      { opacity: 1; transform: translateY(-20px) translateX(-2px) scale(1); }
          100%     { opacity: 0; transform: translateY(-28px) translateX(6px) scale(0.5); }
        }
        @keyframes singNote2 {
          0%       { opacity: 0; transform: translateY(0) translateX(0) scale(0.5); }
          30%      { opacity: 1; transform: translateY(-8px) translateX(-4px) scale(1); }
          70%      { opacity: 1; transform: translateY(-18px) translateX(2px) scale(1); }
          100%     { opacity: 0; transform: translateY(-26px) translateX(-4px) scale(0.5); }
        }
        .sing-octopus { animation: singBounce 0.8s ease-in-out infinite; }
        .listen-raccoon { animation: listenNod 1.2s ease-in-out infinite; }
        .sing-note-1 { animation: singNote1 1.4s ease-out infinite; }
        .sing-note-2 { animation: singNote2 1.4s ease-out 0.5s infinite; }
      `}</style>

      <div className="relative flex items-end justify-center gap-4" style={{ height: 100, width: 180 }}>
        {/* 음표 */}
        <div className="sing-note-1 absolute" style={{ top: 2, left: 30 }}>
          <span style={{ fontSize: 14, color: '#F5A623' }}>&#9835;</span>
        </div>
        <div className="sing-note-2 absolute" style={{ top: 6, left: 50 }}>
          <span style={{ fontSize: 12, color: '#8B2FC9' }}>&#9834;</span>
        </div>

        {/* 문어 + 마이크 */}
        <div className="sing-octopus flex flex-col items-center" style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: -6 }}>
            <svg width="20" height="32" viewBox="0 0 7 12" style={{ imageRendering: 'pixelated' }}>
              <rect x="3" y="0" width="1" height="1" fill="#888" />
              <rect x="2" y="1" width="3" height="3" fill="#666" />
              <rect x="1" y="1" width="1" height="2" fill="#777" />
              <rect x="5" y="1" width="1" height="2" fill="#777" />
              <rect x="3" y="4" width="1" height="6" fill="#aaa" />
              <rect x="1" y="10" width="5" height="1" fill="#888" />
            </svg>
          </div>
          <OctopusSVG />
        </div>

        {/* 너구리 + 헤드셋 */}
        <div className="listen-raccoon flex flex-col items-center">
          <div style={{ marginBottom: -8, marginLeft: -2 }}>
            <svg width="36" height="14" viewBox="0 0 18 7" style={{ imageRendering: 'pixelated' }}>
              <rect x="3" y="0" width="12" height="2" fill="#333" />
              <rect x="1" y="1" width="3" height="4" fill="#444" />
              <rect x="14" y="1" width="3" height="4" fill="#444" />
              <rect x="0" y="2" width="2" height="3" fill="#4A90E2" />
              <rect x="16" y="2" width="2" height="3" fill="#4A90E2" />
            </svg>
          </div>
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 장면 8: 열쇠 뽑기 (키프레임 추출)
export function KeyScene() {
  return (
    <>
      <style>{`
        @keyframes pullLeft {
          0%, 100% { transform: translateX(0) translateY(0); }
          30%      { transform: translateX(-6px) translateY(-2px); }
          60%      { transform: translateX(-3px) translateY(0); }
        }
        @keyframes pullRight {
          0%, 100% { transform: translateX(0) translateY(0); }
          30%      { transform: translateX(6px) translateY(-2px); }
          60%      { transform: translateX(3px) translateY(0); }
        }
        @keyframes keyWiggle {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          20%      { transform: rotate(-3deg) translateY(-1px); }
          40%      { transform: rotate(3deg) translateY(-2px); }
          60%      { transform: rotate(-2deg) translateY(-1px); }
        }
        @keyframes groundShake {
          0%, 100% { opacity: 0; }
          20%, 60% { opacity: 1; }
        }
        .pull-left    { animation: pullLeft 1.2s ease-in-out infinite; }
        .pull-right   { animation: pullRight 1.2s ease-in-out infinite; }
        .key-wiggle   { animation: keyWiggle 1.2s ease-in-out infinite; }
        .ground-shake { animation: groundShake 1.2s ease-in-out infinite; }
      `}</style>

      <div className="relative flex items-end justify-center" style={{ height: 110, width: 200 }}>
        {/* 큰 열쇠 (땅에 박힌) */}
        <div className="key-wiggle absolute" style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)' }}>
          <svg width="40" height="70" viewBox="0 0 14 24" style={{ imageRendering: 'pixelated' }}>
            {/* 열쇠 머리 (원형) */}
            <rect x="3" y="0" width="8" height="2" fill="#F5A623" />
            <rect x="2" y="1" width="10" height="6" fill="#F5A623" />
            <rect x="3" y="7" width="8" height="1" fill="#F5A623" />
            {/* 열쇠 구멍 */}
            <rect x="5" y="3" width="4" height="3" fill="#C88A1A" />
            {/* 열쇠 몸통 */}
            <rect x="6" y="8" width="2" height="10" fill="#F5A623" />
            {/* 열쇠 이빨 */}
            <rect x="8" y="14" width="3" height="2" fill="#F5A623" />
            <rect x="8" y="17" width="2" height="2" fill="#F5A623" />
            {/* 땅 */}
            <rect x="0" y="20" width="14" height="4" fill="#555" />
            <rect x="4" y="18" width="6" height="3" fill="#666" />
          </svg>
        </div>

        {/* 흔들림 이펙트 */}
        <div className="ground-shake absolute" style={{ bottom: 2, left: '50%', transform: 'translateX(-50%)' }}>
          <svg width="80" height="8" viewBox="0 0 40 4" style={{ imageRendering: 'pixelated' }}>
            <rect x="2" y="1" width="4" height="1" fill="#888" />
            <rect x="10" y="2" width="3" height="1" fill="#777" />
            <rect x="27" y="1" width="4" height="1" fill="#888" />
            <rect x="34" y="2" width="3" height="1" fill="#777" />
          </svg>
        </div>

        {/* 문어 (왼쪽에서 당기기) */}
        <div className="pull-left absolute" style={{ bottom: 16, left: 10 }}>
          <OctopusSVG />
        </div>

        {/* 너구리 (오른쪽에서 당기기) */}
        <div className="pull-right absolute" style={{ bottom: 8, right: 10 }}>
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 메인페이지용: 좌우 마스코트 폴짝 + 가운데 납짝 글자
export function MainBounceAnimation({ className = '' }: { className?: string }) {
  return (
    <>
      <style>{`
        @keyframes hopLeft {
          0%, 100% { transform: translateY(0); }
          30%      { transform: translateY(-14px); }
          50%      { transform: translateY(0); }
        }
        @keyframes hopRight {
          0%, 100% { transform: translateY(0); }
          40%      { transform: translateY(-14px); }
          60%      { transform: translateY(0); }
        }
        @keyframes titlePulse {
          0%, 100% { transform: scale(1); }
          35%      { transform: scale(1.06); }
          55%      { transform: scale(1.06); }
          70%      { transform: scale(1); }
        }
        .hop-left  { animation: hopLeft 1.8s ease-in-out infinite; }
        .hop-right { animation: hopRight 1.8s ease-in-out infinite; }
        .title-pulse { animation: titlePulse 1.8s ease-in-out infinite; }
      `}</style>

      <div className={`flex items-center justify-center gap-5 select-none ${className}`}>
        <div className="hop-left">
          <OctopusSVG />
        </div>
        <div className="title-pulse">
          <h1 className="text-6xl font-black tracking-tight">
            납<span className="text-purple-500">짝</span>
          </h1>
        </div>
        <div className="hop-right">
          <RaccoonSVG />
        </div>
      </div>
    </>
  );
}

// 단계별 씬 선택 헬퍼
export function StageAnimation({ step }: { step: number }) {
  // 0: 박스 운반 (업로드 완료)
  // 1: 마이크+헤드셋 (대사 추출)
  // 2: 열쇠 뽑기 (키프레임 추출)
  // 3-5: 검색/분석 (Step A/B/C)
  // 6-7: 망치/납짝 (검증/설계)
  // 8-9: 그리기 (이미지 생성)
  // 10: 댄스 (완성)
  if (step === 0) return <CarryScene />;
  if (step === 1) return <MicScene />;
  if (step === 2) return <KeyScene />;
  if (step <= 5) return <SearchScene />;
  if (step <= 7) return <SmashScene />;
  if (step <= 9) return <PaintScene />;
  return <DanceScene />;
}

export default function NapzzakAnimation({ className = '', scene: forcedScene }: { className?: string; scene?: Scene }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const SCENES: Scene[] = ['smash', 'dance', 'run', 'search', 'paint'];

  useEffect(() => {
    if (forcedScene) return;
    const timer = setInterval(() => {
      setSceneIndex((prev) => (prev + 1) % SCENES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [forcedScene]);

  const scene = forcedScene || SCENES[sceneIndex];

  return (
    <div className={`flex flex-col items-center gap-2 select-none ${className}`}>
      {scene === 'smash' && <SmashScene />}
      {scene === 'dance' && <DanceScene />}
      {scene === 'run' && <RunScene />}
      {scene === 'search' && <SearchScene />}
      {scene === 'paint' && <PaintScene />}
    </div>
  );
}
