import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeConfig } from '../src/config.js';

test('normalizes a minimal config with a mobile device matrix', () => {
  const config = normalizeConfig({
    target: { name: 'Example', baseUrl: 'https://example.com' },
  });

  assert.equal(config.target.name, 'Example');
  assert.deepEqual(config.routes, ['/']);
  assert.equal(config.devices.length, 2);
  assert.equal(config.unlighthouse.budget, 80);
});

test('rejects an invalid unlighthouse budget', () => {
  assert.throws(() => normalizeConfig({
    target: { baseUrl: 'https://example.com' },
    unlighthouse: { budget: 101 },
  }));
});

test('rejects malformed scenario steps before browser execution', () => {
  assert.throws(
    () => normalizeConfig({
      target: { baseUrl: 'https://example.com' },
      scenarios: [{
        id: 'settings',
        name: 'Open settings',
        path: '/',
        steps: [{
          action: 'tap',
          target: { role: 'button', text: 'Settings' },
        }],
      }],
    }),
    /must define exactly one of selector, testId, role, or text/,
  );

  assert.throws(
    () => normalizeConfig({
      target: { baseUrl: 'https://example.com' },
      scenarios: [{
        id: 'search',
        name: 'Search',
        path: '/',
        steps: [{ action: 'fill', target: { testId: 'search' }, value: 42 }],
      }],
    }),
    /scenario search\.steps\[0\]\.value must be a string/,
  );
});

test('validates custom device contracts instead of trusting casts', () => {
  assert.throws(
    () => normalizeConfig({
      target: { baseUrl: 'https://example.com' },
      devices: [{
        id: 'phone',
        name: 'Phone',
        browser: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: 'true',
        hasTouch: true,
      }],
    }),
    /devices\[0\]\.isMobile must be a boolean/,
  );

  const config = normalizeConfig({
    target: { baseUrl: 'https://example.com' },
    devices: [{
      id: 'phone',
      name: 'Phone',
      browser: 'chromium',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }],
  });

  assert.equal(config.devices[0]?.id, 'phone');
  assert.equal(config.devices[0]?.viewport.width, 390);
});

test('rejects duplicate work identities and malformed booleans', () => {
  assert.throws(
    () => normalizeConfig({
      target: { baseUrl: 'https://example.com' },
      scenarios: [
        { id: 'settings', name: 'Settings A', path: '/', steps: [] },
        { id: 'settings', name: 'Settings B', path: '/other', steps: [] },
      ],
    }),
    /duplicate scenario id 'settings'/,
  );

  assert.throws(
    () => normalizeConfig({
      target: { baseUrl: 'https://example.com' },
      routes: ['/', '/'],
    }),
    /duplicate route '\/'/,
  );

  assert.throws(
    () => normalizeConfig({
      target: { baseUrl: 'https://example.com' },
      unlighthouse: { enabled: 'false' },
    }),
    /unlighthouse\.enabled must be a boolean/,
  );
});
