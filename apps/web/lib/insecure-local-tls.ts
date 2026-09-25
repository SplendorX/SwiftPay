/**
 * Whether a request that failed certificate verification may be retried with
 * verification switched off. Some local Windows setups (antivirus HTTPS
 * inspection) break certificate chains, so this is allowed under `next dev`, or
 * under a local `next start` when ALLOW_INSECURE_LOCAL_TLS=true. It is never
 * allowed on Vercel: skipping verification there would expose API keys to
 * anyone able to intercept the connection.
 */
export function allowInsecureLocalTls() {
  if (process.env.VERCEL) {
    return false;
  }

  return (
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_INSECURE_LOCAL_TLS === "true"
  );
}
