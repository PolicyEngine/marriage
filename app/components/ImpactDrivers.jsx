import React from "react";
import { financialChangeDrivers } from "@/lib/resultDrivers";
import { formatCurrency } from "@/lib/utils";

export default function ImpactDrivers({ results, countryId, currencySymbol }) {
  const drivers = financialChangeDrivers(results, countryId);
  if (drivers.length === 0) return null;

  return <section className="impact-drivers" aria-label="What changes">
    <h3>What changes</h3>
    <p>Largest changes in annual {countryId === "us" ? "financial resources" : "net income"}.</p>
    <ul className="impact-drivers-list">
      {drivers.map(driver => <li className="impact-driver" key={driver.key}>
        <span className="impact-driver-label">{driver.label}</span>
        <strong className={`impact-driver-value ${driver.effect > 0 ? "positive" : "negative"}`}>
          {formatCurrency(driver.effect, true, currencySymbol)}
        </strong>
        <span className="impact-driver-description">{driver.description}</span>
      </li>)}
    </ul>
  </section>;
}
