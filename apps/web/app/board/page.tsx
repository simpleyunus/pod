import { redirect } from 'next/navigation';

// The board lives at /fleet now; keep old links working.
export default function BoardRedirect() {
  redirect('/fleet');
}
