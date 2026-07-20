import { NextRequest, NextResponse } from 'next/server';
import { classifyTypes, type TypeClassifierTask } from '@/lib/type-classifier';

interface IncomingGroup {
  integrationId: string;
  allowedTypes: string[];
  tasks: TypeClassifierTask[];
}

// POST { groups: [{ integrationId, allowedTypes: string[], tasks: [{ gid, title, description?, integrationName? }] }] }
// Suggest a "Type" label for each untyped task. Tasks are grouped by integration
// (the allowed Type labels differ per workspace); each group is classified in its
// own headless call, and the calls run concurrently. Returns { suggestions:
// [{ gid, type }] } where every `type` is one of that group's allowed labels.
// Nothing is written here — the wizard reviews suggestions before applying them.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const groups: IncomingGroup[] = Array.isArray(body?.groups) ? body.groups : [];
    if (groups.length === 0) {
      return NextResponse.json({ error: 'groups array is required' }, { status: 400 });
    }

    const perGroup = await Promise.all(
      groups.map(g =>
        Array.isArray(g.tasks) && Array.isArray(g.allowedTypes)
          ? classifyTypes(g.allowedTypes, g.tasks)
          : Promise.resolve([])
      )
    );

    return NextResponse.json({ suggestions: perGroup.flat() });
  } catch (error) {
    console.error('Error classifying task types:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to classify task types' },
      { status: 500 }
    );
  }
}
