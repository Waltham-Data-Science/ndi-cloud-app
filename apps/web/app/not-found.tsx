import Link from 'next/link';

export default function NotFound() {
  return (
    <main>
      <h1>404 — page not found</h1>
      <p>
        <Link href="/">Return to home</Link>
      </p>
    </main>
  );
}
