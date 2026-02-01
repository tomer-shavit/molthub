import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-2">Page Not Found</h2>
        <p className="text-muted-foreground text-sm mb-4">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/"
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
