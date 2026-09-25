"use client";

import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type HubSection = {
  /** Also the URL hash when `syncHash` is on, so deep links keep working. */
  id: string;
  group: string;
  /** A Lucide icon, or any node (e.g. an avatar). */
  icon: LucideIcon | ReactNode;
  title: string;
  blurb: string;
  /** Shown at the end of the list item: a count, a status. */
  badge?: ReactNode;
  /** A list item that navigates away instead of opening a panel. */
  href?: string;
  /** The panel body. Omit to render the hub's `children` for this section. */
  render?: () => ReactNode;
};

function hashSection() {
  if (typeof window === "undefined") return null;
  return window.location.hash.replace(/^#/, "") || null;
}

function SectionIcon({ icon, size }: { icon: HubSection["icon"]; size: string }) {
  if (typeof icon === "function" || (typeof icon === "object" && icon && "render" in icon)) {
    const Icon = icon as LucideIcon;
    return <Icon className={size} />;
  }
  return <>{icon}</>;
}

/**
 * Sections listed beside the open one — the Settings layout. On a phone the
 * list and the open section take turns full-width, with a back button.
 *
 * Uncontrolled by default; pass `activeId` + `onActiveChange` when content
 * inside a panel also switches sections (e.g. a "Send money" button).
 */
export function SectionHub({
  activeId: controlledId,
  ariaLabel,
  backLabel = "Back",
  children,
  className,
  groupOrder,
  initialMobileView = "list",
  onActiveChange,
  sections,
  syncHash = true,
}: {
  activeId?: string;
  ariaLabel: string;
  /** The phone's return-to-list button. */
  backLabel?: string;
  children?: ReactNode;
  className?: string;
  groupOrder: string[];
  /** Phones open on the list, or straight into the active section. */
  initialMobileView?: "list" | "section";
  onActiveChange?: (id: string) => void;
  sections: HubSection[];
  syncHash?: boolean;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const panelIds = sections.filter((section) => !section.href).map((section) => section.id);
  const [ownId, setOwnId] = useState(panelIds[0]);
  const activeId = controlledId ?? ownId;
  const [mobileView, setMobileView] = useState<"list" | "section">(initialMobileView);

  const idsKey = panelIds.join("|");
  const open = useCallback(
    (id: string, options: { fromHash?: boolean } = {}) => {
      if (!idsKey.split("|").includes(id)) return;
      setOwnId(id);
      onActiveChange?.(id);
      setMobileView("section");
      if (syncHash && !options.fromHash && window.location.hash !== `#${id}`) {
        // A history entry, so the phone's back gesture returns to the list.
        window.history.pushState(null, "", `#${id}`);
      }
      window.requestAnimationFrame(() => {
        if (window.matchMedia("(max-width: 899px)").matches) {
          panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    },
    [idsKey, onActiveChange, syncHash],
  );

  // Deep links (#section), in-page links and the back button.
  useEffect(() => {
    if (!syncHash) return;
    const sync = () => {
      const id = hashSection();
      if (id) open(id, { fromHash: true });
      else if (initialMobileView === "list") setMobileView("list");
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [initialMobileView, open, syncHash]);

  const showList = () => {
    setMobileView("list");
    if (syncHash && window.location.hash) {
      window.history.pushState(null, "", window.location.pathname + window.location.search);
    }
  };

  const active =
    sections.find((section) => section.id === activeId && !section.href) ??
    sections.find((section) => !section.href);
  if (!active) return null;

  return (
    <div className={cn("settings-hub", className)} data-mobile-view={mobileView}>
      <nav aria-label={ariaLabel} className="settings-hub-nav">
        {groupOrder.map((group) => {
          const inGroup = sections.filter((section) => section.group === group);
          if (inGroup.length === 0) return null;
          return (
            <div className="settings-hub-group" key={group}>
              <p className="settings-hub-group-label">{group}</p>
              {inGroup.map((section) => {
                const isActive = !section.href && section.id === active.id;
                const content = (
                  <>
                    <span className="settings-hub-item-icon">
                      <SectionIcon icon={section.icon} size="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="settings-hub-item-title">{section.title}</span>
                      <span className="settings-hub-item-blurb">{section.blurb}</span>
                    </span>
                    {section.badge ? (
                      <span className="settings-hub-item-badge">{section.badge}</span>
                    ) : null}
                    <ChevronRight aria-hidden className="settings-hub-item-chevron h-4 w-4" />
                  </>
                );
                return section.href ? (
                  <Link className="settings-hub-item" href={section.href} key={section.id}>
                    {content}
                  </Link>
                ) : (
                  <button
                    aria-current={isActive ? "page" : undefined}
                    className={cn("settings-hub-item", isActive && "settings-hub-item-active")}
                    key={section.id}
                    onClick={() => open(section.id)}
                    type="button"
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <section
        aria-labelledby={`${active.id}-hub-title`}
        className="settings-hub-panel"
        id={syncHash ? active.id : undefined}
        ref={panelRef}
      >
        <button className="settings-hub-back" onClick={showList} type="button">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
        <header className="settings-hub-panel-head">
          <span className="settings-hub-panel-icon">
            <SectionIcon icon={active.icon} size="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="settings-hub-panel-eyebrow">{active.group}</p>
            <h3 className="settings-hub-panel-title" id={`${active.id}-hub-title`}>
              {active.title}
            </h3>
            <p className="settings-hub-panel-blurb">{active.blurb}</p>
          </div>
        </header>
        {/* Keyed so each section mounts fresh, like opening a page. */}
        <div className="settings-hub-panel-body" key={active.render ? active.id : "children"}>
          {active.render ? active.render() : children}
        </div>
      </section>
    </div>
  );
}
