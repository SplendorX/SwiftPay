"use client";

import { motion } from "framer-motion";
import {
  EyeOff,
  FileLock2,
  LockKeyhole,
  Route,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { FadeUp, Stagger, StaggerItem } from "@/components/design/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const privacyPillars = [
  {
    body: "Claim codes bind funds to the intended receiver — not public wallet trails.",
    icon: EyeOff,
    title: "Privacy protection",
  },
  {
    body: "Escrow routing on Arc keeps settlement verifiable without exposing payer intent.",
    icon: Route,
    title: "Secure routing",
  },
  {
    body: "Amounts and memos stay scoped to claim flows until the receiver redeems.",
    icon: FileLock2,
    title: "Hidden transaction details",
  },
];

export function PrivacyHeroSection() {
  return (
    <section className="privacy-hero-section">
      <FadeUp className="privacy-hero-panel privacy-hero">
        <div className="privacy-hero-grid">
          <div>
            <Badge className="mb-4" variant="secondary">
              <LockKeyhole className="mr-1 h-3 w-3" />
              PrivSwiftPay
            </Badge>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Privacy-first payments, built like Apple. Settles like fintech.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              Create receiver-bound claim codes, run private payroll batches, and
              redeem settlements without broadcasting payment intent onchain.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/privSwiftPay/private-send">Create claim code</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/privSwiftPay/claim">Redeem claim</Link>
              </Button>
            </div>
          </div>

          <div className="privacy-flow-diagram" aria-hidden>
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              className="privacy-flow-node privacy-flow-node-sender"
              transition={{ duration: 3, repeat: Infinity }}
            >
              Sender
            </motion.div>
            <motion.div
              animate={{ scaleX: [0.3, 1, 0.3] }}
              className="privacy-flow-line"
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              animate={{ y: [0, -4, 0] }}
              className="privacy-flow-node privacy-flow-node-vault"
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              Escrow
            </motion.div>
            <motion.div
              animate={{ scaleX: [0.3, 1, 0.3] }}
              className="privacy-flow-line"
              transition={{ duration: 2.5, delay: 0.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              className="privacy-flow-node privacy-flow-node-receiver"
              transition={{ duration: 3, delay: 0.6, repeat: Infinity }}
            >
              Receiver
            </motion.div>
            <p className="privacy-flow-caption">
              Funds move through escrow. Details stay private until claim.
            </p>
          </div>
        </div>
      </FadeUp>

      <Stagger className="privacy-pillar-grid">
        {privacyPillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <StaggerItem key={pillar.title}>
              <article className="privacy-pillar-card">
                <div className="feature-icon mb-3">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-heading font-semibold">{pillar.title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {pillar.body}
                </p>
              </article>
            </StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}