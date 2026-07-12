import { NextRequest, NextResponse } from 'next/server';

import { getWorkflowConfig, saveWorkflowConfig } from '@/lib/workflow-config-storage';

export async function GET() {
  const config = await getWorkflowConfig();
  return NextResponse.json({
    success: true,
    config,
  });
}

export async function POST(request: NextRequest) {
  try {
    const newConfig = await request.json();

    // Validate required structure
    if (!newConfig.taskQuotas || !newConfig.scheduling) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid config structure. Must include taskQuotas and scheduling.',
        },
        { status: 400 }
      );
    }

    const savedConfig = await saveWorkflowConfig(newConfig);

    return NextResponse.json({
      success: true,
      message: 'Workflow config updated successfully',
      config: savedConfig,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid JSON in request body',
      },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const currentConfig = await getWorkflowConfig();
    const updates = await request.json();

    // Deep merge the updates
    const updatedConfig = mergeDeep(currentConfig, updates);

    const savedConfig = await saveWorkflowConfig(updatedConfig);

    return NextResponse.json({
      success: true,
      message: 'Workflow config updated successfully',
      config: savedConfig,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid JSON in request body',
      },
      { status: 400 }
    );
  }
}

// Helper function for deep merging objects
/* eslint-disable @typescript-eslint/no-explicit-any */
function mergeDeep(target: any, source: any): any {
  const output = Object.assign({}, target);

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}
