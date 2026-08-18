import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.tsx';
import { ApiError } from './api/client.ts';
import { queryKeys } from './api/queries.ts';
import './styles/global.css';
import './styles/app.css';

const queryClient = new QueryClient({
  // A session that expires mid-use surfaces as a 401 on whichever query
  // hits it next — flip `me` to null here once, instead of every hook
  // special-casing it; AuthGate reacts to that and redirects to /login.
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(queryKeys.me, null);
    },
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
