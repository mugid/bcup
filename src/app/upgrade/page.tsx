"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Checkmark } from "@/components/lime/icon";
import { Button } from "@/components/lime/ui/button";

const DEMO_SUBSCRIPTION_KEY = "bcup-demo-plus";
const monthlyPrice = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
}).format(9.99);

type Step = "offer" | "review" | "active";

export default function UpgradePage() {
  const [step, setStep] = useState<Step>("offer");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(DEMO_SUBSCRIPTION_KEY) === "active") setStep("active");
      } catch {
        // The demo can still be completed for this visit.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function activateDemo() {
    try {
      localStorage.setItem(DEMO_SUBSCRIPTION_KEY, "active");
    } catch {
      // Keep the active state for this visit when storage is unavailable.
    }
    setStep("active");
  }

  function resetDemo() {
    try {
      localStorage.removeItem(DEMO_SUBSCRIPTION_KEY);
    } catch {
      // The plan can still be previewed for this visit.
    }
    setStep("offer");
  }

  return (
    <div className="min-h-dvh bg-page text-fg">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-4 pb-8 sm:px-6 sm:pt-8">
        <header className="flex h-14 items-center gap-2">
          {step === "review" ? (
            <Button variant="ghost" size="icon" aria-label="Back to plan" onClick={() => setStep("offer")}>
              <ArrowLeft aria-hidden="true" />
            </Button>
          ) : (
            <Link href="/" aria-label="Back to collection" className="flex size-(--control-md) items-center justify-center rounded-control text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <ArrowLeft aria-hidden="true" />
            </Link>
          )}
          <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
            {step === "offer" ? "Make more room to learn" : step === "review" ? "Review your demo plan" : "Your demo plan is active"}
          </h1>
        </header>

        {step === "offer" && (
          <div className="flex flex-1 flex-col gap-8 pt-8">
            <div className="flex flex-col gap-3">
              <p className="text-base text-fg-2">Keep the words and moments you notice in one place, then come back to practice them.</p>
              <p className="text-3xl font-semibold tracking-tight">{monthlyPrice}<span className="ml-2 text-base font-normal tracking-normal text-fg-2">per month</span></p>
            </div>

            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">What you can do with Blobe</h2>
              <ul className="flex flex-col gap-4">
                <li className="flex items-start gap-3"><Checkmark aria-hidden="true" className="mt-1 shrink-0 text-accent-line" /><span className="text-base">Turn photos into words in the language you are learning.</span></li>
                <li className="flex items-start gap-3"><Checkmark aria-hidden="true" className="mt-1 shrink-0 text-accent-line" /><span className="text-base">Learn useful phrases from your short videos.</span></li>
                <li className="flex items-start gap-3"><Checkmark aria-hidden="true" className="mt-1 shrink-0 text-accent-line" /><span className="text-base">Practice speaking with words from your collection.</span></li>
              </ul>
            </section>

            <div className="mt-auto flex flex-col gap-3 pt-4">
              <Button size="lg" className="w-full" onClick={() => setStep("review")}>Review demo subscription</Button>
              <p className="text-center text-sm text-fg-3">Demo only. No payment method or charge.</p>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-1 flex-col gap-8 pt-8">
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Blobe Plus demo</h2>
              <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4 text-base">
                <span>Monthly subscription</span>
                <span className="font-semibold tabular-nums">{monthlyPrice} / month</span>
              </div>
              <p className="text-base text-fg-2">Activating this demo shows the subscription state in this browser. It does not charge you or change access to features.</p>
            </section>
            <div className="mt-auto flex flex-col gap-3 pt-4">
              <Button size="lg" className="w-full" onClick={activateDemo}>Activate demo subscription</Button>
              <p className="text-center text-sm text-fg-3">No payment method or charge.</p>
            </div>
          </div>
        )}

        {step === "active" && (
          <div className="flex flex-1 flex-col gap-6 pt-8">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Demo subscription activated</h2>
              <p className="text-base text-fg-2">Your Blobe Plus demo is active in this browser. No payment was collected and your access to features is unchanged.</p>
            </div>
            <div className="mt-auto flex flex-col gap-3 pt-4">
              <Button variant="solid" size="lg" className="w-full" onClick={() => { window.location.href = "/"; }}>Return to collection</Button>
              <Button variant="ghost" size="lg" className="w-full" onClick={resetDemo}>Reset demo subscription</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
