import Link from "next/link";
import type { Metadata } from "next";
import { NewWallRegistrationForm } from "../../../components/walls/NewWallRegistrationForm";

export const metadata: Metadata = {
  title: "新規壁登録 | Street Art App",
  description: "Street Art App の壁登録フロー",
};

export default function NewWallPage() {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

  return (
    <main className="page-shell">
      <NewWallRegistrationForm mapTilerKey={mapTilerKey} />
    </main>
  );
}
