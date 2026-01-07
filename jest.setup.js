require('@testing-library/jest-dom');

// Mock localStorage with proper reset capability
const createLocalStorageMock = () => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
    __resetStore: () => {
      store = {};
    },
  };
};

const localStorageMock = createLocalStorageMock();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock crypto.randomUUID
let uuidCounter = 0;
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => `test-uuid-${++uuidCounter}`),
  },
});

// Reset mocks between tests
beforeEach(() => {
  // Clear the internal store
  localStorageMock.__resetStore();
  // Reset all mock implementations to their defaults
  localStorageMock.getItem.mockImplementation((key) => null);
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  localStorageMock.key.mockClear();
  // Reset UUID counter
  uuidCounter = 0;
});
