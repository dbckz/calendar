import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'workflow-config.json');

// Default config structure
const DEFAULT_CONFIG = {
  taskQuotas: {
    'Writing/Deep Work': {
      weeklyCount: 3,
      targetLength: '2h',
      preferredTimes: ['09:00-11:00', '21:00-23:00']
    },
    'Blogs': {
      weeklyCount: 2,
      targetLength: '1.5h',
      preferredTimes: ['09:00-12:00']
    },
    'Batch': {
      weeklyCount: 2,
      targetLength: '1h',
      preferredTimes: []
    },
    'Engagement/Outreach': {
      weeklyCount: 1,
      targetLength: '45min',
      preferredTimes: []
    },
    'General Todos': {
      // This fills remaining time - no configuration needed
    }
  },
  scheduling: {
    maxTasksPerDay: 4,
    bufferBetweenTasks: '30min',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workingHours: {
      start: '09:00',
      end: '17:00'
    }
  },
  lastUpdated: new Date().toISOString()
};

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      // Create default config if it doesn't exist
      writeConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    
    const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error reading workflow config:', error);
    return DEFAULT_CONFIG;
  }
}

function writeConfig(config: any) {
  try {
    const configToWrite = {
      ...config,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(configToWrite, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing workflow config:', error);
    return false;
  }
}

export async function GET() {
  const config = readConfig();
  return NextResponse.json({
    success: true,
    config: config
  });
}

export async function POST(request: NextRequest) {
  try {
    const newConfig = await request.json();
    
    // Validate required structure
    if (!newConfig.taskQuotas || !newConfig.scheduling) {
      return NextResponse.json({
        success: false,
        error: 'Invalid config structure. Must include taskQuotas and scheduling.'
      }, { status: 400 });
    }
    
    const success = writeConfig(newConfig);
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Workflow config updated successfully',
        config: newConfig
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to write config file'
      }, { status: 500 });
    }
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Invalid JSON in request body'
    }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const currentConfig = readConfig();
    const updates = await request.json();
    
    // Deep merge the updates
    const updatedConfig = mergeDeep(currentConfig, updates);
    
    const success = writeConfig(updatedConfig);
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Workflow config updated successfully',
        config: updatedConfig
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to write config file'
      }, { status: 500 });
    }
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Invalid JSON in request body'
    }, { status: 400 });
  }
}

// Helper function for deep merging objects
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