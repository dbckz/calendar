import { NextRequest, NextResponse } from 'next/server';
import { classifyTypes, type TypeClassifierTask } from '@/lib/type-classifier';
import { getTypeVerdicts } from '@/lib/user-data-storage';
import { buildExamplesBlock } from '@/lib/classifier-learning';

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

    // Dave's own Type decisions, fed back as few-shot examples. Filtered PER GROUP
    // to labels valid for that integration — a label from another workspace isn't
    // in this group's allowed set, so showing it would only invite invalid output.
    const verdicts = await getTypeVerdicts();
    const examplesFor = (allowedTypes: string[]): string => {
      const allowed = new Set(allowedTypes);
      return buildExamplesBlock(
        Object.entries(verdicts)
          .filter(([, v]) => allowed.has(v.type))
          .map(([key, v]) => ({ key, label: v.type, at: v.updatedAt })),
        {
          heading:
            'The person has already labelled these tasks himself — treat them as ground truth and label similar tasks the same way:',
          render: label => label,
        }
      );
    };

    const perGroup = await Promise.all(
      groups.map(g =>
        Array.isArray(g.tasks) && Array.isArray(g.allowedTypes)
          ? classifyTypes(g.allowedTypes, g.tasks, 180, examplesFor(g.allowedTypes))
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
