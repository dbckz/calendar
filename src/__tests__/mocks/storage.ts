export const createMockLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    __store: store,
  };
};

export const setLocalStorageItem = (key: string, value: unknown) => {
  const stringValue = JSON.stringify(value);
  (localStorage.setItem as jest.Mock)(key, stringValue);
  // Also update internal mock behavior
  (localStorage.getItem as jest.Mock).mockImplementation((k: string) => {
    if (k === key) return stringValue;
    return null;
  });
};
