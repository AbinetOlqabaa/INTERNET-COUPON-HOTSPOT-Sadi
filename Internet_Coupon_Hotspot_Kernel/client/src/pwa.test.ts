import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 17: PWA Compliance, Web App Manifest & Android Specification', () => {
  const clientDir = resolve(__dirname, '..');
  const manifestPath = resolve(clientDir, 'public/manifest.webmanifest');
  const indexHtmlPath = resolve(clientDir, 'index.html');
  const capacitorPath = resolve(clientDir, '../capacitor.config.ts');

  it('provides a valid Web App Manifest with required installability fields', () => {
    expect(existsSync(manifestPath)).toBe(true);
    const content = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    expect(manifest.id).toBe('/');
    expect(manifest.name).toBe('Internet Coupon Hotspot');
    expect(manifest.short_name).toBe('Hotspot');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.theme_color).toBe('#102A43');
    expect(manifest.background_color).toBe('#0b1d30');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const hasAny = manifest.icons.some((i: any) => i.purpose === 'any');
    const hasMaskable = manifest.icons.some((i: any) => i.purpose === 'maskable');
    expect(hasAny).toBe(true);
    expect(hasMaskable).toBe(true);
  });

  it('includes mobile viewport, iOS web app tags, and manifest links in index.html', () => {
    expect(existsSync(indexHtmlPath)).toBe(true);
    const html = readFileSync(indexHtmlPath, 'utf8');

    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color" content="#102A43"');
  });

  it('defines valid Capacitor configuration for Android packaging', () => {
    expect(existsSync(capacitorPath)).toBe(true);
    const config = readFileSync(capacitorPath, 'utf8');

    expect(config).toContain("appId: 'com.hotspot.internetcoupon'");
    expect(config).toContain("appName: 'Internet Coupon Hotspot'");
    expect(config).toContain("webDir: 'dist'");
    expect(config).toContain("androidScheme: 'https'");
  });
});
