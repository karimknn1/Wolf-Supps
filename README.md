# Wolf Supps

Lebanon-focused supplements shop built with React, Express, and SQLite.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set a private `ADMIN_PASSWORD` and your receiving `WISH_MONEY_NUMBER`.
3. Run `npm start` and open [http://localhost:3000](http://localhost:3000).

The app creates `.data/wolf-supps.sqlite` and seeds the catalog on first run. The database stays on this machine and is ignored by Git. Back up that file to back up products, orders, and contact messages.

## Store admin

Open [http://localhost:3000/#admin](http://localhost:3000/#admin) and sign in with `ADMIN_PASSWORD`. Add or remove products, review orders, update order status, and read contact messages. Admin access is protected by a password and session token.

## Customer accounts

Customers can register or sign in from the `SIGN IN` link in the store header. An account is required before checkout; after signing in or creating an account, customers return to checkout. Orders are attached to the account and shown in its order history. Customer passwords are stored as salted hashes, not plain text.

## Checkout

Delivery is limited to Lebanon and checked by the API. Customers can choose Wish Money or cash on delivery. Wish Money is a manual transfer, not an automatic payment gateway: add the receiving number to `WISH_MONEY_NUMBER`, then confirm transfers against orders in the admin panel.

## Scripts

- `npm start` runs the API and React development server together.
- `npm test -- --watchAll=false` runs tests once.
- `npm run build` creates the production frontend build.
- `npm run server` starts only the API.