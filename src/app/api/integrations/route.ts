import { NextRequest, NextResponse } from 'next/server';
import {
  getIntegrations,
  addGoogleIntegration,
  addAsanaIntegration,
  updateIntegration,
  sanitizeIntegrations,
} from '@/lib/integration-storage';
import { GoogleIntegration, AsanaIntegration } from '@/types';

// POST - Create a new integration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, name, clientId, clientSecret } = body;

    if (!type || !name || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'type, name, clientId, and clientSecret are required' },
        { status: 400 }
      );
    }

    if (type !== 'google' && type !== 'asana') {
      return NextResponse.json(
        { error: 'type must be "google" or "asana"' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    if (type === 'google') {
      const integration: GoogleIntegration = {
        id,
        type: 'google',
        name,
        enabled: true,
        clientId,
        clientSecret,
        createdAt,
      };
      await addGoogleIntegration(integration);
    } else {
      const integration: AsanaIntegration = {
        id,
        type: 'asana',
        name,
        enabled: true,
        clientId,
        clientSecret,
        createdAt,
      };
      await addAsanaIntegration(integration);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error creating integration:', error);
    return NextResponse.json(
      { error: 'Failed to create integration' },
      { status: 500 }
    );
  }
}

// PUT - Update an existing integration (enable/disable, rename)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled, name, workspaceId } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (typeof name === 'string') updates.name = name;
    if (typeof workspaceId === 'string') updates.workspaceId = workspaceId;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    const updated = await updateIntegration(id, updates);

    if (!updated) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating integration:', error);
    return NextResponse.json(
      { error: 'Failed to update integration' },
      { status: 500 }
    );
  }
}

// GET - Get all integrations (sanitized)
export async function GET() {
  try {
    const settings = await getIntegrations();
    return NextResponse.json(sanitizeIntegrations(settings));
  } catch (error) {
    console.error('Error getting integrations:', error);
    return NextResponse.json(
      { googleIntegrations: [], asanaIntegrations: [] },
      { status: 500 }
    );
  }
}
