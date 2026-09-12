"use client";

import { PlatformBrand } from "@/components/brand/platform-brand";
import { XLogoLink } from "@/components/brand/x-logo-link";
import { circleFaucetUrl } from "@/components/circle-faucet-link";
import { LaunchAppLink } from "@/components/landing/launch-app-link";
import { useT } from "@/components/locale-provider";

const resourceLinks = [
  { href: "https://www.arc.io/", label: "Arc Network" },
  { href: "https://testnet.arcscan.app", label: "Arc Explorer" },
  { href: circleFaucetUrl, label: "Circle testnet faucet" },
  { href: "https://x.com/getswiftpay?s=11", label: "X / Twitter" },
];

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="marketing-footer-col">
      <p className="marketing-footer-heading">{heading}</p>
      <ul>
        {links.map((link) => {
          const external = link.href.startsWith("http");
          return (
            <li key={link.href}>
              <a
                href={link.href}
                rel={external ? "noreferrer" : undefined}
                target={external ? "_blank" : undefined}
              >
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  const t = useT();
  const siteLinks = [
    { href: "#how-it-works", label: t("landing.footerHowItWorks") },
    { href: "#products", label: t("landing.footerFeatures") },
    { href: "#faq", label: t("landing.footerFaq") },
  ];
  const appLinks = [
    { href: "/swap", label: t("nav.swap") },
    { href: "/dashboard", label: t("common.send") },
    { href: "/pay", label: t("landing.footerPaymentLinks") },
    { href: "/swiftRecurepay", label: t("landing.footerScheduled") },
    { href: "/swiftBatch", label: t("landing.footerBatch") },
  ];

  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-grid">
        <div className="marketing-footer-brand">
          <PlatformBrand />
          <p>{t("landing.footerTagline")}</p>
          <XLogoLink />
        </div>
        <FooterColumn heading={t("landing.footerSite")} links={siteLinks} />
        <div className="marketing-footer-col">
          <p className="marketing-footer-heading">{t("landing.footerApp")}</p>
          <ul>
            {appLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
            <li>
              <LaunchAppLink>{t("common.openSwiftPay")}</LaunchAppLink>
            </li>
          </ul>
        </div>
        <FooterColumn heading={t("landing.footerResources")} links={resourceLinks} />
      </div>
      <div className="marketing-footer-bottom">
        <p className="marketing-footer-legal">{t("landing.footerLegal")}</p>
      </div>
    </footer>
  );
}
