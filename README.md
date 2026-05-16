This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open the URL shown in the terminal (e.g., `http://localhost:3000`) with your browser to see the result. The port is dynamically allocated and may vary.

## iPhone read-only app

The existing launchd service serves the phone view at `/mobile`. Find the current service port:

```bash
cat .data/current-port
```

Open the Tailscale URL from the iPhone:

```text
http://<mac-tailscale-ip>:<port>/mobile
```

For this machine, the Tailscale IP is currently `100.105.152.120`, so if `.data/current-port` contains `3001` the URL is:

```text
http://100.105.152.120:3001/mobile
```

The mobile page is a phone view for agenda browsing, event details, and completing reminders. In Safari, use Share -> Add to Home Screen to launch it like an app.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
