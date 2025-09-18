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
    // For web, use relative URLs to avoid CORS issues
    if (typeof window !== 'undefined') {
      return '';
    }
    // For development on native platforms
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
        // Add timeout and better error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        return fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...options?.headers,
            'Content-Type': 'application/json',
          },
        })
        .then(response => {
          clearTimeout(timeoutId);
          return response;
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          console.error('tRPC fetch error:', {
            message: error.message,
            url,
            options: {
              method: options?.method,
              headers: options?.headers
            }
          });
          throw error;
        });
      },
    }),
  ],
});