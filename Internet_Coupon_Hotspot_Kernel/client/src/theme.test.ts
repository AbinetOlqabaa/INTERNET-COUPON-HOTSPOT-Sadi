import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("shared design tokens & theme stylesheet", () => {
  const themeCss = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
  const stylesCss = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

  it("defines centralized brand and semantic status colors", () => {
    expect(themeCss).toContain("--color-brand-primary");
    expect(themeCss).toContain("--color-brand-secondary");
    expect(themeCss).toContain("--color-brand-accent");
    expect(themeCss).toContain("--color-success");
    expect(themeCss).toContain("--color-warning");
    expect(themeCss).toContain("--color-danger");
    expect(themeCss).toContain("--radius-card");
    expect(themeCss).toContain("--shadow-card");
  });

  it("defines responsive application shell and sidebar classes", () => {
    expect(stylesCss).toContain(".app-container");
    expect(stylesCss).toContain(".sidebar");
    expect(stylesCss).toContain(".sidebar.collapsed");
    expect(stylesCss).toContain(".sidebar.mobile-open");
    expect(stylesCss).toContain(".sidebar-backdrop");
    expect(stylesCss).toContain("@media (max-width: 768px)");
  });

  it("defines accessible modal overlay and dialog styling", () => {
    expect(stylesCss).toContain(".modal-overlay");
    expect(stylesCss).toContain(".modal-card");
  });

  it("defines password visibility wrapper and toggle controls", () => {
    expect(stylesCss).toContain(".password-input-wrapper");
    expect(stylesCss).toContain(".password-toggle-btn");
  });

  it("defines role-based status badges and action button variants", () => {
    expect(stylesCss).toContain(".badge-super-admin");
    expect(stylesCss).toContain(".badge-owner");
    expect(stylesCss).toContain(".badge-staff");
    expect(stylesCss).toContain(".badge-active");
    expect(stylesCss).toContain(".badge-inactive");
    expect(stylesCss).toContain(".btn-primary");
    expect(stylesCss).toContain(".btn-secondary");
    expect(stylesCss).toContain(".btn-outline");
    expect(stylesCss).toContain(".btn-danger");
  });
});

