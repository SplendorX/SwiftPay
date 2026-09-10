"use client";

import { Building2, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchDirectoryProfile } from "@/lib/business/client";
import type { DirectoryHit } from "@/lib/business/types";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username ?? "").replace(/^@/, "");
  const [profile, setProfile] = useState<DirectoryHit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    void fetchDirectoryProfile(username)
      .then((payload) => setProfile(payload.profile))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Profile was not found."),
      );
  }, [username]);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-16">
      <p className="text-sm font-medium text-muted-foreground">SwiftPay</p>
      {error ? (
        <div className="mt-8">
          <h1 className="font-heading text-3xl">Profile not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : !profile ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading profile…</p>
      ) : (
        <section className="mt-8">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-muted text-primary">
            {profile.avatarUrl ? (
              <img alt="" className="h-full w-full object-cover" src={profile.avatarUrl} />
            ) : profile.kind === "business" ? (
              <Building2 className="h-7 w-7" />
            ) : (
              <UserRound className="h-7 w-7" />
            )}
          </div>
          <h1 className="mt-5 font-heading text-4xl">{profile.displayName}</h1>
          <p className="mt-2 text-muted-foreground">@{profile.username}</p>
          {profile.verificationStatus === "VERIFIED" ? (
            <p className="mt-2 text-sm font-medium">Verified Business</p>
          ) : null}
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            {profile.bio ||
              (profile.kind === "business"
                ? "Payments infrastructure for modern businesses."
                : "SwiftPay payment identity.")}
          </p>
          <div className="mt-6 flex gap-3">
            <Button asChild>
              <Link href={`/dashboard?to=@${profile.username}`}>Pay</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={profile.kind === "business" ? "/business/invoices" : `/pay?to=@${profile.username}`}>
                {profile.kind === "business" ? "Request invoice" : "Request"}
              </Link>
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
