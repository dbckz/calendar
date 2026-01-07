import {
  isCustomTaskType,
  getCustomTaskTypeId,
  isMultiIntegrationSettings,
  isLegacySettings,
  BUILT_IN_TASK_TYPE_EMOJIS,
  BUILT_IN_TASK_TYPE_LABELS,
  TaskType,
  BuiltInTaskType,
  AppSettings,
} from '@/types';
import {
  createLegacySettings,
  createLegacySettingsV1,
  createMultiIntegrationSettings,
} from '../mocks/data';

describe('Type Guards', () => {
  describe('isCustomTaskType', () => {
    it('returns true for custom task types (custom:xyz format)', () => {
      expect(isCustomTaskType('custom:abc123')).toBe(true);
      expect(isCustomTaskType('custom:my-type')).toBe(true);
      expect(isCustomTaskType('custom:123')).toBe(true);
    });

    it('returns false for built-in task types', () => {
      const builtInTypes: BuiltInTaskType[] = [
        'flight',
        'train',
        'car',
        'walk',
        'writing',
        'reading',
        'focus',
        'email',
        'batch',
      ];

      builtInTypes.forEach((type) => {
        expect(isCustomTaskType(type)).toBe(false);
      });
    });

    it('returns false for strings that look similar but are not custom types', () => {
      // These would need to be cast since they're not valid TaskTypes
      // but the function should still work correctly
      expect(isCustomTaskType('Custom:abc' as TaskType)).toBe(false);
      expect(isCustomTaskType('CUSTOM:abc' as TaskType)).toBe(false);
      expect(isCustomTaskType('custom' as TaskType)).toBe(false);
    });
  });

  describe('getCustomTaskTypeId', () => {
    it('extracts ID from custom:xyz format', () => {
      expect(getCustomTaskTypeId('custom:abc123')).toBe('abc123');
      expect(getCustomTaskTypeId('custom:my-type')).toBe('my-type');
      expect(getCustomTaskTypeId('custom:123')).toBe('123');
    });

    it('handles empty ID after prefix', () => {
      expect(getCustomTaskTypeId('custom:')).toBe('');
    });

    it('handles IDs with colons', () => {
      expect(getCustomTaskTypeId('custom:type:with:colons')).toBe('type:with:colons');
    });
  });

  describe('isMultiIntegrationSettings', () => {
    it('returns true for v2 settings', () => {
      const settings = createMultiIntegrationSettings();
      expect(isMultiIntegrationSettings(settings as AppSettings)).toBe(true);
    });

    it('returns false for legacy settings without version', () => {
      const settings = createLegacySettings();
      expect(isMultiIntegrationSettings(settings as AppSettings)).toBe(false);
    });

    it('returns false for legacy settings with version 1', () => {
      const settings = createLegacySettingsV1();
      expect(isMultiIntegrationSettings(settings as AppSettings)).toBe(false);
    });
  });

  describe('isLegacySettings', () => {
    it('returns true for settings without version field', () => {
      const settings = createLegacySettings();
      expect(isLegacySettings(settings as AppSettings)).toBe(true);
    });

    it('returns true for settings with version 1', () => {
      const settings = createLegacySettingsV1();
      expect(isLegacySettings(settings as AppSettings)).toBe(true);
    });

    it('returns false for v2 settings', () => {
      const settings = createMultiIntegrationSettings();
      expect(isLegacySettings(settings as AppSettings)).toBe(false);
    });
  });
});

describe('Built-in Task Type Constants', () => {
  describe('BUILT_IN_TASK_TYPE_EMOJIS', () => {
    it('has emoji for all built-in types', () => {
      const builtInTypes: BuiltInTaskType[] = [
        'flight',
        'train',
        'car',
        'walk',
        'writing',
        'reading',
        'focus',
        'email',
        'batch',
      ];

      builtInTypes.forEach((type) => {
        expect(BUILT_IN_TASK_TYPE_EMOJIS[type]).toBeDefined();
        expect(typeof BUILT_IN_TASK_TYPE_EMOJIS[type]).toBe('string');
        expect(BUILT_IN_TASK_TYPE_EMOJIS[type].length).toBeGreaterThan(0);
      });
    });

    it('contains expected emojis', () => {
      expect(BUILT_IN_TASK_TYPE_EMOJIS.flight).toBe('✈️');
      expect(BUILT_IN_TASK_TYPE_EMOJIS.train).toBe('🚂');
      expect(BUILT_IN_TASK_TYPE_EMOJIS.car).toBe('🚗');
      expect(BUILT_IN_TASK_TYPE_EMOJIS.focus).toBe('🎯');
    });
  });

  describe('BUILT_IN_TASK_TYPE_LABELS', () => {
    it('has label for all built-in types', () => {
      const builtInTypes: BuiltInTaskType[] = [
        'flight',
        'train',
        'car',
        'walk',
        'writing',
        'reading',
        'focus',
        'email',
        'batch',
      ];

      builtInTypes.forEach((type) => {
        expect(BUILT_IN_TASK_TYPE_LABELS[type]).toBeDefined();
        expect(typeof BUILT_IN_TASK_TYPE_LABELS[type]).toBe('string');
        expect(BUILT_IN_TASK_TYPE_LABELS[type].length).toBeGreaterThan(0);
      });
    });

    it('contains expected labels', () => {
      expect(BUILT_IN_TASK_TYPE_LABELS.flight).toBe('Flight');
      expect(BUILT_IN_TASK_TYPE_LABELS.focus).toBe('Focus time');
      expect(BUILT_IN_TASK_TYPE_LABELS.email).toBe('Email');
    });
  });
});
