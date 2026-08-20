import { PlatformBrand } from "@/components/brand/platform-brand";
import { XLogoLink } from "@/components/brand/x-logo-link";
import { circleFaucetUrl } from "@/components/circle-faucet-link";
import { LaunchAppLink } from "@/components/landing/launch-app-link";

const siteLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#products", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

const appLinks = [
  { href: "/swap", label: "Swap" },
  { href: "/dashboard", label: "Send" },
  { href: "/pay", label: "Payment links" },
  { href: "/swiftRecurepay", label: "Scheduled payments" },
  { href: "/swiftBatch", label: "Batch settlement" },
];

const appLaunchLabel = "Launch App";

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
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-grid">
        <div className="marketing-footer-brand">
          <PlatformBrand />
          <p>
            Do more with USDC — swap, send, request, batch, save, and schedule
            stablecoin payments from one wallet on Arc.
          </p>
          <XLogoLink />
        </div>
        <FooterColumn heading="Site" links={siteLinks} />
        <div className="marketing-footer-col">
          <p className="marketing-footer-heading">App</p>
          <ul>
            {appLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
            <li>
              <LaunchAppLink>{appLaunchLabel}</LaunchAppLink>
            </li>
          </ul>
        </div>
        <FooterColumn heading="Resources" links={resourceLinks} />
      </div>
      <div className="marketing-footer-bottom">
        <p>© 2026 SwiftPay — The stablecoin payment layer</p>
      </div>
    </footer>
  );
}
