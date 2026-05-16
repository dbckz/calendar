import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dave\'s Daily Planner',
    short_name: 'Planner',
    description: 'Daily calendar and task planner',
    start_url: '/mobile',
    scope: '/',
    display: 'standalone',
    background_color: '#f1f5f9',
    theme_color: '#020617',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
