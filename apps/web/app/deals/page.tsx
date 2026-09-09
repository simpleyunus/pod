import { redirect } from 'next/navigation';

// The board lives at /fleet for historical reasons, but the sidebar calls it
// Deals and the detail pages are already /deals/[id]. Without this, /deals —
// the URL a person would guess, and the parent of every deal page — 404s.
export default function DealsIndex() {
  redirect('/fleet');
}
