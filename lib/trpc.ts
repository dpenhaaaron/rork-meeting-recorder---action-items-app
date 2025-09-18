import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  try {
    if (process.env.EXPO_PUBLIC_RORK_API_BASE_URL) {
      return process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
    }
    if (typeof window !== 'undefined') {
      return '';
    }
    if (__DEV__) {
      console.warn('EXPO_PUBLIC_RORK_API_BASE_URL not set, using localhost for dev');
      return 'http://localhost:3000';
    }
    console.warn('EXPO_PUBLIC_RORK_API_BASE_URL not set. Using relative URL.');
    return '';
  } catch (e) {
    console.warn('Failed to resolve base URL, defaulting to relative', e);
    return '';
  }
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          headers: {
            ...options?.headers,
            'Content-Type': 'application/json',
          },
        }).catch((error) => {
          console.error('tRPC fetch error:', error);
          throw error;
        });
      },
    }),
  ],
});