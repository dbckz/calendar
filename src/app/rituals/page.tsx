'use client';

import Link from 'next/link';
import { ArrowLeft, Repeat } from 'lucide-react';

const SECTIONS = [
  {
    title: 'Backlog grooming',
    description: 'Review and prioritise the product backlog to keep it healthy and actionable.',
  },
  {
    title: 'Sprint planning',
    description: 'Select work for the upcoming sprint and define the sprint goal.',
  },
  {
    title: 'Retrospective',
    description: 'Reflect on the last sprint — what went well, what to improve, and action items.',
  },
] as const;

export default function RitualsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Repeat className="w-5 h-5 text-indigo-600" />
              <h1 className="text-xl font-semibold text-gray-900">Rituals</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {section.title}
            </h2>
            <p className="text-sm text-gray-500">{section.description}</p>
          </section>
        ))}
      </main>
    </div>
  );
}
