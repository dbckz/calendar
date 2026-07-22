import { NextRequest, NextResponse } from 'next/server';
import { getIntegrations, deleteIntegration, sanitizeIntegrations } from '@/lib/integration-storage';

export async function GET() {
  try {
    // Get current settings from file storage
    const settings = await getIntegrations();

    // Return sanitized settings (no secrets)
    return NextResponse.json(sanitizeIntegrations(settings));
  } catch (error) {
    console.error('Error getting settings:', error);
    return NextResponse.json({
      googleIntegrations: [],
      asanaIntegrations: [],
    });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const integrationId = searchParams.get('integrationId');

  if (!integrationId) {
    return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
  }

  try {
    const deleted = await deleteIntegration(integrationId);

    if (!deleted) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting integration:', error);
    return NextResponse.json({ error: 'Failed to delete integration' }, { status: 500 });
  }
}
