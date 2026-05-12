'use client';

import { useState } from 'react';
import WorkflowConfig from './WorkflowConfig';

const SECTIONS = [
  {
    id: 'backlog-grooming',
    title: 'Backlog grooming',
    description: 'Review and prioritise the product backlog to keep it healthy and actionable.',
  },
  {
    id: 'sprint-planning',
    title: 'Sprint planning',
    description: 'Select work for the upcoming sprint and define the sprint goal.',
  },
  {
    id: 'retrospective',
    title: 'Retrospective',
    description: 'Reflect on the last sprint — what went well, what to improve, and action items.',
  },
] as const;

export function RitualsContent() {
  const [expandedSection, setExpandedSection] = useState<string | null>('sprint-planning');

  const toggleSection = (sectionId: string) => {
    setExpandedSection(expandedSection === sectionId ? null : sectionId);
  };

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      {SECTIONS.map((section) => (
        <section
          key={section.title}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <div 
            className="p-6 cursor-pointer hover:bg-gray-50"
            onClick={() => toggleSection(section.id)}
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  {section.title}
                </h2>
                <p className="text-sm text-gray-500">{section.description}</p>
              </div>
              <div className="text-gray-400">
                {expandedSection === section.id ? '▼' : '▶'}
              </div>
            </div>
          </div>
          
          {expandedSection === section.id && (
            <div className="border-t border-gray-200 bg-gray-50">
              {section.id === 'sprint-planning' && <WorkflowConfig />}
              {section.id === 'backlog-grooming' && (
                <div className="p-6">
                  <p className="text-gray-600">Backlog grooming functionality coming soon...</p>
                </div>
              )}
              {section.id === 'retrospective' && (
                <div className="p-6">
                  <p className="text-gray-600">Retrospective functionality coming soon...</p>
                </div>
              )}
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
