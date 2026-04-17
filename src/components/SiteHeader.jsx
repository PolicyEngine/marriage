import React from "react";

const LOGO = import.meta.env.BASE_URL + "policyengine-white.svg";

export default function SiteHeader() {
  return (
    <header className="site-header" aria-label="PolicyEngine">
      <div className="site-header-inner">
        <a
          className="site-header-brand"
          href="https://policyengine.org"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="PolicyEngine home"
        >
          <img src={LOGO} alt="PolicyEngine" height="22" />
        </a>

        <nav className="site-header-nav" aria-label="PolicyEngine">
          <a href="https://policyengine.org/us/research" target="_blank" rel="noopener noreferrer">Research</a>
          <a href="https://policyengine.org/us/model" target="_blank" rel="noopener noreferrer">Model</a>
          <a href="https://policyengine.org/us/api" target="_blank" rel="noopener noreferrer">API</a>
          <a href="https://policyengine.org/us/about" target="_blank" rel="noopener noreferrer">About</a>
          <a
            className="site-header-donate"
            href="https://policyengine.org/us/donate"
            target="_blank"
            rel="noopener noreferrer"
          >
            Donate
          </a>
        </nav>
      </div>
    </header>
  );
}
