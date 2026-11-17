import { useMemo } from 'react';
import {
  useLocation,
  useNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from 'react-router-dom';

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href: string) => {
        navigate(href);
      },
      replace: (href: string) => {
        navigate(href, { replace: true });
      },
      back: () => {
        navigate(-1);
      },
    }),
    [navigate],
  );
}

export function usePathname() {
  return useLocation().pathname;
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  return useRouterParams() as T;
}

/** Matches the Next.js hook shape (`URLSearchParams` with `.get()` / `.toString()`). */
export function useSearchParams(): URLSearchParams {
  const [searchParams] = useRouterSearchParams();
  return searchParams;
}