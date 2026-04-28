import { redirect } from 'next/navigation';
import { buildFocusedWallMapHref } from '../../../lib/walls';

type WallMapRedirectPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function WallMapRedirectPage({ params }: WallMapRedirectPageProps) {
  const { id } = await params;
  redirect(buildFocusedWallMapHref(id));
}
