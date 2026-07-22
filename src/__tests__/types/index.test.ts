import {
  isCustomTaskType,
  getCustomTaskTypeId,
  BUILT_IN_TASK_TYPE_EMOJIS,
  BUILT_IN_TASK_TYPE_LABELS,
  TaskType,
  BuiltInTaskType,
} from '@/types';

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
