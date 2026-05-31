"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

import { TokenIcon } from "@/components/token-icon";
import {
  CircleClientError,
  circleStorageKeys as storageKeys,
  getCircleErrorMessage as getClientErrorMessage,
  readCircleLogin as readStoredLogin,
  readCircleSessionStorage as readStorage,
  removeCircleSessionStorage as removeStorage,
  writeCircleLogin,
  writeCircleWallets,
  writeCircleSessionStorage as writeStorage,
  type CircleClientErrorPayload,
  type CircleLoginResult,
  type CircleTokenBalance,
  type CircleWallet,
} from "@/lib/circle-session";
import { recordPlatformProfileCreation } from "@/lib/platform-analytics";
import { arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";

type DeviceTokenResponse = {
  deviceEncryptionKey: string;
  deviceToken: string;
};

type CircleEntityConfigResponse = {
  appId?: string;
};

type GoogleOAuthDiagnostic = {
  audienceMatches?: boolean;
  hasIdToken: boolean;
  nonceMatches?: boolean;
  providerMatches?: boolean;
  stateMatches?: boolean;
};

const googleOAuthDiagnosticStorageKey =
  "swiftpay.circle.googleOAuthDiagnostic";

function isValidRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const googleProvider = "Google" as Parameters<W3SSdk["performLogin"]>[0];

function shortAddress(value?: string) {
  if (!value) {
    return "Pending";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getSupportedTokenSymbol(value?: string): ArcTokenSymbol | undefined {
  const symbol = value?.toUpperCase();

  return arcTokenSymbols.includes(symbol as ArcTokenSymbol)
    ? (symbol as ArcTokenSymbol)
    : undefined;
}

function GoogleLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );

    return JSON.parse(atob(padded)) as { aud?: string; nonce?: string };
  } catch {
    return null;
  }
}

function readGoogleOAuthDiagnostic() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(googleOAuthDiagnosticStorageKey);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as GoogleOAuthDiagnostic;
  } catch {
    return null;
  }
}

function captureGoogleOAuthDiagnostic(googleClientId: string) {
  if (typeof window === "undefined" || !window.location.hash) {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const idToken = hashParams.get("id_token");

  if (!idToken && !hashParams.get("error")) {
    return null;
  }

  const payload = idToken ? decodeJwtPayload(idToken) : null;
  const storedProvider = window.localStorage.getItem("socialLoginProvider");
  const storedState = window.localStorage.getItem("state");
  const storedNonce = window.localStorage.getItem("nonce");
  const diagnostic = {
    audienceMatches: payload?.aud
      ? payload.aud === googleClientId
      : undefined,
    hasIdToken: Boolean(idToken),
    nonceMatches:
      payload?.nonce && storedNonce ? payload.nonce === storedNonce : undefined,
    providerMatches: storedProvider ? storedProvider === googleProvider : false,
    stateMatches:
      hashParams.get("state") && storedState
        ? hashParams.get("state") === storedState
        : undefined,
  } satisfies GoogleOAuthDiagnostic;

  window.sessionStorage.setItem(
    googleOAuthDiagnosticStorageKey,
    JSON.stringify(diagnostic),
  );

  return diagnostic;
}

function getGoogleOAuthDiagnosticSummary(diagnostic: GoogleOAuthDiagnostic) {
  const checks = [
    ["Client", diagnostic.audienceMatches],
    ["State", diagnostic.stateMatches],
    ["Nonce", diagnostic.nonceMatches],
    ["Provider", diagnostic.providerMatches],
  ]
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `${label}: ${value ? "match" : "mismatch"}`);

  return checks.length > 0
    ? checks.join(" / ")
    : diagnostic.hasIdToken
      ? "Google returned an ID token."
      : "Google did not return an ID token.";
}

function getGoogleLoginErrorMessage(
  error: unknown,
  fallback: string,
  redirectUri: string,
  diagnostic: GoogleOAuthDiagnostic | null,
) {
  const message = getClientErrorMessage(error, fallback);
  const normalized = message.toLowerCase();

  if (
    message.includes("155140") ||
    normalized.includes("invalid credentials")
  ) {
    const redirectHint = redirectUri || "the app URL";

    if (
      diagnostic?.stateMatches === false ||
      diagnostic?.nonceMatches === false ||
      diagnostic?.providerMatches === false
    ) {
      return `Google returned to the app, but the stored login state did not match. Open the app at ${redirectHint}, use one browser tab, clear site data for this app, and retry Google login.`;
    }

    if (diagnostic?.audienceMatches === false) {
      return "Google returned an ID token for a different OAuth Web Client ID than NEXT_PUBLIC_GOOGLE_CLIENT_ID. Use that same Web Client ID in .env and in Circle Console.";
    }

    if (
      diagnostic?.audienceMatches === true &&
      diagnostic?.stateMatches === true &&
      diagnostic?.nonceMatches === true
    ) {
      return "Google returned a token that matches the local app config, and the app is using the App ID associated with CIRCLE_API_KEY. Circle is still rejecting the token, so the Google Client ID (Web) is not saved/enabled in that Circle User Controlled Wallets Social Login configuration.";
    }

    return `Circle rejected the Google sign-in token. In Circle Console, set the Google Client ID (Web) to the same Web OAuth client used by NEXT_PUBLIC_GOOGLE_CLIENT_ID, use the App ID from that same Circle configuration, and add ${redirectHint} as an authorized redirect URI in Google Cloud. Restart the dev server after changing env values.`;
  }

  return message;
}

async function callCircleWalletApi<T>(
  action: string,
  params: Record<string, unknown> = {},
) {
  const response = await fetch("/api/circle/user-wallets", {
    body: JSON.stringify({
      action,
      ...params,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();
  let payload: T & CircleClientErrorPayload;

  try {
    payload = text
      ? (JSON.parse(text) as T & CircleClientErrorPayload)
      : ({} as T & CircleClientErrorPayload);
  } catch {
    payload = {
      message: text || "Circle wallet request returned a non-JSON response.",
    } as T & CircleClientErrorPayload;
  }

  if (!response.ok) {
    throw new CircleClientError(payload, "Circle wallet request failed.");
  }

  return payload;
}

export function CircleGoogleLogin() {
  const sdkRef = useRef<W3SSdk | null>(null);
  const setupCompletionStartedRef = useRef(false);
  const envAppId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() ?? "";
  const googleClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
  const configuredRedirectUri =
    process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI?.trim() ?? "";
  const [resolvedAppId, setResolvedAppId] = useState(envAppId);
  const [appConfigChecked, setAppConfigChecked] = useState(false);
  const [appConfigStatus, setAppConfigStatus] = useState<
    "checking" | "mismatch" | "unavailable" | "verified"
  >("checking");
  const [sdkReady, setSdkReady] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [deviceEncryptionKey, setDeviceEncryptionKey] = useState("");
  const [loginResult, setLoginResult] = useState<CircleLoginResult | null>(
    null,
  );
  const [wallets, setWallets] = useState<CircleWallet[]>([]);
  const [balances, setBalances] = useState<CircleTokenBalance[]>([]);
  const [status, setStatus] = useState("Circle wallet ready");
  const [error, setError] = useState<string | null>(null);
  const [oauthDiagnostic, setOauthDiagnostic] =
    useState<GoogleOAuthDiagnostic | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const appId = resolvedAppId || envAppId;
  const primaryWallet = wallets[0];
  const isConfigured = Boolean(appId && googleClientId);
  const hasAppIdMismatch = Boolean(
    envAppId && resolvedAppId && envAppId !== resolvedAppId,
  );
  const appConfigLabel =
    appConfigStatus === "checking"
      ? "Checking"
      : appConfigStatus === "verified"
        ? "API key verified"
        : appConfigStatus === "mismatch"
          ? "Using API key App ID"
          : "Env fallback";
  const redirectUri = useMemo(() => {
    if (configuredRedirectUri) {
      return configuredRedirectUri;
    }

    if (typeof window !== "undefined") {
      return window.location.origin;
    }

    return "";
  }, [configuredRedirectUri]);

  useEffect(() => {
    let cancelled = false;

    async function loadCircleEntityConfig() {
      setAppConfigStatus("checking");

      try {
        const payload =
          await callCircleWalletApi<CircleEntityConfigResponse>(
            "getEntityConfig",
          );
        const entityAppId = payload.appId?.trim() ?? "";

        if (cancelled) {
          return;
        }

        if (entityAppId) {
          setResolvedAppId(entityAppId);
          setAppConfigStatus(
            envAppId && envAppId !== entityAppId ? "mismatch" : "verified",
          );
          return;
        }

        setResolvedAppId(envAppId);
        setAppConfigStatus("unavailable");
      } catch {
        if (!cancelled) {
          setResolvedAppId(envAppId);
          setAppConfigStatus("unavailable");
        }
      } finally {
        if (!cancelled) {
          setAppConfigChecked(true);
        }
      }
    }

    void loadCircleEntityConfig();

    return () => {
      cancelled = true;
    };
  }, [envAppId]);

  useEffect(() => {
    if (!appConfigChecked) {
      setSdkReady(false);
      return;
    }

    let cancelled = false;

    async function initializeSdk() {
      try {
        const { W3SSdk: CircleW3SSdk } = await import(
          "@circle-fin/w3s-pw-web-sdk"
        );
        const nextOauthDiagnostic =
          captureGoogleOAuthDiagnostic(googleClientId) ??
          readGoogleOAuthDiagnostic();

        if (nextOauthDiagnostic && !cancelled) {
          setOauthDiagnostic(nextOauthDiagnostic);
        }

        const storedDeviceToken = readStorage(storageKeys.deviceToken);
        const storedDeviceEncryptionKey = readStorage(
          storageKeys.deviceEncryptionKey,
        );
        const storedLogin = readStoredLogin();
        const sdkConfigs = {
          appSettings: {
            appId,
          },
          loginConfigs: {
            deviceEncryptionKey: storedDeviceEncryptionKey,
            deviceToken: storedDeviceToken,
            google: {
              clientId: googleClientId,
              redirectUri,
              selectAccountPrompt: true,
            },
          },
        };
        const onLoginComplete = (loginError: unknown, result: unknown) => {
          if (cancelled) {
            return;
          }

          if (loginError) {
            const diagnostic = readGoogleOAuthDiagnostic();
            const message = getGoogleLoginErrorMessage(
              loginError,
              "Google login failed.",
              redirectUri,
              diagnostic,
            );
            removeStorage(storageKeys.setupIntent);
            setOauthDiagnostic(diagnostic);
            setError(message);
            setStatus("Google login failed");
            return;
          }

          const nextLogin = result as CircleLoginResult | undefined;

          if (!nextLogin?.userToken || !nextLogin.encryptionKey) {
            setError("Google login did not return Circle wallet credentials.");
            setStatus("Google login incomplete");
            return;
          }

          setLoginResult(nextLogin);
          writeCircleLogin(nextLogin);
          removeStorage(googleOAuthDiagnosticStorageKey);
          setOauthDiagnostic(null);
          setError(null);
          setStatus("Google login connected. Completing wallet setup");
        };
        const sdk = new CircleW3SSdk(sdkConfigs, onLoginComplete);

        sdk.updateConfigs(sdkConfigs, onLoginComplete);

        sdkRef.current = sdk;

        if (!cancelled) {
          setDeviceToken(storedDeviceToken);
          setDeviceEncryptionKey(storedDeviceEncryptionKey);
          setLoginResult(storedLogin);
          setSdkReady(true);

          if (!isConfigured) {
            setStatus("Add Circle and Google credentials");
          }
        }
      } catch (sdkError) {
        if (!cancelled) {
          setError(
            getClientErrorMessage(
              sdkError,
              "Circle SDK could not be initialized.",
            ),
          );
          setStatus("Circle SDK unavailable");
        }
      }
    }

    const initializationTimer = window.setTimeout(() => {
      void initializeSdk();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(initializationTimer);
    };
  }, [appConfigChecked, appId, googleClientId, isConfigured, redirectUri]);

  useEffect(() => {
    if (!sdkReady || !sdkRef.current) {
      return;
    }

    const storedDeviceId = readStorage(storageKeys.deviceId);

    if (storedDeviceId) {
      setDeviceId(storedDeviceId);
      return;
    }

    let cancelled = false;

    async function loadDeviceId() {
      try {
        const nextDeviceId = await sdkRef.current?.getDeviceId();

        if (!cancelled && nextDeviceId) {
          setDeviceId(nextDeviceId);
          writeStorage(storageKeys.deviceId, nextDeviceId);
        }
      } catch (deviceError) {
        if (!cancelled) {
          setError(
            getClientErrorMessage(
              deviceError,
              "Device ID could not be created.",
            ),
          );
        }
      }
    }

    void loadDeviceId();

    return () => {
      cancelled = true;
    };
  }, [sdkReady]);

  async function loadBalances(userToken: string, walletId: string) {
    const payload = await callCircleWalletApi<{
      tokenBalances?: CircleTokenBalance[];
    }>("getTokenBalance", {
      userToken,
      walletId,
    });

    setBalances(payload.tokenBalances ?? []);
  }

  async function loadWallets(
    userToken = loginResult?.userToken,
    options: { showBusy?: boolean } = {},
  ) {
    if (!userToken) {
      return null;
    }

    const showBusy = options.showBusy ?? true;

    if (showBusy) {
      setIsBusy(true);
    }

    setError(null);

    try {
      const payload = await callCircleWalletApi<{ wallets?: CircleWallet[] }>(
        "listWallets",
        {
          userToken,
        },
      );
      const nextWallets = payload.wallets ?? [];
      setWallets(nextWallets);
      writeCircleWallets(nextWallets);

      if (nextWallets[0]) {
        await loadBalances(userToken, nextWallets[0].id);
        setStatus("Circle wallet loaded");
      } else {
        setBalances([]);
        setStatus("No Circle wallet found");
      }

      return nextWallets;
    } catch (walletError) {
      setError(
        getClientErrorMessage(
          walletError,
          "Circle wallet could not be loaded.",
        ),
      );
      setStatus("Wallet load failed");
      return null;
    } finally {
      if (showBusy) {
        setIsBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!loginResult?.userToken || wallets.length > 0) {
      return;
    }

    if (
      readStorage(storageKeys.setupIntent) !== "true" ||
      setupCompletionStartedRef.current
    ) {
      void loadWallets(loginResult.userToken);
      return;
    }

    void completeWalletSetup(loginResult);
  }, [loginResult, loginResult?.userToken, wallets.length]);

  function updateSdkLoginConfig(tokens: DeviceTokenResponse) {
    sdkRef.current?.updateConfigs({
      appSettings: {
        appId,
      },
      loginConfigs: {
        deviceEncryptionKey: tokens.deviceEncryptionKey,
        deviceToken: tokens.deviceToken,
        google: {
          clientId: googleClientId,
          redirectUri,
          selectAccountPrompt: true,
        },
      },
    });
  }

  async function ensureDeviceToken(options: { forceRefresh?: boolean } = {}) {
    if (!options.forceRefresh && deviceToken && deviceEncryptionKey) {
      return {
        deviceEncryptionKey,
        deviceToken,
      } satisfies DeviceTokenResponse;
    }

    const sdk = sdkRef.current;

    if (!sdk) {
      throw new Error("Circle SDK is still loading.");
    }

    const nextDeviceId = deviceId || (await sdk.getDeviceId());
    setDeviceId(nextDeviceId);
    writeStorage(storageKeys.deviceId, nextDeviceId);

    const tokens = await callCircleWalletApi<DeviceTokenResponse>(
      "createDeviceToken",
      {
        deviceId: nextDeviceId,
      },
    );

    setDeviceToken(tokens.deviceToken);
    setDeviceEncryptionKey(tokens.deviceEncryptionKey);
    writeStorage(storageKeys.deviceToken, tokens.deviceToken);
    writeStorage(storageKeys.deviceEncryptionKey, tokens.deviceEncryptionKey);
    updateSdkLoginConfig(tokens);

    return tokens;
  }

  async function handleGoogleLogin() {
    const sdk = sdkRef.current;

    if (!sdk) {
      setError("Circle SDK is still loading.");
      return;
    }

    if (!isConfigured) {
      setError(
        "Set NEXT_PUBLIC_CIRCLE_APP_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID, or configure CIRCLE_API_KEY so the app can read the Circle entity App ID.",
      );
      return;
    }

    if (!isValidRedirectUri(redirectUri)) {
      setError("Set NEXT_PUBLIC_GOOGLE_REDIRECT_URI to a valid http(s) URL.");
      return;
    }

    if (typeof window !== "undefined") {
      const redirectOrigin = new URL(redirectUri).origin;

      if (window.location.origin !== redirectOrigin) {
        setError(
          `Google login must start from the same origin it returns to. Open ${redirectOrigin}, or set NEXT_PUBLIC_GOOGLE_REDIRECT_URI to ${window.location.origin} and add that exact URI in Google Cloud.`,
        );
        return;
      }
    }

    setIsBusy(true);
    setError(null);
    setOauthDiagnostic(null);
    removeStorage(googleOAuthDiagnosticStorageKey);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem("socialLoginProvider");
      window.localStorage.removeItem("state");
      window.localStorage.removeItem("nonce");
    }

    try {
      const tokens = await ensureDeviceToken({ forceRefresh: true });
      updateSdkLoginConfig(tokens);
      setupCompletionStartedRef.current = false;
      writeStorage(storageKeys.setupIntent, "true");
      setStatus("Redirecting to Google");
      await sdk.performLogin(googleProvider);
    } catch (loginError) {
      console.error("Google login start failed", loginError);
      const diagnostic = readGoogleOAuthDiagnostic();

      removeStorage(storageKeys.setupIntent);
      setOauthDiagnostic(diagnostic);
      setError(
        getGoogleLoginErrorMessage(
          loginError,
          "Google login could not start.",
          redirectUri,
          diagnostic,
        ),
      );
      setStatus("Google login unavailable");
    } finally {
      setIsBusy(false);
    }
  }

  function executeChallenge(challengeId: string, auth: CircleLoginResult) {
    const sdk = sdkRef.current;

    if (!sdk) {
      setError("Circle SDK is still loading.");
      return;
    }

    sdk.setAuthentication({
      encryptionKey: auth.encryptionKey,
      userToken: auth.userToken,
    });
    setStatus("Opening wallet setup");

    sdk.execute(challengeId, (challengeError) => {
      if (challengeError) {
        const message = getClientErrorMessage(
          challengeError,
          "Wallet setup was not completed.",
        );
        setError(message);
        setStatus("Wallet setup failed");
        removeStorage(storageKeys.setupIntent);
        return;
      }

      setStatus("Wallet setup complete");
      removeStorage(storageKeys.setupIntent);
      window.setTimeout(() => {
        void (async () => {
          const nextWallets = await loadWallets(auth.userToken);
          const createdWallet = nextWallets?.[0];

          if (createdWallet) {
            recordPlatformProfileCreation({
              metadata: {
                blockchain: createdWallet.blockchain,
                profileType: "circle_wallet",
                walletState: createdWallet.state,
              },
              profileId: createdWallet.address ?? createdWallet.id,
              provider: auth.oAuthInfo?.provider ?? "circle",
              walletAddress: createdWallet.address,
            });
          }
        })();
      }, 1600);
    });
  }

  async function completeWalletSetup(auth: CircleLoginResult) {
    if (!auth.userToken) {
      setError("Continue with Google before creating a wallet.");
      return;
    }

    if (setupCompletionStartedRef.current) {
      return;
    }

    setupCompletionStartedRef.current = true;
    setIsBusy(true);
    setError(null);

    try {
      setStatus("Checking Circle wallet");
      const existingWallets = await loadWallets(auth.userToken, {
        showBusy: false,
      });

      if (existingWallets === null) {
        return;
      }

      if (existingWallets.length > 0) {
        removeStorage(storageKeys.setupIntent);
        setStatus("Circle wallet ready");
        return;
      }

      setStatus("Creating Circle wallet");
      const payload = await callCircleWalletApi<{ challengeId?: string }>(
        "initializeUser",
        {
          userToken: auth.userToken,
        },
      );

      if (!payload.challengeId) {
        await loadWallets(auth.userToken, { showBusy: false });
        removeStorage(storageKeys.setupIntent);
        return;
      }

      executeChallenge(payload.challengeId, auth);
    } catch (walletError) {
      if (
        walletError instanceof CircleClientError &&
        walletError.code === 155106
      ) {
        await loadWallets(auth.userToken, { showBusy: false });
        removeStorage(storageKeys.setupIntent);
        return;
      }

      setError(
        getClientErrorMessage(
          walletError,
          "Circle wallet could not be created.",
        ),
      );
      setStatus("Wallet setup failed");
      removeStorage(storageKeys.setupIntent);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleInitializeWallet() {
    if (!loginResult?.userToken) {
      setError("Continue with Google before creating a wallet.");
      return;
    }

    setupCompletionStartedRef.current = false;
    writeStorage(storageKeys.setupIntent, "true");
    await completeWalletSetup(loginResult);
  }

  const primaryAction = !loginResult ? (
    <button
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-swift-600 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300 disabled:shadow-none"
      disabled={!appConfigChecked || !sdkReady || isBusy}
      onClick={() => void handleGoogleLogin()}
      type="button"
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
          <GoogleLogo className="h-4 w-4" />
        </span>
      )}
      Continue with Google
    </button>
  ) : primaryWallet ? (
    <Link
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-swift-600 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
      href="/dashboard"
    >
      Open dashboard
      <ArrowRight className="h-4 w-4" />
    </Link>
  ) : (
    <button
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-swift-600 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300 disabled:shadow-none"
      disabled={isBusy}
      onClick={() => void handleInitializeWallet()}
      type="button"
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wallet className="h-4 w-4" />
      )}
      Create Circle wallet
    </button>
  );

  return (
    <aside className="surface-panel p-5 sm:p-6" id="google-login">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Google auth</p>
          <h2 className="mt-3 font-heading text-2xl font-semibold leading-snug text-ink">
            Circle wallet
          </h2>
        </div>
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
          {primaryWallet ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <Wallet className="h-5 w-5" />
          )}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted">
        Continue with Google to create or load a Circle user-controlled wallet
        for SwiftPay transactions.
      </p>

      <div className="mt-5 rounded-lg border border-lavender-200 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-muted">Status</span>
          <span className="text-right text-sm font-bold text-swift-700">
            {status}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-muted">Wallet</span>
          <span className="font-mono text-xs font-bold text-ink">
            {shortAddress(primaryWallet?.address)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-muted">Chain</span>
          <span className="text-sm font-bold text-ink">
            {primaryWallet?.blockchain ?? "ARC-TESTNET"}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-muted">Circle App</span>
          <span className="text-right text-sm font-bold text-ink">
            {appConfigLabel}
          </span>
        </div>
      </div>

      {hasAppIdMismatch ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          NEXT_PUBLIC_CIRCLE_APP_ID does not match this API key. The login flow
          is using the App ID returned by Circle for CIRCLE_API_KEY.
        </div>
      ) : null}

      {balances.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {balances.slice(0, 2).map((balance, index) => (
            (() => {
              const symbol = getSupportedTokenSymbol(balance.token?.symbol);

              return (
                <div
                  className="rounded-lg border border-lavender-100 bg-white/80 px-3 py-2"
                  key={`${balance.token?.id ?? balance.token?.symbol ?? balance.token?.name ?? "token"}-${balance.amount ?? "0"}-${index}`}
                >
                  <div className="flex items-center gap-2">
                    {symbol ? (
                      <TokenIcon
                        className="h-5 w-5 shrink-0 rounded-full"
                        symbol={symbol}
                      />
                    ) : null}
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                      {balance.token?.symbol ?? balance.token?.name ?? "Token"}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-sm font-black text-ink">
                    {balance.amount ?? "0"}
                  </p>
                </div>
              );
            })()
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      {error && oauthDiagnostic ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Google token diagnostic:{" "}
          {getGoogleOAuthDiagnosticSummary(oauthDiagnostic)}
        </div>
      ) : null}

      <div className="mt-5 grid gap-2">
        {primaryAction}
        <button
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-4 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-100 disabled:text-muted"
          disabled={!loginResult?.userToken || isBusy}
          onClick={() => void loadWallets()}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
          Refresh wallet
        </button>
      </div>
    </aside>
  );
}
