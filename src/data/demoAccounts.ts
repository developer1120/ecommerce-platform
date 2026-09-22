/**
 * A demo shop-owner account, so the admin area can be tried out. The mock
 * server creates it the first time someone signs in with this email. It is
 * a fixture for a demo with no real backend; never reuse it anywhere real.
 */
export const DEMO_ADMIN = {
  name: 'Studio Admin',
  email: 'admin@tanelt.test',
  password: 'tanelt-demo-admin',
} as const;
