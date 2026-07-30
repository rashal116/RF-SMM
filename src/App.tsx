import React, { useState, useEffect } from 'react';
import {
  db,
  doc,
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  DEFAULT_SERVICES
} from './firebase';

interface ServiceData {
  id: string;
  category: string;
  name: string;
  price: number;
  min: number;
  max: number;
  desc?: string;
  apiServiceId?: string;
}

interface OrderData {
  id: string;
  uid: string;
  service: string;
  qty: number;
  link: string;
  cost: number;
  status: string;
  timestamp?: any;
  createdAt?: string;
  apiOrderId?: string | number;
  apiError?: string;
  apiStatus?: string;
}

interface DepositRequest {
  id: string;
  uid: string;
  amount: number;
  trxId: string;
  method: string;
  status: string;
  timestamp?: any;
}

interface UserSession {
  uid: string;
  username: string;
  name: string;
}

// Legacy Service ID Mapper to ensure SMMGen API receives real working service IDs
const SERVICE_ID_MAP: Record<string, string> = {
  '101': '15806', // FB Followers (30D Refill)
  '102': '16869', // FB Post Likes
  '201': '19382', // IG Followers
  '202': '13330', // IG Likes
  '301': '16393', // TikTok Followers
  '302': '16356', // TikTok Likes
  '401': '9622',  // YouTube Subscribers
  '402': '18918', // YouTube Views
  '501': '18384'  // Telegram Members
};

export default function App() {
  // Splash & Auth State
  const [showSplash, setShowSplash] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // Form states for auth
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginUserErr, setLoginUserErr] = useState('');
  const [loginPassErr, setLoginPassErr] = useState('');

  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPass, setRegConfirmPass] = useState('');
  const [regNameErr, setRegNameErr] = useState('');
  const [regUserErr, setRegUserErr] = useState('');
  const [regPassErr, setRegPassErr] = useState('');
  const [regConfirmErr, setRegConfirmErr] = useState('');

  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Main App State
  const [activeTab, setActiveTab] = useState<'home' | 'orders' | 'funds' | 'support'>('home');
  const [userBalance, setUserBalance] = useState(0);
  const [userTotalOrders, setUserTotalOrders] = useState(0);

  // Home Page Order Form State
  const [allServices, setAllServices] = useState<ServiceData[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [currentService, setCurrentService] = useState<ServiceData | null>(null);
  const [targetLink, setTargetLink] = useState('');
  const [quantity, setQuantity] = useState<number>(100);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  // Form Field Errors
  const [catErr, setCatErr] = useState('');
  const [svcErr, setSvcErr] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [qtyErr, setQtyErr] = useState('');

  // Orders State
  const [ordersList, setOrdersList] = useState<OrderData[]>([]);

  // Funds State
  const [selectedMethod, setSelectedMethod] = useState<'bkash' | 'nagad' | 'rocket'>('bkash');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositTrxId, setDepositTrxId] = useState<string>('');
  const [depAmtErr, setDepAmtErr] = useState('');
  const [depTrxErr, setDepTrxErr] = useState('');
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositHistory, setDepositHistory] = useState<DepositRequest[]>([]);

  // Modal Confirm State
  const [modalConfig, setModalConfig] = useState<{
    show: boolean;
    title: string;
    bodyHtml: React.ReactNode;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    bodyHtml: null,
    onConfirm: () => {}
  });

  // Toasts
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: string }>>([]);

  const tg = (window as any).Telegram?.WebApp || null;

  // Haptic Feedback Helper
  const haptic = (type: 'light' | 'heavy' | 'success' | 'error' = 'light') => {
    if (!tg?.HapticFeedback) return;
    try {
      if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else if (type === 'heavy') tg.HapticFeedback.impactOccurred('heavy');
      else tg.HapticFeedback.impactOccurred('light');
    } catch (_) {}
  };

  const showToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  // Simple Password Hash
  const simpleHash = async (str: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(str + 'firstsmm_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  // 1. Initial Load & Auto Login Check
  useEffect(() => {
    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (_) {}
    }

    const initApp = async () => {
      try {
        const saved = localStorage.getItem('smm_session');
        if (saved) {
          const session = JSON.parse(saved);
          if (session.uid && session.username) {
            const uSnap = await getDoc(doc(db, 'auth_users', session.uid));
            if (uSnap.exists()) {
              setCurrentUser(session);
              setIsLoggedIn(true);
            } else {
              localStorage.removeItem('smm_session');
            }
          }
        }
      } catch (_) {
        localStorage.removeItem('smm_session');
      }

      setTimeout(() => {
        setShowSplash(false);
      }, 2000);
    };

    initApp();
  }, []);

  // 2. Realtime User Info Sync
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.uid) return;

    const userRef = doc(db, 'users', currentUser.uid);

    // Initialize user doc if missing
    getDoc(userRef).then(async (snap) => {
      if (!snap.exists()) {
        await setDoc(userRef, {
          name: currentUser.name || 'User',
          balance: 0,
          total_orders: 0,
          createdAt: serverTimestamp()
        });
      }
    });

    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setUserBalance(d.balance || 0);
        setUserTotalOrders(d.total_orders || 0);
      }
    });

    return () => unsubscribe();
  }, [isLoggedIn, currentUser]);

  // 3. Realtime Services Loading & Seeding Defaults
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'services'), async (snapshot) => {
      if (snapshot.empty) {
        // Seed initial services in Firestore so user can order instantly
        for (const svc of DEFAULT_SERVICES) {
          await addDoc(collection(db, 'services'), svc);
        }
        return;
      }

      const list: ServiceData[] = [];
      const catsSet = new Set<string>();
      const existingNames = new Set<string>();
      const existingApiIds = new Set<string>();

      snapshot.forEach((d) => {
        const data = { id: d.id, ...d.data() } as ServiceData;
        existingNames.add(data.name);
        if (data.apiServiceId) existingApiIds.add(data.apiServiceId);

        const defSvc = DEFAULT_SERVICES.find(
          (s) => s.name === data.name || (s.apiServiceId && s.apiServiceId === data.apiServiceId)
        );
        if (defSvc && data.price < defSvc.price) {
          data.price = defSvc.price;
          updateDoc(doc(db, 'services', d.id), { price: defSvc.price }).catch(() => {});
        }
        list.push(data);
        if (data.category) catsSet.add(data.category);
      });

      // Auto-add missing default services into Firestore
      for (const defSvc of DEFAULT_SERVICES) {
        if (!existingNames.has(defSvc.name) && !existingApiIds.has(defSvc.apiServiceId)) {
          addDoc(collection(db, 'services'), defSvc).catch(() => {});
        }
      }

      setAllServices(list);
      setCategories(Array.from(catsSet).sort());
    });

    return () => unsub();
  }, []);

  // 4. Realtime Orders Sync
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.uid) return;

    const q = query(collection(db, 'orders'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: OrderData[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.uid === currentUser.uid) {
          list.push({ id: docSnap.id, ...data } as OrderData);
        }
      });
      setOrdersList(list);
    });

    return () => unsub();
  }, [isLoggedIn, currentUser]);

  // 5. Realtime Deposit Requests Sync
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.uid) return;

    const q = query(
      collection(db, 'deposit_requests'),
      where('uid', '==', currentUser.uid),
      orderBy('timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: DepositRequest[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DepositRequest);
      });
      setDepositHistory(list);
    });

    return () => unsub();
  }, [isLoggedIn, currentUser]);

  // Handler: Login
  const handleLogin = async () => {
    if (authSubmitting) return;
    setLoginUserErr('');
    setLoginPassErr('');

    let err = false;
    if (!loginUsername.trim()) {
      setLoginUserErr('Username is required');
      err = true;
    }
    if (!loginPassword) {
      setLoginPassErr('Password is required');
      err = true;
    }
    if (err) {
      haptic('error');
      return;
    }

    setAuthSubmitting(true);
    haptic('heavy');

    try {
      const qUser = query(
        collection(db, 'auth_users'),
        where('username', '==', loginUsername.trim().toLowerCase())
      );
      const snap = await getDocs(qUser);

      if (snap.empty) {
        setLoginUserErr('Account not found. Please register first.');
        haptic('error');
        setAuthSubmitting(false);
        return;
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data();
      const hashedPass = await simpleHash(loginPassword);

      if (userData.password !== hashedPass) {
        setLoginPassErr('Incorrect password');
        haptic('error');
        setAuthSubmitting(false);
        return;
      }

      const session = { uid: userDoc.id, username: userData.username, name: userData.name };
      currentUserSessionLogin(session);
      showToast(`Welcome back, ${userData.name}!`, 'success');
    } catch (e: any) {
      console.error('Login error:', e);
      haptic('error');
      showToast('Login failed. Please try again.', 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Handler: Register
  const handleRegister = async () => {
    if (authSubmitting) return;
    setRegNameErr('');
    setRegUserErr('');
    setRegPassErr('');
    setRegConfirmErr('');

    const name = regName.trim();
    const username = regUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const password = regPassword;
    const confirm = regConfirmPass;

    let err = false;
    if (!name || name.length < 2) {
      setRegNameErr('Name is required (min 2 chars)');
      err = true;
    }
    if (!username || username.length < 3) {
      setRegUserErr('Username required (min 3 chars, letters/numbers)');
      err = true;
    }
    if (!password || password.length < 6) {
      setRegPassErr('Password required (min 6 chars)');
      err = true;
    }
    if (password !== confirm) {
      setRegConfirmErr('Passwords do not match');
      err = true;
    }
    if (err) {
      haptic('error');
      return;
    }

    setAuthSubmitting(true);
    haptic('heavy');

    try {
      const qUser = query(collection(db, 'auth_users'), where('username', '==', username));
      const existing = await getDocs(qUser);
      if (!existing.empty) {
        setRegUserErr('This username is already taken');
        haptic('error');
        setAuthSubmitting(false);
        return;
      }

      const hashedPass = await simpleHash(password);
      const newDoc = doc(collection(db, 'auth_users'));
      const uid = newDoc.id;

      await setDoc(newDoc, {
        username,
        name,
        password: hashedPass,
        createdAt: serverTimestamp(),
        telegramId: tg?.initDataUnsafe?.user?.id || null
      });

      await setDoc(doc(db, 'users', uid), {
        name,
        balance: 0,
        total_orders: 0,
        createdAt: serverTimestamp()
      });

      const session = { uid, username, name };
      currentUserSessionLogin(session);
      showToast('Account created successfully!', 'success');
    } catch (e: any) {
      console.error('Registration error:', e);
      haptic('error');
      showToast('Registration failed.', 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Telegram Login
  const loginWithTelegram = async () => {
    if (!tg?.initDataUnsafe?.user) {
      showToast('Open this app inside Telegram to auto-connect', 'warning');
      return;
    }
    haptic('heavy');
    const tgUser = tg.initDataUnsafe.user;
    const username = (tgUser.username || `tg_${tgUser.id}`).toLowerCase().replace(/[^a-z0-9_]/g, '');
    const name = tgUser.first_name || 'Telegram User';

    try {
      const q = query(collection(db, 'auth_users'), where('telegramId', '==', tgUser.id));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        const session = { uid: userDoc.id, username: userData.username, name: userData.name };
        currentUserSessionLogin(session);
        showToast(`Welcome, ${userData.name}!`, 'success');
      } else {
        const finalUsername =
          username.length >= 3 ? username : `tg_${String(tgUser.id).slice(-6)}`;
        const newDoc = doc(collection(db, 'auth_users'));
        const uid = newDoc.id;

        await setDoc(newDoc, {
          username: finalUsername,
          name,
          password: '',
          createdAt: serverTimestamp(),
          telegramId: tgUser.id
        });

        await setDoc(
          doc(db, 'users', uid),
          { name, balance: 0, total_orders: 0, createdAt: serverTimestamp() },
          { merge: true }
        );

        const session = { uid, username: finalUsername, name };
        currentUserSessionLogin(session);
        showToast('Telegram account connected!', 'success');
      }
    } catch (e) {
      console.error('TG Login error:', e);
      haptic('error');
      showToast('Failed to connect with Telegram', 'error');
    }
  };

  const currentUserSessionLogin = (session: UserSession) => {
    localStorage.setItem('smm_session', JSON.stringify(session));
    setCurrentUser(session);
    setIsLoggedIn(true);
    haptic('success');
  };

  const handleLogout = () => {
    setModalConfig({
      show: true,
      title: 'Logout',
      bodyHtml: <p className="text-slate-300 text-sm">Are you sure you want to logout?</p>,
      onConfirm: () => {
        localStorage.removeItem('smm_session');
        setIsLoggedIn(false);
        setCurrentUser(null);
        showToast('Logged out', 'info');
      }
    });
  };

  // Category Change
  const handleCategoryChange = (cat: string) => {
    haptic('light');
    setSelectedCategory(cat);
    setCatErr('');
    setSelectedServiceId('');
    setCurrentService(null);
    setSvcErr('');
  };

  // Service Change
  const handleServiceChange = (svcId: string) => {
    haptic('light');
    setSelectedServiceId(svcId);
    setSvcErr('');
    const found = allServices.find((s) => s.id === svcId) || null;
    setCurrentService(found);
    if (found?.min) {
      setQuantity(found.min);
    }
  };

  // Cost calculation
  const calculatedCost = currentService ? (currentService.price * quantity) / 1000 : 0;

  // SMMGen API Call Helper
  const placeSmmGenOrderApi = async (
    serviceId: string,
    link: string,
    qty: number
  ): Promise<{ error?: string; order?: number; status?: string }> => {
    const apiKey = 'abb6b46205ede0b57a7c53580646fc7a';
    const mappedService = SERVICE_ID_MAP[serviceId] || serviceId;
    const finalService = mappedService && mappedService.length >= 4 ? mappedService : '15806';

    const queryParams = new URLSearchParams({
      key: apiKey,
      action: 'add',
      service: String(finalService),
      link: String(link),
      quantity: String(qty)
    }).toString();

    // 1. Try Netlify / Vite Proxy GET endpoint
    try {
      const res = await fetch(`/api/smm/order?${queryParams}`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().startsWith('{')) {
          const json = JSON.parse(text);
          if (json.order || json.error) return json;
        }
      }
    } catch (e) {
      console.warn('GET proxy attempt failed:', e);
    }

    // 2. Try Netlify / Vite Proxy POST endpoint
    try {
      const proxyRes = await fetch('/api/smm/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: finalService,
          link,
          quantity: qty,
          apiKey,
          apiBase: 'https://my.smmgen.com/api/v2'
        })
      });

      if (proxyRes.ok) {
        const text = await proxyRes.text();
        if (text && text.trim().startsWith('{')) {
          const json = JSON.parse(text);
          if (json.order || json.error) return json;
        }
      }
    } catch (e) {
      console.warn('POST proxy attempt failed:', e);
    }

    // 3. Fallback: Direct fetch
    try {
      const targetUrl = `https://my.smmgen.com/api/v2?${queryParams}`;
      const res = await fetch(targetUrl);
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch (e) {
      console.warn('Direct fetch failed:', e);
    }

    return { error: 'API connection error. Please check your netlify redirect setup.' };
  };

  // Place Order Action
  const handlePlaceOrderClick = () => {
    setCatErr('');
    setSvcErr('');
    setLinkErr('');
    setQtyErr('');

    if (!selectedCategory) {
      setCatErr('Please select a category');
      haptic('error');
      return;
    }
    if (!selectedServiceId || !currentService) {
      setSvcErr('Please select a service');
      haptic('error');
      return;
    }
    if (!targetLink.trim() || targetLink.trim().length < 5) {
      setLinkErr('Please enter a valid link/URL');
      haptic('error');
      return;
    }

    const minQty = currentService.min || 10;
    const maxQty = currentService.max || 999999999;

    if (!quantity || quantity < minQty) {
      setQtyErr(`Minimum quantity is ${minQty}`);
      haptic('error');
      return;
    }
    if (quantity > maxQty) {
      setQtyErr(`Maximum quantity is ${maxQty.toLocaleString()}`);
      haptic('error');
      return;
    }

    if (userBalance < calculatedCost) {
      haptic('error');
      setModalConfig({
        show: true,
        title: 'Insufficient Balance',
        bodyHtml: (
          <div className="space-y-2">
            <p className="text-slate-300 text-xs">You need more Coins to place this order.</p>
            <div className="bg-red-500/10 border border-red-500/15 rounded-xl p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400 text-xs">Required Cost:</span>
                <span className="font-bold text-red-400">{calculatedCost.toFixed(2)} Coins</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-xs">Your Balance:</span>
                <span className="font-bold">{userBalance.toFixed(2)} Coins</span>
              </div>
              <div className="flex justify-between border-t border-red-500/10 pt-1 mt-1">
                <span className="text-slate-400 text-xs">Shortage:</span>
                <span className="font-extrabold text-red-400">
                  {(calculatedCost - userBalance).toFixed(2)} Coins
                </span>
              </div>
            </div>
          </div>
        ),
        onConfirm: () => setActiveTab('funds')
      });
      return;
    }

    // Confirm Modal
    setModalConfig({
      show: true,
      title: 'Confirm Your Order',
      bodyHtml: (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-1.5 border-b border-dashed border-slate-700">
            <span className="text-slate-400">Service</span>
            <span className="font-bold text-right max-w-[60%]">{currentService.name}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-dashed border-slate-700">
            <span className="text-slate-400">Quantity</span>
            <span className="font-bold">{quantity.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-dashed border-slate-700">
            <span className="text-slate-400">Cost</span>
            <span className="font-bold text-blue-400">{calculatedCost.toFixed(2)} Coins</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-400">Remaining Balance</span>
            <span className="font-bold">{(userBalance - calculatedCost).toFixed(2)} Coins</span>
          </div>
        </div>
      ),
      onConfirm: () => executeOrderSubmission()
    });
  };

  const executeOrderSubmission = async () => {
    if (!currentUser || !currentService || orderSubmitting) return;

    setOrderSubmitting(true);
    haptic('heavy');

    try {
      const cost = calculatedCost;
      const sname = currentService.name;
      const link = targetLink.trim();
      const qty = quantity;
      const apiSvcId = currentService.apiServiceId || '15806';

      // 1. Create order document in Firestore
      const orderRef = await addDoc(collection(db, 'orders'), {
        uid: currentUser.uid,
        service: sname,
        qty,
        link,
        cost,
        status: 'Pending',
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      });

      // 2. Deduct user balance in Firestore
      const newBalance = userBalance - cost;
      const newOrdersCount = userTotalOrders + 1;
      await updateDoc(doc(db, 'users', currentUser.uid), {
        balance: newBalance,
        total_orders: newOrdersCount
      });

      setUserBalance(newBalance);
      setUserTotalOrders(newOrdersCount);

      // 3. Trigger SMMGen API call
      showToast('Sending order to SMM Panel...', 'info');
      const apiResponse = await placeSmmGenOrderApi(apiSvcId, link, qty);

      if (apiResponse.order) {
        // API Success
        await updateDoc(doc(db, 'orders', orderRef.id), {
          apiOrderId: apiResponse.order,
          apiStatus: apiResponse.status || 'processing',
          status: 'Processing',
          processedAt: serverTimestamp()
        });
        haptic('success');
        showToast(`✅ Order sent to SMM Panel! ID: ${apiResponse.order}`, 'success');
      } else {
        // API returned error
        const apiErr = apiResponse.error || 'Failed to submit to SMM provider';
        await updateDoc(doc(db, 'orders', orderRef.id), {
          apiError: apiErr
        });
        haptic('error');
        showToast(`⚠️ Order saved locally. API error: ${apiErr}`, 'warning');
      }

      // Reset form fields
      setTargetLink('');
      setQuantity(100);
      setSelectedServiceId('');
      setCurrentService(null);
      setSelectedCategory('');

      setTimeout(() => {
        setActiveTab('orders');
      }, 1000);
    } catch (e: any) {
      console.error('Order error:', e);
      haptic('error');
      showToast('Failed to process order: ' + e.message, 'error');
    } finally {
      setOrderSubmitting(false);
    }
  };

  // Retry API order
  const handleRetryOrder = async (order: OrderData) => {
    haptic('heavy');
    showToast('Retrying SMM Panel dispatch...', 'info');

    try {
      const serviceObj = allServices.find((s) => s.name === order.service);
      const apiSvcId = serviceObj?.apiServiceId || '101';

      const res = await placeSmmGenOrderApi(apiSvcId, order.link, order.qty);

      if (res.order) {
        await updateDoc(doc(db, 'orders', order.id), {
          apiOrderId: res.order,
          apiStatus: res.status || 'processing',
          status: 'Processing',
          apiError: null,
          processedAt: serverTimestamp()
        });
        haptic('success');
        showToast(`✅ Order dispatched! API ID: ${res.order}`, 'success');
      } else {
        showToast(`Retry failed: ${res.error || 'Unknown error'}`, 'error');
      }
    } catch (err: any) {
      showToast('Retry error: ' + err.message, 'error');
    }
  };

  // Submit Deposit Request
  const handleSubmitDeposit = async () => {
    setDepAmtErr('');
    setDepTrxErr('');

    const amt = parseFloat(depositAmount);
    const trx = depositTrxId.trim().toUpperCase();

    let err = false;
    if (isNaN(amt) || amt < 50) {
      setDepAmtErr('Minimum amount is ৳ 50');
      err = true;
    }
    if (amt > 50000) {
      setDepAmtErr('Maximum amount is ৳ 50,000');
      err = true;
    }
    if (!trx || trx.length < 4) {
      setDepTrxErr('Please enter a valid Transaction ID');
      err = true;
    }
    if (err) {
      haptic('error');
      return;
    }

    if (!currentUser?.uid || depositSubmitting) return;

    setDepositSubmitting(true);
    haptic('heavy');

    try {
      await addDoc(collection(db, 'deposit_requests'), {
        uid: currentUser.uid,
        amount: amt,
        trxId: trx,
        method: selectedMethod,
        status: 'Pending',
        timestamp: serverTimestamp()
      });

      haptic('success');
      showToast('Deposit request submitted! Admin will verify soon.', 'success');
      setDepositAmount('');
      setDepositTrxId('');
    } catch (e: any) {
      console.error('Deposit error:', e);
      haptic('error');
      showToast('Failed to submit deposit request', 'error');
    } finally {
      setDepositSubmitting(false);
    }
  };

  const copyNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    haptic('success');
    showToast('Number copied to clipboard!', 'success');
  };

  // Payment Methods Map
  const paymentMethodsConfig = {
    bkash: { label: 'bKash Merchant', number: '01781119650', icon: 'b' },
    nagad: { label: 'Nagad Merchant', number: '01781119650', icon: 'N' },
    rocket: { label: 'Rocket Personal', number: '01781119650', icon: 'R' }
  };

  return (
    <div className="max-w-[480px] mx-auto min-h-screen relative pb-28">
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.type}`}>
            <i
              className={`fas ${
                t.type === 'success'
                  ? 'fa-check-circle'
                  : t.type === 'error'
                  ? 'fa-times-circle'
                  : t.type === 'warning'
                  ? 'fa-exclamation-triangle'
                  : 'fa-info-circle'
              }`}
            ></i>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      <div className={`modal-overlay ${modalConfig.show ? 'show' : ''}`}>
        <div className="modal-sheet">
          <div className="modal-handle"></div>
          <h3 className="text-lg font-black mb-2">{modalConfig.title}</h3>
          <div className="mb-6">{modalConfig.bodyHtml}</div>
          <div className="flex gap-3">
            <button
              onClick={() => setModalConfig((prev) => ({ ...prev, show: false }))}
              className="btn-secondary-solid flex-1"
              style={{ padding: '14px' }}
            >
              CANCEL
            </button>
            <button
              onClick={() => {
                setModalConfig((prev) => ({ ...prev, show: false }));
                modalConfig.onConfirm();
              }}
              className="btn-primary-solid flex-1"
              style={{ padding: '14px' }}
            >
              CONFIRM
            </button>
          </div>
        </div>
      </div>

      {/* Splash Screen */}
      {showSplash && (
        <div className="fixed inset-0 z-[9999] splash-bg flex flex-col items-center justify-center">
          <div className="splash-icon w-24 h-24 rounded-[28px] flex items-center justify-center animate-bounce">
            <i className="fas fa-bolt text-white text-4xl"></i>
          </div>
          <h1 className="mt-6 text-2xl font-black text-white tracking-tight">RF SMM</h1>
          <p className="text-slate-500 text-[10px] font-bold mt-1.5 tracking-widest uppercase">
            Bangladesh's #1 Panel
          </p>
          <div className="splash-loader mt-8">
            <div className="splash-loader-fill"></div>
          </div>
        </div>
      )}

      {/* Auth Screen */}
      {!showSplash && !isLoggedIn && (
        <div className="fixed inset-0 z-[8000] bg-[#030712] flex flex-col items-center justify-center p-6">
          <div className="auth-logo">
            <i className="fas fa-bolt text-white text-3xl"></i>
          </div>
          <h1 className="text-2xl font-black tracking-tight mb-1 text-white">RF SMM</h1>
          <p className="text-xs font-bold tracking-widest uppercase mb-8 text-slate-400">
            Bangladesh's #1 Panel
          </p>

          <div className="auth-card auth-animate w-full">
            <div className="auth-tab">
              <button
                className={`auth-tab-btn ${authTab === 'login' ? 'active-tab' : ''}`}
                onClick={() => {
                  setAuthTab('login');
                  haptic('light');
                }}
              >
                Login
              </button>
              <button
                className={`auth-tab-btn ${authTab === 'register' ? 'active-tab' : ''}`}
                onClick={() => {
                  setAuthTab('register');
                  haptic('light');
                }}
              >
                Register
              </button>
            </div>

            {authTab === 'login' ? (
              <div>
                <div className="mb-3">
                  <label className="form-label">Username</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Enter your username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                  />
                  {loginUserErr && <p className="auth-error show">{loginUserErr}</p>}
                </div>
                <div className="mb-4">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                  {loginPassErr && <p className="auth-error show">{loginPassErr}</p>}
                </div>
                <button
                  className="btn-primary-solid flex items-center justify-center gap-2"
                  onClick={handleLogin}
                  disabled={authSubmitting}
                >
                  {authSubmitting ? (
                    <span className="loading-spinner"></span>
                  ) : (
                    <>
                      <i className="fas fa-sign-in-alt text-xs"></i>
                      <span>LOGIN</span>
                    </>
                  )}
                </button>
                <div className="auth-divider">OR</div>
                <button className="auth-tg-btn" onClick={loginWithTelegram}>
                  <i className="fab fa-telegram text-[#2AABEE] text-lg"></i>
                  <span>Continue with Telegram</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Your full name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                  {regNameErr && <p className="auth-error show">{regNameErr}</p>}
                </div>
                <div className="mb-3">
                  <label className="form-label">Username</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Choose a username"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                  />
                  {regUserErr && <p className="auth-error show">{regUserErr}</p>}
                </div>
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Create a password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                  {regPassErr && <p className="auth-error show">{regPassErr}</p>}
                </div>
                <div className="mb-4">
                  <label className="form-label">Confirm Password</label>
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Re-enter password"
                    value={regConfirmPass}
                    onChange={(e) => setRegConfirmPass(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                  />
                  {regConfirmErr && <p className="auth-error show">{regConfirmErr}</p>}
                </div>
                <button
                  className="btn-primary-solid flex items-center justify-center gap-2"
                  onClick={handleRegister}
                  disabled={authSubmitting}
                >
                  {authSubmitting ? (
                    <span className="loading-spinner"></span>
                  ) : (
                    <>
                      <i className="fas fa-user-plus text-xs"></i>
                      <span>CREATE ACCOUNT</span>
                    </>
                  )}
                </button>
                <div className="auth-divider">OR</div>
                <button className="auth-tg-btn" onClick={loginWithTelegram}>
                  <i className="fab fa-telegram text-[#2AABEE] text-lg"></i>
                  <span>Sign Up with Telegram</span>
                </button>
              </div>
            )}
          </div>
          <p className="text-[10px] mt-6 text-center font-semibold text-slate-500">
            By continuing, you agree to our Terms of Service
          </p>
        </div>
      )}

      {/* Main Application */}
      {!showSplash && isLoggedIn && (
        <div>
          {/* HEADER */}
          <header className="premium-header px-5 pt-7 pb-7">
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                      currentUser?.name || 'User'
                    )}&background=3b82f6&color=fff&bold=true`}
                    className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-white/10"
                    alt="Avatar"
                  />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-md flex items-center justify-center border-2 border-[#030712]">
                    <i className="fas fa-check text-white text-[6px]"></i>
                  </div>
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">
                    {currentUser?.name || 'User'}
                  </h3>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-mono">
                    <i className="fas fa-fingerprint text-[8px] text-blue-400"></i>
                    <span>@{currentUser?.username || currentUser?.uid.slice(0, 8)}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => showToast('No new notifications', 'info')}
                  className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white cursor-pointer active:scale-95 transition"
                >
                  <i className="fas fa-bell text-sm"></i>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white cursor-pointer active:scale-95 transition"
                >
                  <i className="fas fa-sign-out-alt text-sm"></i>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 relative z-10">
              <div className="stat-card">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-coins text-blue-400 text-[10px]"></i>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Coins
                  </p>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                  {userBalance.toFixed(2)}
                </h2>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-box text-indigo-400 text-[10px]"></i>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Orders
                  </p>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">{userTotalOrders}</h2>
              </div>
            </div>
          </header>

          {/* HOME TAB */}
          {activeTab === 'home' && (
            <section className="px-5 mt-5">
              <div className="grid grid-cols-4 gap-2.5 mb-6">
                <div className="social-icon-box icon-fb">
                  <i className="fab fa-facebook-f"></i>
                </div>
                <div className="social-icon-box icon-ig">
                  <i className="fab fa-instagram"></i>
                </div>
                <div className="social-icon-box icon-tt">
                  <i className="fab fa-tiktok"></i>
                </div>
                <div className="social-icon-box icon-yt">
                  <i className="fab fa-youtube"></i>
                </div>
                <div className="social-icon-box icon-tw">
                  <i className="fab fa-twitter"></i>
                </div>
                <div className="social-icon-box icon-li">
                  <i className="fab fa-linkedin-in"></i>
                </div>
                <div className="social-icon-box icon-sc">
                  <i className="fab fa-snapchat-ghost"></i>
                </div>
                <div className="social-icon-box icon-tp">
                  <i className="fab fa-telegram-plane"></i>
                </div>
              </div>

              <div className="glass-card p-5 mb-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-blue-500/15 rounded-xl flex items-center justify-center text-blue-400">
                      <i className="fas fa-cart-plus text-sm"></i>
                    </div>
                    <h3 className="font-extrabold text-sm text-white">New Order</h3>
                  </div>
                  <div className="text-[8px] font-black text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md tracking-wider">
                    INSTANT
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Category Dropdown */}
                  <div>
                    <label className="form-label">
                      <i className="fas fa-folder-open mr-1 text-[8px]"></i> 1. Category
                    </label>
                    <div className="relative">
                      <select
                        className="input-modern appearance-none pr-8"
                        value={selectedCategory}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                      >
                        <option value="" disabled>
                          Choose category...
                        </option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[10px]"></i>
                    </div>
                    {catErr && <p className="field-error show">{catErr}</p>}
                  </div>

                  {/* Service Dropdown */}
                  <div>
                    <label className="form-label">
                      <i className="fas fa-magic mr-1 text-[8px]"></i> 2. Service
                    </label>
                    <div className="relative">
                      <select
                        className="input-modern appearance-none pr-8"
                        value={selectedServiceId}
                        onChange={(e) => handleServiceChange(e.target.value)}
                        disabled={!selectedCategory}
                      >
                        <option value="" disabled>
                          {selectedCategory ? '✨ Select service...' : 'Select category first'}
                        </option>
                        {allServices
                          .filter((s) => s.category === selectedCategory)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} — {s.price}/1k Coins
                            </option>
                          ))}
                      </select>
                      <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[10px]"></i>
                    </div>
                    {svcErr && <p className="field-error show">{svcErr}</p>}
                  </div>

                  {/* Service Details & Description */}
                  {currentService && (
                    <>
                      {currentService.desc && (
                        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3">
                          <div className="flex items-start gap-2">
                            <i className="fas fa-info-circle text-blue-400 text-xs mt-0.5"></i>
                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                              {currentService.desc}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 flex justify-between items-center">
                        <div className="text-center">
                          <p className="text-[8px] font-bold text-blue-400/70 uppercase">Min</p>
                          <p className="font-extrabold text-sm text-blue-300">
                            {currentService.min.toLocaleString()}
                          </p>
                        </div>
                        <div className="w-px h-6 bg-blue-500/15"></div>
                        <div className="text-center">
                          <p className="text-[8px] font-bold text-blue-400/70 uppercase">Max</p>
                          <p className="font-extrabold text-sm text-blue-300">
                            {currentService.max ? currentService.max.toLocaleString() : '∞'}
                          </p>
                        </div>
                        <div className="w-px h-6 bg-blue-500/10"></div>
                        <div className="text-center">
                          <p className="text-[8px] font-bold text-blue-400/70 uppercase">Rate</p>
                          <p className="font-extrabold text-sm text-blue-300">
                            {currentService.price}/1k
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Target Link Input */}
                  <div>
                    <label className="form-label">
                      <i className="fas fa-link mr-1 text-[8px]"></i> 3. Target Link
                    </label>
                    <input
                      type="text"
                      className="input-modern"
                      placeholder="https://facebook.com/username"
                      value={targetLink}
                      onChange={(e) => {
                        setTargetLink(e.target.value);
                        setLinkErr('');
                      }}
                    />
                    {linkErr && <p className="field-error show">{linkErr}</p>}
                  </div>

                  {/* Quantity & Price Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">
                        <i className="fas fa-hashtag mr-1 text-[8px]"></i> 4. Quantity
                      </label>
                      <input
                        type="number"
                        className="input-modern"
                        value={quantity}
                        onChange={(e) => {
                          setQuantity(parseInt(e.target.value) || 0);
                          setQtyErr('');
                        }}
                      />
                      {currentService && (
                        <p className="min-max-hint">
                          Min: {currentService.min} — Max:{' '}
                          {currentService.max?.toLocaleString() || '∞'}
                        </p>
                      )}
                      {qtyErr && <p className="field-error show">{qtyErr}</p>}
                    </div>

                    <div>
                      <label className="form-label">
                        <i className="fas fa-coins mr-1 text-[8px]"></i> 5. Cost (Coins)
                      </label>
                      <div className="price-preview-box">
                        <span className="text-lg font-black text-blue-400">
                          {calculatedCost.toFixed(2)} Coins
                        </span>
                      </div>
                      <p className="text-[8px] text-center mt-1">
                        {calculatedCost > userBalance ? (
                          <span className="text-red-400 font-bold">
                            Short {(calculatedCost - userBalance).toFixed(2)} Coins
                          </span>
                        ) : (
                          <span className="text-blue-400/60 font-semibold">Balance OK</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handlePlaceOrderClick}
                    disabled={orderSubmitting}
                    className="btn-primary-solid flex items-center justify-center gap-2"
                  >
                    {orderSubmitting ? (
                      <span className="loading-spinner"></span>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane text-xs"></i>
                        <span>PLACE ORDER NOW</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Security Banner */}
              <div
                className="glass-card p-4 flex gap-3 items-center mb-4"
                style={{
                  background: 'rgba(59,130,246,0.05)',
                  borderColor: 'rgba(59,130,246,0.1)'
                }}
              >
                <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center text-blue-400 flex-shrink-0">
                  <i className="fas fa-shield-alt text-lg"></i>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">100% Secure & Refundable</h4>
                  <p className="text-[10px] text-slate-500">
                    Failed orders automatically refund Coins to your account.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ORDERS TAB */}
          {activeTab === 'orders' && (
            <section className="px-5 mt-5">
              <div className="flex justify-between items-center mb-5">
                <h2 className="section-title text-white">My Orders</h2>
                <div className="live-badge">LIVE</div>
              </div>

              <div className="space-y-3">
                {ordersList.length === 0 ? (
                  <div className="empty-state">
                    <i className="fas fa-receipt"></i>
                    <p>No orders yet</p>
                    <p className="text-[10px] mt-1 font-normal">Place your first order from Home</p>
                  </div>
                ) : (
                  ordersList.map((o) => {
                    let stClass = 'bg-slate-500/15 text-slate-400';
                    let stIcon = 'fa-clock';

                    if (o.status === 'Completed') {
                      stClass = 'bg-blue-500/15 text-blue-400';
                      stIcon = 'fa-check-circle';
                    } else if (o.status === 'Processing' || o.status === 'In Progress') {
                      stClass = 'bg-indigo-500/15 text-indigo-400';
                      stIcon = 'fa-spinner fa-spin';
                    } else if (o.status === 'Cancelled') {
                      stClass = 'bg-red-500/15 text-red-400';
                      stIcon = 'fa-times-circle';
                    }

                    return (
                      <div key={o.id} className="glass-card p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[9px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                            #{o.id.slice(-8)}
                          </span>
                          <span className={`order-status ${stClass}`}>
                            <i className={`fas ${stIcon} mr-1 text-[7px]`}></i>
                            {o.status || 'Pending'}
                          </span>
                        </div>
                        <h4 className="font-bold text-xs text-white">{o.service}</h4>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                          {o.link}
                        </p>
                        <div className="dashed-divider my-3"></div>
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-[8px] font-black text-slate-500 uppercase">
                              Qty
                            </span>
                            <div className="font-bold text-xs text-white">
                              {o.qty?.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <span className="text-[8px] font-black text-slate-500 uppercase">
                              Cost
                            </span>
                            <div className="font-bold text-xs text-blue-400">
                              {o.cost?.toFixed(2)} Coins
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] font-black text-slate-500 uppercase">
                              Date
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {o.createdAt
                                ? new Date(o.createdAt).toLocaleDateString('en-BD', {
                                    day: '2-digit',
                                    month: 'short'
                                  })
                                : 'Just now'}
                            </div>
                          </div>
                        </div>

                        {/* API Dispatch Indicator & Retry */}
                        <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
                          {o.apiOrderId ? (
                            <span className="text-[8px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                              ✅ API Order: #{o.apiOrderId}
                            </span>
                          ) : o.apiError ? (
                            <span className="text-[8px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">
                              ❌ API Error
                            </span>
                          ) : (
                            <span className="text-[8px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                              ⏳ Local Order
                            </span>
                          )}

                          {(!o.apiOrderId || o.apiError) && o.status !== 'Completed' && (
                            <button
                              onClick={() => handleRetryOrder(o)}
                              className="text-[10px] px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 font-bold transition active:scale-95"
                            >
                              🔄 Retry API
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* FUNDS TAB */}
          {activeTab === 'funds' && (
            <section className="px-5 mt-5">
              <h2 className="section-title mb-5 text-white">Add Funds</h2>

              <div className="glass-card p-6 text-center mb-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-blue-500/15 rounded-2xl flex items-center justify-center mx-auto text-blue-400 text-2xl mb-3">
                    <i className="fas fa-coins"></i>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">
                    Current Balance
                  </p>
                  <h2 className="text-3xl font-black text-white tracking-tight">
                    {userBalance.toFixed(2)} Coins
                  </h2>
                </div>
              </div>

              {/* Quick Amount Selector */}
              <div className="flex gap-2 mb-4">
                {['100', '200', '500', '1000'].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      setDepositAmount(amt);
                      haptic('light');
                    }}
                    className="deposit-method flex-1 text-center"
                  >
                    {amt} Coins
                  </button>
                ))}
              </div>

              {/* Method Selector */}
              <div className="flex gap-2 mb-4">
                {(['bkash', 'nagad', 'rocket'] as const).map((method) => (
                  <div
                    key={method}
                    onClick={() => {
                      setSelectedMethod(method);
                      haptic('light');
                    }}
                    className={`deposit-method flex-1 text-center ${
                      selectedMethod === method ? 'active-method' : ''
                    }`}
                  >
                    <i className="fas fa-mobile-alt mr-1"></i>
                    {method === 'bkash' ? 'bKash' : method === 'nagad' ? 'Nagad' : 'Rocket'}
                  </div>
                ))}
              </div>

              {/* Payment Box */}
              <div className="glass-card p-4 flex items-center justify-between mb-4">
                <div className="flex gap-3 items-center">
                  <div className="w-10 h-10 bg-pink-500/15 rounded-xl flex items-center justify-center text-pink-400 text-lg font-black">
                    {paymentMethodsConfig[selectedMethod].icon}
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">
                      {paymentMethodsConfig[selectedMethod].label}
                    </p>
                    <p className="font-bold text-base tracking-wide text-white">
                      {paymentMethodsConfig[selectedMethod].number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => copyNumber(paymentMethodsConfig[selectedMethod].number)}
                  className="copy-btn"
                >
                  <i className="fas fa-copy mr-1"></i> COPY
                </button>
              </div>

              {/* Form */}
              <div className="glass-card p-5 space-y-4 mb-6">
                <div>
                  <label className="form-label">
                    <i className="fas fa-money-bill mr-1 text-[8px]"></i> Amount (BDT)
                  </label>
                  <input
                    type="number"
                    className="input-modern"
                    placeholder="Enter amount (min ৳ 50)"
                    value={depositAmount}
                    onChange={(e) => {
                      setDepositAmount(e.target.value);
                      setDepAmtErr('');
                    }}
                  />
                  {depAmtErr && <p className="field-error show">{depAmtErr}</p>}
                </div>

                <div>
                  <label className="form-label">
                    <i className="fas fa-receipt mr-1 text-[8px]"></i> Transaction ID
                  </label>
                  <input
                    type="text"
                    className="input-modern uppercase"
                    placeholder="e.g. BKASH8S7D6F"
                    value={depositTrxId}
                    onChange={(e) => {
                      setDepositTrxId(e.target.value);
                      setDepTrxErr('');
                    }}
                  />
                  {depTrxErr && <p className="field-error show">{depTrxErr}</p>}
                </div>

                <button
                  onClick={handleSubmitDeposit}
                  disabled={depositSubmitting}
                  className="btn-secondary-solid flex items-center justify-center gap-2"
                >
                  {depositSubmitting ? (
                    <span className="loading-spinner"></span>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane text-xs"></i>
                      <span>SUBMIT REQUEST</span>
                    </>
                  )}
                </button>
              </div>

              {/* Deposit History */}
              <div>
                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3">
                  <i className="fas fa-history mr-1"></i> Recent Requests
                </h3>

                {depositHistory.length === 0 ? (
                  <p className="text-[11px] text-slate-600 text-center py-3">
                    No requests submitted yet
                  </p>
                ) : (
                  depositHistory.map((dep) => (
                    <div key={dep.id} className="deposit-history-card">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] text-slate-500 font-mono">
                          {dep.timestamp
                            ? new Date(dep.timestamp.seconds * 1000).toLocaleString('en-BD', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Just now'}
                        </span>
                        <span
                          className={`text-[8px] font-bold px-2 py-0.5 rounded-md ${
                            dep.status === 'Approved'
                              ? 'text-blue-400 bg-blue-500/10'
                              : dep.status === 'Rejected'
                              ? 'text-red-400 bg-red-500/10'
                              : 'text-amber-400 bg-amber-500/10'
                          }`}
                        >
                          {dep.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">
                          {dep.method} • {dep.trxId}
                        </span>
                        <span className="font-extrabold text-sm text-white">
                          {dep.amount} Coins
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* SUPPORT TAB */}
          {activeTab === 'support' && (
            <section className="px-5 mt-5">
              <h2 className="section-title mb-5 text-white">Support</h2>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <a
                  href="https://t.me/RF2_SMM"
                  target="_blank"
                  rel="noreferrer"
                  className="glass-card p-5 text-center block active:scale-95 transition"
                >
                  <div className="w-12 h-12 bg-blue-500/15 rounded-xl flex items-center justify-center mx-auto text-blue-400 text-xl mb-2">
                    <i className="fab fa-telegram"></i>
                  </div>
                  <h3 className="font-bold text-xs text-white">Telegram</h3>
                  <p className="text-[9px] text-slate-500 mt-0.5">Chat with Admin</p>
                </a>
                <a
                  href="https://wa.me/8801781119650"
                  target="_blank"
                  rel="noreferrer"
                  className="glass-card p-5 text-center block active:scale-95 transition"
                >
                  <div className="w-12 h-12 bg-green-500/15 rounded-xl flex items-center justify-center mx-auto text-green-400 text-xl mb-2">
                    <i className="fab fa-whatsapp"></i>
                  </div>
                  <h3 className="font-bold text-xs text-white">WhatsApp</h3>
                  <p className="text-[9px] text-slate-500 mt-0.5">24/7 Available</p>
                </a>
              </div>

              {/* Links Card */}
              <div className="glass-card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-800">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Official Community
                  </h4>
                </div>
                <div
                  className="flex justify-between items-center px-4 py-3.5 cursor-pointer border-b border-slate-800 hover:bg-white/5"
                  onClick={() => {
                    navigator.clipboard.writeText('https://t.me/RF2_SMM');
                    showToast('Telegram Link Copied', 'success');
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <i className="fab fa-telegram text-blue-400 text-sm"></i>
                    <span className="font-semibold text-xs text-white">Telegram Group</span>
                  </div>
                  <i className="fas fa-copy text-[10px] text-slate-500"></i>
                </div>
                <div
                  className="flex justify-between items-center px-4 py-3.5 cursor-pointer hover:bg-white/5"
                  onClick={() => {
                    navigator.clipboard.writeText('https://www.facebook.com/share/1EKKUHMxCw/');
                    showToast('Facebook Link Copied', 'success');
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <i className="fab fa-facebook text-blue-500 text-sm"></i>
                    <span className="font-semibold text-xs text-white">Facebook Page</span>
                  </div>
                  <i className="fas fa-copy text-[10px] text-slate-500"></i>
                </div>
              </div>
            </section>
          )}

          {/* BOTTOM NAVIGATION */}
          <nav className="bottom-nav-premium">
            <div
              className={`nav-item-premium ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('home');
                haptic('light');
              }}
            >
              <i className="fas fa-home"></i>
              <span>Home</span>
            </div>
            <div
              className={`nav-item-premium ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('orders');
                haptic('light');
              }}
            >
              <i className="fas fa-list-check"></i>
              <span>Orders</span>
            </div>
            <div
              className={`nav-item-premium ${activeTab === 'funds' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('funds');
                haptic('light');
              }}
            >
              <i className="fas fa-wallet"></i>
              <span>Funds</span>
            </div>
            <div
              className={`nav-item-premium ${activeTab === 'support' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('support');
                haptic('light');
              }}
            >
              <i className="fas fa-headset"></i>
              <span>Support</span>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
