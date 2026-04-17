import React from "react";

const LOGO = import.meta.env.BASE_URL + "policyengine-white.svg";

export default function SiteHeader() {
  return (
    <header className="site-header" aria-label="PolicyEngine">
      <div className="site-header-inner">
        <a
          className="site-header-brand"
          href="https://policyengine.org"
          aria-label="PolicyEngine home"
        >
          <img src={LOGO} alt="PolicyEngine" height="22" />
        </a>

        <nav className="site-header-nav" aria-label="PolicyEngine">
          <a href="https://policyengine.org/us/research">Research</a>
          <a href="https://policyengine.org/us/model">Model</a>
          <a href="https://policyengine.org/us/api">API</a>
          <a href="https://policyengine.org/us/about">About</a>
          <a
            className="site-header-donate"
            href="https://policyengine.org/us/donate"
          >
            Donate
          </a>
        </nav>
      </div>
    </header>
  );
}
