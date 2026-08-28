import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui";

/** Branded dead-end. Every wrong turn still offers a way back. */
export default function NotFound() {
  return (
    <>
      <PageHeader
        title="That page does not exist"
        lede="The link may be out of date, or the shipment ID may have been retired from the
              active fleet." />

      <div className="bg-surface border border-border-warm rounded-[6px] p-8 max-w-lg">
        <p className="text-[13px] text-text-muted leading-relaxed">
          Try one of these instead:
        </p>
        <ul className="mt-4 space-y-2 text-[13px]">
          {[
            ["/", "Risk Queue — every shipment ranked by risk"],
            ["/predict", "New Shipment — score a shipment before it ships"],
            ["/backtest", "Backtest — how the model performed on real disruptions"],
            ["/model", "Model Trust — accuracy, calibration and data provenance"],
          ].map(([to, label]) => (
            <li key={to}>
              <Link to={to}
                className="text-ups-brown-800 font-medium hover:text-ups-gold-dark
                           hover:underline underline-offset-2">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
