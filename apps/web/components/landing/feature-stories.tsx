"use client";

import { FadeUp } from "@/components/design/motion";

const stories = [
  {
    body: "Send USDC or EURC in a few taps. Recipients resolve from a username or a wallet, fees stay visible, and Arc confirms before the next breath.",
    image: "/landing/pay-mac.jpg",
    imageAlt: "Person sending a SwiftPay payment from a MacBook",
    kicker: "Pay",
    title: "Send once. Settle instantly.",
  },
  {
    body: "Circle turns a group into a money room. Split, request, and save together while chat stays in the same place as the funds.",
    flip: true,
    image: "/landing/circle-mac.jpg",
    imageAlt: "A group working together around laptops at a shared table",
    kicker: "Circle",
    title: "Move money as a group, not a spreadsheet.",
  },
  {
    body: "Turn a payment into a schedule. Set frequency, start time, and end time, then manage every run from RecurePay.",
    image: "/landing/schedule-mac.jpg",
    imageAlt: "Person in bed with a laptop, scheduling a recurring payment",
    kicker: "RecurePay",
    title: "Set it once. It keeps moving.",
  },
];

export function FeatureStories() {
  return (
    <section className="marketing-section" id="stories">
      <div className="marketing-section-header">
        <p className="section-eyebrow">In action</p>
        <h2 className="section-title">Pay, Circle, and RecurePay.</h2>
        <p className="section-copy">
          Send a payment, run a group, or put money on a schedule. Same wallet.
          Same USDC and EURC.
        </p>
      </div>
      <div className="landing-story-grid">
        {stories.map((story) => (
          <FadeUp
            className={`landing-story ${story.flip ? "landing-story-flip" : ""}`}
            key={story.title}
          >
            <div className="landing-story-media">
              <img alt={story.imageAlt} src={story.image} />
            </div>
            <div className="landing-story-copy">
              <p className="section-eyebrow">{story.kicker}</p>
              <h3 className="mt-2">{story.title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
                {story.body}
              </p>
            </div>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}
