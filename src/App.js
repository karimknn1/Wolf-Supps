import { useEffect, useState } from 'react';
import './App.css';

const categories = ['All', 'Protein', 'Performance', 'Wellness'];
const emptyCheckout = { name: '', phone: '', address: '', city: '', country: 'Lebanon' };
const money = (value) => `$${Number(value || 0).toFixed(2)}`;

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    throw new Error('The store API returned a webpage instead of data. Check the Vercel API deployment.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function App() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || 'home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [store, setStore] = useState({ brand: 'Wolf Supps', country: 'Lebanon', wishMoneyNumber: '' });
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wolf-supps-cart') || '{}'); } catch { return {}; }
  });
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [checkout, setCheckout] = useState(emptyCheckout);
  const [orderReceipt, setOrderReceipt] = useState(null);
  const [contact, setContact] = useState({ name: '', email: '', subject: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [customerToken, setCustomerToken] = useState(() => sessionStorage.getItem('wolf-supps-customer') || '');
  const [customerAccount, setCustomerAccount] = useState(null);
  const [accountMode, setAccountMode] = useState('signin');
  const [checkoutAfterAuth, setCheckoutAfterAuth] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('wolf-supps-admin') || '');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminProducts, setAdminProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: '', detail: '', price: '', category: 'Protein', image: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const syncRoute = () => {
      setRoute(window.location.hash.slice(1) || 'home');
      setError('');
      setNotice('');
    };
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => {
    localStorage.setItem('wolf-supps-cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    Promise.all([request('/api/products'), request('/api/store')])
      .then(([catalog, storeInfo]) => {
        if (!Array.isArray(catalog) || !storeInfo || typeof storeInfo !== 'object') {
          throw new Error('The store API returned invalid data. Check the Vercel API deployment.');
        }
        setProducts(catalog);
        setStore(storeInfo);
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    if (route !== 'admin' || !adminToken) return;
    const headers = { Authorization: `Bearer ${adminToken}` };
    Promise.all([
      request('/api/products'),
      request('/api/admin/orders', { headers }),
      request('/api/admin/messages', { headers }),
    ]).then(([catalog, orderList, messageList]) => {
      if (!Array.isArray(catalog) || !Array.isArray(orderList) || !Array.isArray(messageList)) {
        throw new Error('The store API returned invalid data. Check the Vercel API deployment.');
      }
      setAdminProducts(catalog);
      setOrders(orderList);
      setMessages(messageList);
    }).catch((requestError) => {
      setError(requestError.message);
      if (requestError.message.includes('Sign in')) {
        sessionStorage.removeItem('wolf-supps-admin');
        setAdminToken('');
      }
    });
  }, [route, adminToken]);

  useEffect(() => {
    if (!['account', 'checkout'].includes(route) || !customerToken) {
      setCustomerAccount(null);
      return;
    }
    request('/api/customers/me', { headers: { Authorization: `Bearer ${customerToken}` } })
      .then((account) => {
        setCustomerAccount(account);
        setCheckout((current) => ({
          ...current,
          name: current.name || account.customer.name,
          phone: current.phone || account.customer.phone,
        }));
      })
      .catch((requestError) => {
        sessionStorage.removeItem('wolf-supps-customer');
        setCustomerToken('');
        setError(requestError.message);
      });
  }, [route, customerToken]);

  const cartLines = products.filter((product) => cart[product.id] > 0)
    .map((product) => ({ ...product, quantity: cart[product.id] }));
  const cartCount = cartLines.reduce((sum, product) => sum + product.quantity, 0);
  const cartTotal = cartLines.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const filteredProducts = products.filter((product) => {
    const matchesCategory = activeCategory === 'All' || product.category === activeCategory;
    const matchesSearch = `${product.name} ${product.detail} ${product.category}`.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  function changeQuantity(productId, amount) {
    setCart((current) => {
      const nextQuantity = (current[productId] || 0) + amount;
      const next = { ...current };
      if (nextQuantity < 1) delete next[productId];
      else next[productId] = Math.min(nextQuantity, 25);
      return next;
    });
  }

  async function submitOrder(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const receipt = await request('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({
          customer: checkout,
          country: 'Lebanon',
          paymentMethod,
          items: cartLines.map(({ id, quantity }) => ({ id, quantity })),
        }),
      });
      setOrderReceipt(receipt);
      setCart({});
      setRoute('checkout');
      window.location.hash = 'checkout';
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitContact(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await request('/api/contact', { method: 'POST', body: JSON.stringify(contact) });
      setContactSent(true);
      setContact({ name: '', email: '', subject: '', message: '' });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCustomerAuth(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const isRegistering = accountMode === 'register';
    const credentials = isRegistering
      ? accountForm
      : { email: accountForm.email, password: accountForm.password };
    try {
      const result = await request(`/api/customers/${isRegistering ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      sessionStorage.setItem('wolf-supps-customer', result.token);
      setCustomerToken(result.token);
      setCustomerAccount({ customer: result.customer, orders: [] });
      setCheckout((current) => ({
        ...current,
        name: current.name || result.customer.name,
        phone: current.phone || result.customer.phone,
      }));
      setAccountForm((current) => ({ ...current, password: '' }));
      const nextRoute = checkoutAfterAuth && cartCount > 0 ? 'checkout' : 'account';
      setCheckoutAfterAuth(false);
      setRoute(nextRoute);
      window.location.hash = nextRoute;
      setNotice(isRegistering ? 'Your Wolf Supps account is ready.' : 'Welcome back.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function logoutCustomer() {
    request('/api/customers/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
    }).catch(() => {});
    sessionStorage.removeItem('wolf-supps-customer');
    setCustomerToken('');
    setCustomerAccount(null);
    setAccountForm({ name: '', email: '', phone: '', password: '' });
    setAccountMode('signin');
    setNotice('You are signed out.');
  }

  async function loginAdmin(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: adminPassword }) });
      sessionStorage.setItem('wolf-supps-admin', result.token);
      setAdminToken(result.token);
      setAdminPassword('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createProduct(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const product = await request('/api/admin/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(newProduct),
      });
      setAdminProducts((current) => [product, ...current]);
      setProducts((current) => [product, ...current]);
      setNewProduct({ name: '', detail: '', price: '', category: 'Protein', image: '' });
      setNotice('Product added to your store.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(productId) {
    setError('');
    try {
      await request(`/api/admin/products/${productId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
      setAdminProducts((current) => current.filter((product) => product.id !== productId));
      setProducts((current) => current.filter((product) => product.id !== productId));
      setCart((current) => { const next = { ...current }; delete next[productId]; return next; });
      setNotice('Product removed from your store.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateOrderStatus(orderId, status) {
    setError('');
    try {
      await request(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status }),
      });
      setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function logoutAdmin() {
    sessionStorage.removeItem('wolf-supps-admin');
    setAdminToken('');
    setOrders([]);
    setMessages([]);
  }

  function renderProduct(product) {
    return <article className="shop-product" key={product.id}>
      <div className="shop-product-image">
        {product.image ? <img src={product.image} alt={product.name} loading="lazy" /> : <div className="product-placeholder"><span>WOLF</span><strong>{product.name}</strong><small>{product.category.toUpperCase()}</small></div>}
        <button className="add-product" aria-label={`Add ${product.name} to cart`} onClick={() => changeQuantity(product.id, 1)}>+</button>
      </div>
      <div className="shop-product-details"><div><h3>{product.name}</h3><strong>{money(product.price)}</strong></div><p>{product.detail}</p><span className="product-category">{product.category.toUpperCase()}</span></div>
    </article>;
  }

  function renderShop() {
    return <section className="content-page shop-page">
      <div className="page-heading"><div><p className="eyebrow">THE WOLF SUPPS LINEUP</p><h1>Shop <em>supplements.</em></h1></div><p>Everyday essentials for the work you put in. Delivery across Lebanon.</p></div>
      <div className="catalog-tools"><div className="category-tabs" role="group" aria-label="Filter products">{categories.map((category) => <button key={category} className={activeCategory === category ? 'category-tab active' : 'category-tab'} onClick={() => setActiveCategory(category)}>{category}</button>)}</div><label className="search-field"><span>SEARCH</span><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Product name" /></label></div>
      <div className="shop-product-grid">{filteredProducts.map(renderProduct)}{filteredProducts.length === 0 && <p className="empty-state">No products in this category yet.</p>}</div>
    </section>;
  }

  function renderCart() {
    return <section className="content-page narrow-page">
      <div className="page-heading"><div><p className="eyebrow">YOUR ORDER</p><h1>Shopping <em>cart.</em></h1></div><a className="text-link" href="#shop">CONTINUE SHOPPING <span>↗</span></a></div>
      {cartLines.length === 0 ? <div className="empty-bag"><span className="empty-mark">W.</span><h2>Your cart is taking a rest.</h2><p>Find the fuel for your next session.</p><a className="primary-link" href="#shop">SHOP SUPPLEMENTS <span>→</span></a></div> : <>
        <div className="cart-list">{cartLines.map((product) => <article className="cart-item" key={product.id}><div className="cart-product-image">{product.image ? <img src={product.image} alt="" /> : <span>W.</span>}</div><div className="cart-product-copy"><h2>{product.name}</h2><p>{product.detail}</p><span>{money(product.price)} each</span></div><div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)}>−</button><span>{product.quantity}</span><button aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)}>+</button></div><strong className="cart-line-total">{money(product.price * product.quantity)}</strong><button className="remove-item" aria-label={`Remove ${product.name}`} onClick={() => setCart((current) => { const next = { ...current }; delete next[product.id]; return next; })}>×</button></article>)}</div>
        <div className="cart-summary"><p><span>SUBTOTAL</span><strong>{money(cartTotal)}</strong></p><span className="delivery-note">Delivery across Lebanon. Delivery fees confirmed when we contact you.</span><a className="primary-link" href="#checkout">PROCEED TO CHECKOUT <span>→</span></a></div>
      </>}
    </section>;
  }

  function renderCheckout() {
    if (orderReceipt) return <section className="content-page narrow-page receipt-page"><p className="eyebrow">ORDER RECEIVED</p><span className="receipt-check">✓</span><h1>You’re in. <em>We’ve got it.</em></h1><p>Your order <strong>#{orderReceipt.orderId}</strong> is saved. We’ll contact you on your phone number to arrange delivery within Lebanon.</p>{orderReceipt.paymentMethod === 'wish' && <div className="wish-instructions"><strong>WISH MONEY TRANSFER</strong><p>Send {money(orderReceipt.total)} to <b>{store.wishMoneyNumber || 'the Wish Money number provided by the store'}</b> and include your order number as the transfer note. We’ll confirm your order after verification.</p></div>}<a className="primary-link" href="#shop">BACK TO SHOP <span>→</span></a></section>;
    if (cartLines.length === 0) return <section className="content-page narrow-page"><div className="empty-bag"><span className="empty-mark">W.</span><h2>Your cart is empty.</h2><a className="primary-link" href="#shop">SHOP SUPPLEMENTS <span>→</span></a></div></section>;
    if (!customerToken) return <section className="content-page narrow-page checkout-gate"><p className="eyebrow">ACCOUNT REQUIRED</p><span className="wolf-symbol">W.</span><h1>Sign in before<br /><em>checkout.</em></h1><p>Create an account or sign in to place your order and keep your order history together. Your delivery address and payment choice will be on the next step.</p><div className="checkout-gate-actions"><a className="primary-link" href="#account" onClick={() => { setCheckoutAfterAuth(true); setAccountMode('signin'); }}>SIGN IN <span>→</span></a><a className="text-link" href="#account" onClick={() => { setCheckoutAfterAuth(true); setAccountMode('register'); }}>CREATE AN ACCOUNT <span>↗</span></a></div></section>;
    if (!customerAccount) return <section className="content-page narrow-page"><p className="account-loading">Loading your account…</p></section>;
    return <section className="content-page narrow-page checkout-page">
      <div className="page-heading"><div><p className="eyebrow">DELIVERY IN LEBANON</p><h1>Checkout.</h1></div><a className="text-link" href="#cart">← BACK TO CART</a></div>
      <form className="checkout-layout" onSubmit={submitOrder}>
        <div className="checkout-fields"><section className="form-section"><h2>Where should we deliver?</h2><div className="form-grid"><label>FULL NAME<input required autoComplete="name" value={checkout.name} onChange={(event) => setCheckout({ ...checkout, name: event.target.value })} /></label><label>PHONE NUMBER<input required type="tel" autoComplete="tel" placeholder="+961" value={checkout.phone} onChange={(event) => setCheckout({ ...checkout, phone: event.target.value })} /></label><label className="full-field">STREET ADDRESS<input required autoComplete="street-address" value={checkout.address} onChange={(event) => setCheckout({ ...checkout, address: event.target.value })} /></label><label>CITY / AREA<input required autoComplete="address-level2" value={checkout.city} onChange={(event) => setCheckout({ ...checkout, city: event.target.value })} /></label><label>COUNTRY<input value="Lebanon" readOnly aria-readonly="true" /></label></div><p className="delivery-lock">↗ DELIVERY IS CURRENTLY AVAILABLE IN LEBANON ONLY</p></section>
          <fieldset className="form-section payment-options"><legend>How would you like to pay?</legend><label className={paymentMethod === 'wish' ? 'payment-option selected' : 'payment-option'}><input type="radio" name="payment" value="wish" checked={paymentMethod === 'wish'} onChange={() => setPaymentMethod('wish')} /><span className="payment-icon wish-icon">W</span><span><strong>Wish Money</strong><small>Transfer after placing your order</small></span><i /></label><label className={paymentMethod === 'cod' ? 'payment-option selected' : 'payment-option'}><input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} /><span className="payment-icon cod-icon">↗</span><span><strong>Cash on delivery</strong><small>Pay when your order arrives</small></span><i /></label>{paymentMethod === 'wish' && <p className="wish-hint">{store.wishMoneyNumber ? `Wish Money number: ${store.wishMoneyNumber}. Transfer instructions appear after you place the order.` : 'Wish Money is selected. The store needs to configure its receiving number before accepting transfers.'}</p>}</fieldset>
        </div>
        <aside className="checkout-summary"><p className="eyebrow">YOUR ORDER</p>{cartLines.map((product) => <div className="checkout-line" key={product.id}><span>{product.name} <small>× {product.quantity}</small></span><strong>{money(product.price * product.quantity)}</strong></div>)}<div className="checkout-total"><span>TOTAL</span><strong>{money(cartTotal)}</strong></div><p className="delivery-note">Delivery fee confirmed by phone after order placement.</p><button className="primary-button" disabled={busy}>{busy ? 'PLACING ORDER…' : 'PLACE ORDER'} <span>→</span></button><small className="secure-note">Your order details are stored securely for fulfillment.</small></aside>
      </form>
    </section>;
  }

  function renderContact() {
    return <section className="content-page contact-page"><div className="page-heading"><div><p className="eyebrow">WE’RE HERE FOR IT</p><h1>Talk to <em>the pack.</em></h1></div><p>Questions about an order, a product, or getting your delivery? Send a note and our team will get back to you.</p></div><div className="contact-layout"><div className="contact-note"><span className="wolf-symbol">W.</span><h2>Real people.<br />Real answers.</h2><p>We’re based in Lebanon and deliver across the country. Leave your number in your note if you’d like a call back.</p><span className="contact-country">BEIRUT, LEBANON <i>✳</i></span></div><form className="contact-form" onSubmit={submitContact}>{contactSent && <div className="success-notice">Your message is with our team. We’ll be in touch.</div>}<div className="form-grid"><label>YOUR NAME<input required value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} /></label><label>EMAIL ADDRESS<input required type="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></label><label className="full-field">SUBJECT<input required value={contact.subject} onChange={(event) => setContact({ ...contact, subject: event.target.value })} /></label><label className="full-field">MESSAGE<textarea required rows="5" value={contact.message} onChange={(event) => setContact({ ...contact, message: event.target.value })} /></label></div><button className="primary-button" disabled={busy}>{busy ? 'SENDING…' : 'SEND MESSAGE'} <span>→</span></button></form></div></section>;
  }

  function renderAccount() {
    if (!customerToken) return <section className="content-page account-page">
      <div className="account-panel">
        <p className="eyebrow">YOUR WOLF SUPPS ACCOUNT</p>
        <span className="wolf-symbol">W.</span>
        <h1>{accountMode === 'signin' ? <>Good to have<br /><em>you back.</em></> : <>Join the<br /><em>pack.</em></>}</h1>
        <p className="account-intro">{accountMode === 'signin' ? 'Sign in to see your orders and make your next checkout a little quicker.' : 'Create an account to keep your delivery details and order history together.'}</p>
        <div className="account-switch" role="group" aria-label="Account access">
          <button className={accountMode === 'signin' ? 'active' : ''} onClick={() => { setAccountMode('signin'); setError(''); }}>SIGN IN</button>
          <button className={accountMode === 'register' ? 'active' : ''} onClick={() => { setAccountMode('register'); setError(''); }}>CREATE ACCOUNT</button>
        </div>
        <form className="account-form" onSubmit={submitCustomerAuth}>
          {accountMode === 'register' && <><label>FULL NAME<input required autoComplete="name" maxLength="120" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} /></label><label>PHONE NUMBER<input required type="tel" autoComplete="tel" maxLength="40" placeholder="+961" value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })} /></label></>}
          <label>EMAIL ADDRESS<input required type="email" autoComplete="email" maxLength="180" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} /></label>
          <label>PASSWORD<input required type="password" autoComplete={accountMode === 'signin' ? 'current-password' : 'new-password'} minLength="10" maxLength="128" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} /></label>
          <button className="primary-button" disabled={busy}>{busy ? 'ONE MOMENT…' : accountMode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'} <span>→</span></button>
        </form>
        <p className="account-security">Your password is stored as a secure hash. Your account is only used for your orders and delivery details.</p>
      </div>
    </section>;

    if (!customerAccount) return <section className="content-page account-page"><p className="account-loading">Loading your account…</p></section>;

    return <section className="content-page customer-dashboard">
      <div className="page-heading"><div><p className="eyebrow">YOUR WOLF SUPPS ACCOUNT</p><h1>Hey, <em>{customerAccount.customer.name.split(' ')[0]}.</em></h1><p className="account-email">{customerAccount.customer.email}</p></div><button className="text-button" onClick={logoutCustomer}>SIGN OUT ↗</button></div>
      <div className="account-details"><div><span>DELIVERIES TO</span><strong>{customerAccount.customer.phone}</strong></div><p>When you sign in at checkout, your name and phone number are filled in for you.</p><a className="text-link" href="#shop">SHOP THE LINEUP <span>↗</span></a></div>
      <section className="customer-orders"><div className="admin-section-heading"><div><p className="eyebrow">YOUR PURCHASES</p><h2>Order history</h2></div><span>{customerAccount.orders.length} ORDERS</span></div>
        {customerAccount.orders.length === 0 ? <div className="customer-empty-orders"><span className="wolf-symbol">W.</span><p>Your orders will find their way here.</p><a className="primary-link" href="#shop">SHOP SUPPLEMENTS <span>→</span></a></div> : <div className="customer-order-list">{customerAccount.orders.map((order) => <article className="customer-order" key={order.id}><div className="customer-order-heading"><div><span>ORDER #{order.id} · {new Date(`${order.created_at.replace(' ', 'T')}Z`).toLocaleDateString()}</span><strong>{order.status}</strong></div><b>{money(order.total)}</b></div><p>{order.items.map((item) => `${item.name} × ${item.quantity}`).join(' · ')}</p><small>{order.payment_method === 'wish' ? 'WISH MONEY' : 'CASH ON DELIVERY'} · DELIVERING TO {order.city.toUpperCase()}, LEBANON</small></article>)}</div>}
      </section>
    </section>;
  }

  function renderAdmin() {
    if (!adminToken) return <section className="content-page admin-login-page"><div className="admin-login"><p className="eyebrow">WOLF SUPPS CONTROL ROOM</p><span className="wolf-symbol">W.</span><h1>Store <em>admin.</em></h1><p>Sign in to manage your products and customer orders.</p><form onSubmit={loginAdmin}><label>ADMIN PASSWORD<input required type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? 'SIGNING IN…' : 'SIGN IN'} <span>→</span></button></form><small>Set ADMIN_PASSWORD in your local .env.local file to enable access.</small></div></section>;
    return <section className="content-page admin-page"><div className="page-heading"><div><p className="eyebrow">WOLF SUPPS CONTROL ROOM</p><h1>Your <em>store.</em></h1></div><button className="text-button" onClick={logoutAdmin}>SIGN OUT ↗</button></div>
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">CATALOG</p><h2>Add a product</h2></div><span>{adminProducts.length} PRODUCTS</span></div><form className="admin-product-form" onSubmit={createProduct}><label>PRODUCT NAME<input required maxLength="100" value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} /></label><label>DETAIL<input required maxLength="180" value={newProduct.detail} onChange={(event) => setNewProduct({ ...newProduct, detail: event.target.value })} /></label><label>PRICE (USD)<input required min="0.01" max="100000" step="0.01" type="number" value={newProduct.price} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} /></label><label>CATEGORY<select value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label><label className="admin-image-field">IMAGE URL<input type="url" value={newProduct.image} onChange={(event) => setNewProduct({ ...newProduct, image: event.target.value })} placeholder="https://..." /></label><button className="primary-button" disabled={busy}>ADD PRODUCT <span>+</span></button></form>
        <div className="admin-table"><div className="admin-table-head"><span>PRODUCT</span><span>CATEGORY</span><span>PRICE</span><span>ACTION</span></div>{adminProducts.map((product) => <div className="admin-product-row" key={product.id}><strong>{product.name}<small>{product.detail}</small></strong><span>{product.category}</span><span>{money(product.price)}</span><button className="delete-button" onClick={() => deleteProduct(product.id)} aria-label={`Delete ${product.name}`}>REMOVE</button></div>)}</div>
      </section>
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">FULFILLMENT</p><h2>Customer orders</h2></div><span>{orders.length} ORDERS</span></div>{orders.length === 0 ? <p className="empty-state">New orders will appear here.</p> : <div className="admin-orders">{orders.map((order) => <article className="admin-order" key={order.id}><div className="order-heading"><div><span>ORDER #{order.id} · {new Date(`${order.created_at.replace(' ', 'T')}Z`).toLocaleString()}</span><h3>{order.customer_name}</h3></div><strong>{money(order.total)}</strong></div><p>{order.phone} · {order.address}, {order.city}, Lebanon</p><p className="order-items">{order.items.map((item) => `${item.name} × ${item.quantity}`).join(' · ')}</p><div className="order-management"><span className={`payment-pill ${order.payment_method}`}>{order.payment_method === 'wish' ? 'WISH MONEY' : 'CASH ON DELIVERY'}</span><select aria-label={`Status for order ${order.id}`} value={order.status} onChange={(event) => updateOrderStatus(order.id, event.target.value)}>{['New', 'Awaiting Wish Money', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></div></article>)}</div>}</section>
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">INBOX</p><h2>Contact messages</h2></div><span>{messages.length} MESSAGES</span></div>{messages.length === 0 ? <p className="empty-state">Customer messages will appear here.</p> : <div className="admin-orders">{messages.map((message) => <article className="admin-order" key={message.id}><div className="order-heading"><div><span>{message.email} · {message.created_at}</span><h3>{message.name}</h3></div></div><strong>{message.subject}</strong><p>{message.message}</p></article>)}</div>}</section>
    </section>;
  }

  function renderHome() {
    return <>
      <section className="hero" aria-labelledby="hero-heading"><img className="hero-image" src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=2200&q=85" alt="Weight training equipment in a gym" /><div className="hero-shade" /><div className="hero-content"><p className="hero-kicker"><span /> BUILT FOR THE WORK</p><h1 id="hero-heading">Stronger<br /><em>starts here.</em></h1><p className="hero-description">The right fuel for the days you show up. Find your next training essential.</p><a className="hero-cta" href="#shop">SHOP NOW <span>↘</span></a></div><div className="hero-caption"><span>LEBANON, WE’RE IN YOUR CORNER.</span><span>WOLF SUPPS · EST. FOR THE EVERYDAY</span></div><div className="hero-stamp"><span>FUEL<br />YOUR<br />FORM</span><b>W.</b></div></section>
      <section className="trust-strip" aria-label="Our commitments"><span>DELIVERY ACROSS LEBANON</span><i>✳</i><span>WISH MONEY OR CASH ON DELIVERY</span><i>✳</i><span>THE GEAR FOR YOUR DAILY WORK</span></section>
      <section className="shop-section home-featured" id="featured"><div className="shop-heading"><div><p className="eyebrow">THE DAILY LINEUP</p><h2>Find your <em>fuel.</em></h2></div><a className="text-link" href="#shop">SHOP ALL SUPPLEMENTS <span>↗</span></a></div><div className="shop-product-grid featured-grid">{products.slice(0, 4).map(renderProduct)}</div></section>
      <section className="manifesto"><div className="manifesto-image"><img src="https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=1200&q=80" alt="Athlete training at the gym" /><span>NO SHORTCUTS. JUST SHOWING UP.</span></div><div className="manifesto-copy"><p className="eyebrow">MADE FOR THE DAILY WORK</p><h2>Find your<br />kind of <em>strong.</em></h2><p>Early starts, late finishes, and every day in between. Wolf Supps is here to keep you moving.</p><a href="#shop" className="text-link">FIND YOUR EVERYDAY <span>↗</span></a><div className="manifesto-mark">W.</div></div></section>
    </>;
  }

  return <div className="storefront">
    <div className="announcement">DELIVERY ACROSS LEBANON <span>·</span> WISH MONEY & CASH ON DELIVERY</div>
    <header className="site-header"><button className="menu-toggle" aria-label="Toggle navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? 'CLOSE' : 'MENU'}</button><a className="wordmark" href="#home" aria-label="Wolf Supps home"><span className="wordmark-main">WOLF</span><span className="wordmark-sub">SUPPS</span></a><nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation"><a href="#home" onClick={() => setMenuOpen(false)}>HOME</a><a href="#shop" onClick={() => setMenuOpen(false)}>SHOP NOW</a><a href="#contact" onClick={() => setMenuOpen(false)}>CONTACT US</a></nav><div className="header-actions"><a className="icon-button account-trigger" href="#account">{customerToken ? 'MY ACCOUNT' : 'SIGN IN'}</a><a className="icon-button" href="#cart">CART <span className="bag-count">{cartCount}</span></a></div></header>
    {error && <div className="feedback-banner error-banner" role="alert">{error}<button aria-label="Dismiss message" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="feedback-banner success-banner" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
    <main id="top">{route === 'shop' ? renderShop() : route === 'cart' ? renderCart() : route === 'checkout' ? renderCheckout() : route === 'contact' ? renderContact() : route === 'account' ? renderAccount() : route === 'admin' ? renderAdmin() : renderHome()}</main>
    <footer className="site-footer"><a className="wordmark footer-mark" href="#home" aria-label="Wolf Supps home"><span className="wordmark-main">WOLF</span><span className="wordmark-sub">SUPPS</span></a><span>MADE FOR YOUR NEXT REP. DELIVERED ACROSS LEBANON.</span><nav><a href="#shop">SHOP</a><a href="#contact">CONTACT</a></nav><span>© WOLF SUPPS 2026</span></footer>
  </div>;
}

export default App;