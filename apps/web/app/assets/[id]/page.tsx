'use client';

import { useParams } from 'next/navigation';
import AppShell from '../../_components/AppShell';
import AssetDetailClient from './AssetDetailClient';

export default function AssetPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell>
      <AssetDetailClient id={id} />
    </AppShell>
  );
}
