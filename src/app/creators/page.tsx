import Link from 'next/link';
import { OctopusMascot, RaccoonMascot } from '@/components/Mascots';

const creators = [
  { name: 'Taeyong Lee', email: 'taeyong.lee@saladlab.co', image: '/taeyong.png' },
  { name: 'Won Kim', email: 'one.kim@saladlab.co', image: '/one.png' },
  { name: 'Junsu Bae', email: 'junsu.bae@saladlab.co', image: '/junsu.png' },
  { name: 'Donghyeok Ahn', email: 'donghyeok.ahn@saladlab.co', image: '/donghyuk.png' },
];

export default function CreatorsPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <OctopusMascot size={48} />
            <h1 className="text-4xl font-black tracking-tight">
              The <span className="text-purple-500">Creators</span>
            </h1>
            <RaccoonMascot size={48} />
          </div>
          <p className="text-gray-400 mb-6">Meet the developers behind Napzzak</p>
          <img
            src="/core_family.png"
            alt="Team photo"
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
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
