import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewWallRegistrationForm } from "../../../../components/walls/NewWallRegistrationForm";

type NewWallFlowPageProps = {
  params: Promise<{
    method: string;
  }>;
};

export const metadata: Metadata = {
  title: "新規壁登録 | ARsT",
  description: "ARsT の壁登録フロー",
};

export default async function NewWallFlowPage({
  params,
}: NewWallFlowPageProps) {
  const { method } = await params;

  if (method !== "scan" && method !== "upload") {
    notFound();
  }

  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

  return (
    <main className="page-shell">
      <NewWallRegistrationForm
        mapTilerKey={mapTilerKey}
        registrationMethod={method}
      />
    </main>
  );
}
