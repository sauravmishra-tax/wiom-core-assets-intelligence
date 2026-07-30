export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="m-8 rounded-lg border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
      Failed to load data: {message}
      <div className="mt-1 text-red-400/70">
        Is the backend running? (proxied via next.config.ts rewrites to BACKEND_URL)
      </div>
    </div>
  );
}
