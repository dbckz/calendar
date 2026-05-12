'use client';

import { useState, useEffect } from 'react';

interface TaskQuota {
  weeklyCount?: number;
  targetLength: string;
  preferredTimes: string[];
}

interface SchedulingConfig {
  maxTasksPerDay: number;
  bufferBetweenTasks: string;
  workingDays: string[];
  workingHours: {
    start: string;
    end: string;
  };
}

interface WorkflowConfig {
  taskQuotas: {
    [key: string]: TaskQuota;
  };
  scheduling: SchedulingConfig;
  lastUpdated?: string;
}

const DEFAULT_CONFIG: WorkflowConfig = {
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
      targetLength: '',
      preferredTimes: []
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
  }
};

export default function WorkflowConfig() {
  const [config, setConfig] = useState<WorkflowConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/workflow-config');
      const data = await response.json();
      
      if (data.success) {
        setConfig(data.config);
      } else {
        console.error('Failed to load config:', data.error);
        setMessage({type: 'error', text: 'Failed to load configuration'});
      }
    } catch (error) {
      console.error('Error loading config:', error);
      setMessage({type: 'error', text: 'Error loading configuration'});
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/workflow-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({type: 'success', text: 'Configuration saved successfully!'});
        setConfig(data.config);
      } else {
        setMessage({type: 'error', text: data.error || 'Failed to save configuration'});
      }
    } catch (error) {
      console.error('Error saving config:', error);
      setMessage({type: 'error', text: 'Error saving configuration'});
    } finally {
      setSaving(false);
    }
  };

  const updateTaskQuota = (taskType: string, field: keyof TaskQuota, value: any) => {
    setConfig(prev => ({
      ...prev,
      taskQuotas: {
        ...prev.taskQuotas,
        [taskType]: {
          ...prev.taskQuotas[taskType],
          [field]: value
        }
      }
    }));
  };

  const updateScheduling = (field: keyof SchedulingConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      scheduling: {
        ...prev.scheduling,
        [field]: value
      }
    }));
  };

  const addPreferredTime = (taskType: string) => {
    const newTime = '09:00-10:00';
    updateTaskQuota(taskType, 'preferredTimes', [
      ...config.taskQuotas[taskType].preferredTimes,
      newTime
    ]);
  };

  const removePreferredTime = (taskType: string, index: number) => {
    const times = config.taskQuotas[taskType].preferredTimes;
    updateTaskQuota(taskType, 'preferredTimes', times.filter((_, i) => i !== index));
  };

  const updatePreferredTime = (taskType: string, index: number, value: string) => {
    const times = [...config.taskQuotas[taskType].preferredTimes];
    times[index] = value;
    updateTaskQuota(taskType, 'preferredTimes', times);
  };

  if (loading) {
    return <div className="p-4">Loading configuration...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Workflow Configuration</h2>
        <p className="text-gray-600">Configure your weekly sprint planning preferences</p>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.type === 'success' 
            ? 'bg-green-100 text-green-700 border border-green-300' 
            : 'bg-red-100 text-red-700 border border-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Task Quotas Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Task Quotas</h3>
        <div className="space-y-6">
          {Object.entries(config.taskQuotas).map(([taskType, quota]) => {
            // Determine the label based on task type
            const getCountLabel = (type: string) => {
              if (type === 'Writing/Deep Work' || type === 'Blogs') {
                return 'Tasks to work on per week';
              } else if (type === 'Batch' || type === 'Engagement/Outreach') {
                return 'Work sessions per week';
              }
              return 'Weekly Count';
            };

            const showWeeklyCount = taskType !== 'General Todos';

            return (
              <div key={taskType} className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-medium mb-3">{taskType}</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {showWeeklyCount && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {getCountLabel(taskType)}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={quota.weeklyCount || 0}
                        onChange={(e) => updateTaskQuota(taskType, 'weeklyCount', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  )}
                  
                  {taskType !== 'General Todos' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Target Length
                      </label>
                      <input
                        type="text"
                        value={quota.targetLength}
                        onChange={(e) => updateTaskQuota(taskType, 'targetLength', e.target.value)}
                        placeholder="e.g., 2h, 90min"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  )}
                </div>

                {taskType !== 'General Todos' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Preferred Times
                    </label>
                    <div className="space-y-2">
                      {quota.preferredTimes.map((timeRange, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={timeRange}
                            onChange={(e) => updatePreferredTime(taskType, index, e.target.value)}
                            placeholder="e.g., 09:00-11:00"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                          />
                          <button
                            onClick={() => removePreferredTime(taskType, index)}
                            className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addPreferredTime(taskType)}
                        className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                      >
                        Add Time Range
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scheduling Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Scheduling Settings</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Tasks Per Day
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={config.scheduling.maxTasksPerDay}
              onChange={(e) => updateScheduling('maxTasksPerDay', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buffer Between Tasks
            </label>
            <input
              type="text"
              value={config.scheduling.bufferBetweenTasks}
              onChange={(e) => updateScheduling('bufferBetweenTasks', e.target.value)}
              placeholder="e.g., 30min"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Working Hours Start
            </label>
            <input
              type="time"
              value={config.scheduling.workingHours.start}
              onChange={(e) => updateScheduling('workingHours', {
                ...config.scheduling.workingHours,
                start: e.target.value
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Working Hours End
            </label>
            <input
              type="time"
              value={config.scheduling.workingHours.end}
              onChange={(e) => updateScheduling('workingHours', {
                ...config.scheduling.workingHours,
                end: e.target.value
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Working Days
          </label>
          <div className="flex flex-wrap gap-2">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
              <label key={day} className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.scheduling.workingDays.includes(day)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateScheduling('workingDays', [...config.scheduling.workingDays, day]);
                    } else {
                      updateScheduling('workingDays', config.scheduling.workingDays.filter(d => d !== day));
                    }
                  }}
                  className="mr-2"
                />
                {day}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="px-6 py-3 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:bg-gray-400"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {config.lastUpdated && (
        <p className="text-sm text-gray-500 mt-2 text-right">
          Last updated: {new Date(config.lastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  );
}