"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress } from "viem";

import { fetchProfileByUsername } from "@/lib/profile";
import {
  formatUsernameLabel,
  parseRecipientInput,
} from "@/lib/profile-utils";

const usernameResolveDelayMs = 400;

export function useResolvedRecipient(input: string) {
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const trimmed = input.trim();

    function resetResolution() {
      setResolvedAddress(null);
      setResolvedUsername(null);
      setError(null);
      setIsResolving(false);
    }

    if (!trimmed) {
      resetResolution();
      return;
    }

    if (isAddress(trimmed)) {
      setResolvedAddress(getAddress(trimmed).toLowerCase());
      setResolvedUsername(null);
      setError(null);
      setIsResolving(false);
      return;
    }

    setIsResolving(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        const parsed = parseRecipientInput(trimmed);

        if (parsed.kind === "empty") {
          if (!cancelled) {
            resetResolution();
          }
          return;
        }

        if (parsed.kind === "invalid") {
          if (!cancelled) {
            setResolvedAddress(null);
            setResolvedUsername(null);
            setError(parsed.message);
            setIsResolving(false);
          }
          return;
        }

        if (parsed.kind === "address") {
          if (!cancelled) {
            setResolvedAddress(parsed.address);
            setResolvedUsername(null);
            setError(null);
            setIsResolving(false);
          }
          return;
        }

        try {
          const profile = await fetchProfileByUsername(parsed.username);

          if (cancelled) {
            return;
          }

          if (!profile) {
            setResolvedAddress(null);
            setResolvedUsername(null);
            setError(`${formatUsernameLabel(parsed.username)} was not found.`);
            setIsResolving(false);
            return;
          }

          setResolvedAddress(profile.wallet_address.toLowerCase());
          setResolvedUsername(profile.username);
          setError(null);
          setIsResolving(false);
        } catch (resolveError) {
          if (cancelled) {
            return;
          }

          setResolvedAddress(null);
          setResolvedUsername(null);
          setError(
            resolveError instanceof Error
              ? resolveError.message
              : "Recipient could not be resolved.",
          );
          setIsResolving(false);
        }
      })();
    }, usernameResolveDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input]);

  const isValid = Boolean(
    resolvedAddress && isAddress(resolvedAddress) && !error && !isResolving,
  );

  const displayLabel = useMemo(() => {
    if (resolvedUsername) {
      return formatUsernameLabel(resolvedUsername);
    }

    if (resolvedAddress && isAddress(resolvedAddress)) {
      return resolvedAddress;
    }

    return input.trim();
  }, [input, resolvedAddress, resolvedUsername]);

  return {
    displayLabel,
    error,
    isResolving,
    isValid,
    resolvedAddress,
    resolvedUsername,
  };
}