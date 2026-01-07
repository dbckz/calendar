'use client';

import { ReactNode } from 'react';
import { ToastProvider } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ToastContainer';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}
