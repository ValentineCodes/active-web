import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

export function RootErrorBoundary() {
  const error = useRouteError();
  let title = 'Something went wrong';
  let detail = 'Try refreshing the page.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail = error.data?.toString() ?? detail;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-3 max-w-sm text-base text-muted">{detail}</p>
    </div>
  );
}
