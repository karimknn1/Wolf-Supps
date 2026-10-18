import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.history.replaceState(null, '', '/#home');
  localStorage.clear();
  sessionStorage.clear();
  global.fetch = jest.fn((url) => Promise.resolve({
    ok: true,
    headers: { get: () => 'application/json; charset=utf-8' },
    json: () => Promise.resolve(url.includes('/api/products') ? [
      { id: 1, name: 'Whey Protein', detail: 'Vanilla bean · 24 servings', price: 34, category: 'Protein', image: '' },
    ] : { brand: 'Wolf Supps', country: 'Lebanon', wishMoneyNumber: '' }),
  }));
});

afterEach(() => {
  global.fetch.mockRestore();
});

test('renders Wolf Supps and lets customers add a product to the cart', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /stronger starts here/i })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Whey Protein' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add Whey Protein to cart' }));
  expect(screen.getByRole('link', { name: /cart 1/i })).toBeInTheDocument();
});

test('offers customer sign in and registration without a footer admin link', async () => {
  render(<App />);
  expect(await screen.findByRole('link', { name: 'SIGN IN' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'ADMIN' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'SIGN IN' }));
  expect(await screen.findByRole('heading', { name: /good to have you back/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'CREATE ACCOUNT' }));
  expect(screen.getByLabelText('FULL NAME')).toBeInTheDocument();
  expect(screen.getByLabelText('PHONE NUMBER')).toBeInTheDocument();
});

test('requires an account before showing checkout details', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Whey Protein' });
  fireEvent.click(screen.getByRole('button', { name: 'Add Whey Protein to cart' }));
  fireEvent.click(screen.getByRole('link', { name: /cart 1/i }));
  fireEvent.click(await screen.findByRole('link', { name: /proceed to checkout/i }));

  expect(await screen.findByRole('heading', { name: /sign in before checkout/i })).toBeInTheDocument();
  expect(screen.queryByLabelText('STREET ADDRESS')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: /create an account/i }));
  expect(await screen.findByRole('heading', { name: /join the pack/i })).toBeInTheDocument();
});

test('keeps the home page rendered when Vercel returns HTML for the catalog API', async () => {
  global.fetch.mockImplementation(() => Promise.resolve({
    ok: true,
    headers: { get: () => 'text/html; charset=utf-8' },
    json: () => Promise.reject(new Error('Unexpected token <')),
  }));

  render(<App />);

  expect(await screen.findByRole('heading', { name: /stronger starts here/i })).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent(/returned a webpage instead of data/i);
});
