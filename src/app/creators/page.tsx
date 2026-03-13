import Link from 'next/link';
import { OctopusMascot, RaccoonMascot } from '@/components/Mascots';

const creators = [
  { name: '이태용', email: 'taeyong.lee@saladlab.co', image: '/taeyong.png' },
  { name: '김원', email: 'one.kim@saladlab.co', image: '/one.png' },
  { name: '배준수', email: 'junsu.bae@saladlab.co', image: '/junsu.png' },
  { name: '안동혁', email: 'donghyeok.ahn@saladlab.co', image: '/donghyuk.png' },
];

export default function CreatorsPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <OctopusMascot size={48} />
            <h1 className="text-4xl font-black tracking-tight">
              만든 <span className="text-purple-500">사람들</span>
            </h1>
            <RaccoonMascot size={48} />
          </div>
          <p className="text-gray-400 mb-6">납짝을 만든 개발자들을 소개합니다</p>
          <img
            src="/core_family.png"
            alt="제작자 단체사진"
            className="mx-auto w-[280px] h-auto rounded-2xl border border-gray-800 shadow-lg"
          />
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {creators.map((c) => (
            <div
              key={c.name}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center text-center"
            >
              <img
                src={c.image}
                alt={c.name}
                className="w-20 h-20 rounded-full border-2 border-purple-500/30 mb-4 object-cover"
              />
              <h2 className="text-lg font-bold text-gray-100 mb-1">{c.name}</h2>
              <p className="text-xs text-gray-500">{c.email}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            &larr; 메인으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}
