import Link from 'next/link';
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
      <div className="text-center">
        {/* Logo/Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-yellow-400 rounded-full">
            <svg className="w-12 h-12 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        {/* Brand Name */}
        <h1 className="text-6xl font-bold text-white mb-4">
          FlashPermit
        </h1>
        
        {/* Tagline */}
        <p className="text-2xl text-blue-100 mb-12">
          Building permits in 3 minutes
        </p>

        {/* CTA Button */}
        <Link href="/signup">
          <button className="bg-yellow-400 text-blue-900 px-8 py-4 rounded-lg text-xl font-bold hover:bg-yellow-300 transition-all transform hover:scale-105">
            Get Started
          </button>
        </Link>

        {/* Status Badge */}
        <div className="mt-12">
          <span className="bg-blue-700/50 text-white px-4 py-2 rounded-full text-sm">
            ⚡ Week 1, Day 1 - MVP in Progress
          </span>
        </div>
      </div>
    </div>
  );
}