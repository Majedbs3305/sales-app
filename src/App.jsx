import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, TrendingUp, Users, Package, Clock, Trash2, X, BarChart3, List, WifiOff, Lock, LogOut, Eye, EyeOff, BookOpen, ChevronDown, Hash, MessageSquare, Sun, Moon } from 'lucide-react';
import { createSupabaseClient, getStoredToken, clearToken, login } from './supabase';

const currency = (n) =>
  new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(n);

// يحول الأرقام العربية (٠-٩) والفارسية (۰-۹) إلى أرقام إنجليزية عادية
const toWesternDigits = (str) => {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return str
    .split('')
    .map((ch) => {
      const aIdx = arabicIndic.indexOf(ch);
      if (aIdx !== -1) return String(aIdx);
      const pIdx = persian.indexOf(ch);
      if (pIdx !== -1) return String(pIdx);
      if (ch === '٫' || ch === '،') return '.'; // فاصلة عشرية عربية
      return ch;
    })
    .join('');
};

const sanitizeNumberInput = (raw) => {
  const converted = toWesternDigits(raw);
  const cleaned = converted.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
  return cleaned;
};

const formatDateTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('ar-SA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const THEME_KEY = 'sales_app_theme';

function useTheme() {
  const [mode, setMode] = useState(() => localStorage.getItem(THEME_KEY) || 'light');

  useEffect(() => {
    localStorage.setItem(THEME_KEY, mode);
  }, [mode]);

  const toggle = () => setMode((m) => (m === 'light' ? 'dark' : 'light'));

  return [mode, toggle];
}

export default function App() {
  const [token, setToken] = useState(getStoredToken());
  const [mode, toggleTheme] = useTheme();
  const theme = mode === 'dark' ? darkPalette : lightPalette;
  const styles = useMemo(() => getStyles(theme), [theme]);

  const handleLogout = () => {
    clearToken();
    setToken(null);
  };

  if (!token) {
    return <LoginScreen onSuccess={(t) => setToken(t)} theme={theme} styles={styles} mode={mode} onToggleTheme={toggleTheme} />;
  }

  return <SalesApp token={token} onLogout={handleLogout} theme={theme} styles={styles} mode={mode} onToggleTheme={toggleTheme} />;
}

function ThemeToggle({ mode, onToggleTheme, styles }) {
  return (
    <button
      type="button"
      style={styles.themeToggle}
      onClick={onToggleTheme}
      aria-label={mode === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
    >
      {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function LoginScreen({ onSuccess, theme, styles, mode, onToggleTheme }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const token = await login(password);
      onSuccess(token);
    } catch (e) {
      setError(e.message || 'كلمة المرور غير صحيحة، حاول مرة ثانية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" style={styles.loginPage}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; font-family: 'IBM Plex Sans Arabic', sans-serif; }
        body { margin: 0; background: ${theme.pageBg}; }
        input:focus { outline: 2px solid ${theme.accent}; outline-offset: 1px; }
        ::placeholder { color: ${theme.placeholder}; }
      `}</style>
      <button
        type="button"
        style={styles.loginThemeToggle}
        onClick={onToggleTheme}
        aria-label={mode === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
      >
        {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div style={styles.loginCard}>
        <div style={styles.loginIcon}>
          <Lock size={22} color={theme.accent} />
        </div>
        <h1 style={styles.loginTitle}>دفتر البيع</h1>
        <p style={styles.loginSub}>أدخل كلمة مرور الفريق للمتابعة</p>
        <div style={styles.passwordWrap}>
          <input
            style={styles.loginInput}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="كلمة المرور"
            autoFocus
          />
          <button
            type="button"
            style={styles.eyeBtn}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {error && <div style={styles.errorText}>{error}</div>}
        <button style={styles.submitBtn} onClick={handleLogin} disabled={loading}>
          {loading ? 'جارٍ التحقق...' : 'دخول'}
        </button>
      </div>
    </div>
  );
}

function SalesApp({ token, onLogout, theme, styles, mode, onToggleTheme }) {
  const supabase = useMemo(() => createSupabaseClient(token), [token]);

  const [entries, setEntries] = useState([]);
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('log');
  const [showForm, setShowForm] = useState(false);
  const [showNotebookPicker, setShowNotebookPicker] = useState(false);
  const [showNewNotebook, setShowNewNotebook] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [authError, setAuthError] = useState(false);

  const [seller, setSeller] = useState('');
  const [buyer, setBuyer] = useState('');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [meshNumber, setMeshNumber] = useState('');
  const [newNotebookName, setNewNotebookName] = useState('');

  const computedTotal = (Number(qty) || 0) * (Number(unitPrice) || 0);

  const loadNotebooks = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('notebooks')
      .select('*')
      .order('created_at', { ascending: true });
    if (err) {
      setAuthError(true);
      return;
    }
    if (data) {
      setNotebooks(data);
      setActiveNotebookId((prev) => prev || (data[0] && data[0].id) || null);
    }
  }, [supabase]);

  const loadSales = useCallback(async () => {
    if (!activeNotebookId) return;
    const { data, error: err } = await supabase
      .from('sales')
      .select('*')
      .eq('notebook_id', activeNotebookId)
      .order('time', { ascending: false });
    if (err) {
      setAuthError(true);
      return;
    }
    if (data) setEntries(data);
    setLoading(false);
  }, [supabase, activeNotebookId]);

  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  useEffect(() => {
    if (!activeNotebookId) return;
    setLoading(true);
    loadSales();

    const channel = supabase
      .channel(`sales-changes-${activeNotebookId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `notebook_id=eq.${activeNotebookId}` }, () => {
        loadSales();
      })
      .subscribe();

    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [supabase, activeNotebookId, loadSales]);

  if (authError) {
    clearToken();
    return <LoginScreen onSuccess={() => window.location.reload()} theme={theme} styles={styles} mode={mode} onToggleTheme={onToggleTheme} />;
  }

  const resetForm = () => {
    setSeller('');
    setBuyer('');
    setQty('');
    setUnitPrice('');
    setNotes('');
    setMeshNumber('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!seller.trim() || !buyer.trim() || !qty || !unitPrice) {
      setError('عبّي كل الحقول قبل الحفظ');
      return;
    }
    if (Number(qty) <= 0 || Number(unitPrice) <= 0) {
      setError('العدد وسعر الوحدة لازم يكونوا أكبر من صفر');
      return;
    }
    setSaving(true);
    setError('');
    const entry = {
      notebook_id: activeNotebookId,
      seller: seller.trim(),
      buyer: buyer.trim(),
      qty: Number(qty),
      amount: Number(qty) * Number(unitPrice),
      notes: notes.trim() || null,
      mesh_number: meshNumber.trim() || null,
      time: new Date().toISOString(),
    };
    const { error: err } = await supabase.from('sales').insert(entry);
    if (err) {
      setError('صار خطأ بالحفظ، تأكد من الاتصال بالنت');
    } else {
      resetForm();
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await supabase.from('sales').delete().eq('id', id);
  };

  const handleCreateNotebook = async () => {
    if (!newNotebookName.trim()) return;
    const { data, error: err } = await supabase
      .from('notebooks')
      .insert({ name: newNotebookName.trim() })
      .select()
      .single();
    if (!err && data) {
      setNotebooks((prev) => [...prev, data]);
      setActiveNotebookId(data.id);
      setNewNotebookName('');
      setShowNewNotebook(false);
      setShowNotebookPicker(false);
    }
  };

  const handleDeleteNotebook = async (nb) => {
    if (notebooks.length <= 1) {
      window.alert('لازم يبقى دفتر واحد على الأقل، ما تقدر تحذف آخر دفتر');
      return;
    }
    const confirmed = window.confirm(
      `متأكد تبي تحذف دفتر "${nb.name}"؟\nكل العمليات المسجلة فيه بتنحذف نهائيًا ومافي رجعة.`
    );
    if (!confirmed) return;

    const { error: err } = await supabase.from('notebooks').delete().eq('id', nb.id);
    if (!err) {
      const remaining = notebooks.filter((n) => n.id !== nb.id);
      setNotebooks(remaining);
      if (activeNotebookId === nb.id) {
        setActiveNotebookId(remaining[0] ? remaining[0].id : null);
      }
    } else {
      window.alert('صار خطأ بالحذف، حاول مرة ثانية');
    }
  };

  const totals = useMemo(() => {
    const totalAmount = entries.reduce((s, e) => s + Number(e.amount), 0);
    const totalQty = entries.reduce((s, e) => s + Number(e.qty), 0);

    const bySeller = {};
    const byBuyer = {};
    entries.forEach((e) => {
      bySeller[e.seller] = bySeller[e.seller] || { qty: 0, amount: 0, count: 0 };
      bySeller[e.seller].qty += Number(e.qty);
      bySeller[e.seller].amount += Number(e.amount);
      bySeller[e.seller].count += 1;

      byBuyer[e.buyer] = byBuyer[e.buyer] || { qty: 0, amount: 0, count: 0 };
      byBuyer[e.buyer].qty += Number(e.qty);
      byBuyer[e.buyer].amount += Number(e.amount);
      byBuyer[e.buyer].count += 1;
    });

    const sellerList = Object.entries(bySeller).sort((a, b) => b[1].amount - a[1].amount);
    const buyerList = Object.entries(byBuyer).sort((a, b) => b[1].amount - a[1].amount);

    return { totalAmount, totalQty, sellerList, buyerList };
  }, [entries]);

  const maxSellerAmount = totals.sellerList.length ? totals.sellerList[0][1].amount : 1;
  const maxBuyerAmount = totals.buyerList.length ? totals.buyerList[0][1].amount : 1;
  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId);

  return (
    <div dir="rtl" style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; font-family: 'IBM Plex Sans Arabic', sans-serif; }
        body { margin: 0; background: ${theme.pageBg}; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        ::placeholder { color: ${theme.placeholder}; }
        input:focus, textarea:focus { outline: 2px solid ${theme.accent}; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 2px; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .row-enter { animation: slideUp 0.25s ease-out; }
        .modal-backdrop { animation: fadeIn 0.15s ease-out; }
        .modal-card { animation: slideUp 0.2s ease-out; }
        .bar-fill { transition: width 0.5s ease-out; }
      `}</style>

      {offline && (
        <div style={styles.offlineBanner}>
          <WifiOff size={14} />
          <span>ما فيه اتصال بالنت — البيانات ما بتنحفظ حتى يرجع الاتصال</span>
        </div>
      )}

      <div style={styles.header}>
        <div style={styles.headerTop}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <button style={styles.notebookSwitcher} onClick={() => setShowNotebookPicker(true)}>
              <BookOpen size={12} />
              <span style={styles.notebookSwitcherText}>{activeNotebook ? activeNotebook.name : 'اختر دفتر'}</span>
              <ChevronDown size={12} />
            </button>
            <h1 style={styles.title}>دفتر البيع</h1>
          </div>
          <div style={styles.headerBtns}>
            <button style={styles.addBtn} onClick={() => setShowForm(true)}>
              <Plus size={18} strokeWidth={2.5} />
              <span>عملية جديدة</span>
            </button>
            <ThemeToggle mode={mode} onToggleTheme={onToggleTheme} styles={styles} />
            <button style={styles.logoutBtn} onClick={onLogout} aria-label="تسجيل خروج">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>إجمالي المبيعات</div>
            <div style={styles.statValueMain} className="mono">{currency(totals.totalAmount)}</div>
          </div>
          <div style={styles.statCardSm}>
            <div style={styles.statLabel}>عدد العمليات</div>
            <div style={styles.statValue} className="mono">{entries.length}</div>
          </div>
          <div style={styles.statCardSm}>
            <div style={styles.statLabel}>إجمالي الكمية</div>
            <div style={styles.statValue} className="mono">{currency(totals.totalQty)}</div>
          </div>
        </div>

        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(view === 'log' ? styles.tabActive : {}) }} onClick={() => setView('log')}>
            <List size={15} />
            السجل
          </button>
          <button style={{ ...styles.tab, ...(view === 'report' ? styles.tabActive : {}) }} onClick={() => setView('report')}>
            <BarChart3 size={15} />
            التقارير
          </button>
        </div>
      </div>

      <div style={styles.body}>
        {loading ? (
          <div style={styles.emptyState}><div style={styles.emptyText}>جارٍ التحميل...</div></div>
        ) : view === 'log' ? (
          <LogView entries={entries} onDelete={handleDelete} styles={styles} theme={theme} />
        ) : (
          <ReportView totals={totals} maxSellerAmount={maxSellerAmount} maxBuyerAmount={maxBuyerAmount} styles={styles} theme={theme} />
        )}
      </div>

      {/* نافذة اختيار/إنشاء دفتر */}
      {showNotebookPicker && (
        <div className="modal-backdrop" style={styles.modalBackdrop} onClick={() => { setShowNotebookPicker(false); setShowNewNotebook(false); }}>
          <div className="modal-card" style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>الدفاتر</h2>
              <button style={styles.closeBtn} onClick={() => { setShowNotebookPicker(false); setShowNewNotebook(false); }} aria-label="إغلاق">
                <X size={20} />
              </button>
            </div>

            <div style={styles.notebookList}>
              {notebooks.map((nb) => (
                <div
                  key={nb.id}
                  style={{ ...styles.notebookItem, ...(nb.id === activeNotebookId ? styles.notebookItemActive : {}) }}
                >
                  <button
                    style={styles.notebookItemMain}
                    onClick={() => { setActiveNotebookId(nb.id); setShowNotebookPicker(false); }}
                  >
                    <BookOpen size={16} />
                    <span style={{ flex: 1, textAlign: 'right' }}>{nb.name}</span>
                    {nb.id === activeNotebookId && <span style={styles.notebookActiveDot} />}
                  </button>
                  <button
                    style={styles.notebookDeleteBtn}
                    onClick={() => handleDeleteNotebook(nb)}
                    aria-label={`حذف دفتر ${nb.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {showNewNotebook ? (
              <div style={{ marginTop: 12 }}>
                <input
                  style={styles.input}
                  value={newNotebookName}
                  onChange={(e) => setNewNotebookName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateNotebook()}
                  placeholder="اسم الدفتر الجديد (مثال: سوق جدة)"
                  autoFocus
                />
                <button style={{ ...styles.submitBtn, marginTop: 10 }} onClick={handleCreateNotebook}>
                  إنشاء الدفتر
                </button>
              </div>
            ) : (
              <button style={styles.newNotebookBtn} onClick={() => setShowNewNotebook(true)}>
                <Plus size={16} />
                دفتر جديد
              </button>
            )}
          </div>
        </div>
      )}

      {/* نافذة عملية بيع جديدة */}
      {showForm && (
        <div className="modal-backdrop" style={styles.modalBackdrop} onClick={() => { setShowForm(false); resetForm(); }}>
          <div className="modal-card" style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>عملية بيع جديدة</h2>
              <button style={styles.closeBtn} onClick={() => { setShowForm(false); resetForm(); }} aria-label="إغلاق">
                <X size={20} />
              </button>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>اسم البائع</label>
              <input style={styles.input} value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="مثال: خالد" />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>اسم المشتري</label>
              <input style={styles.input} value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="مثال: محمد" />
            </div>

            <div style={styles.formRow}>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>العدد</label>
                <input style={styles.input} className="mono" type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(sanitizeNumberInput(e.target.value))} placeholder="0" />
              </div>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>سعر الوحدة</label>
                <input style={styles.input} className="mono" type="text" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(sanitizeNumberInput(e.target.value))} placeholder="0" />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                <Hash size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                رقم الشبك (اختياري)
              </label>
              <input style={styles.input} value={meshNumber} onChange={(e) => setMeshNumber(e.target.value)} placeholder="مثال: 12 أو A5" />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                <MessageSquare size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                ملاحظات (اختياري)
              </label>
              <textarea
                style={styles.textarea}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظة إضافية على العملية"
                rows={2}
              />
            </div>

            {computedTotal > 0 && (
              <div style={styles.totalPreview}>
                <span>الإجمالي</span>
                <span className="mono" style={styles.totalPreviewValue}>{currency(computedTotal)}</span>
              </div>
            )}

            {error && <div style={styles.errorText}>{error}</div>}

            <button style={styles.submitBtn} onClick={handleSubmit} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ العملية'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogView({ entries, onDelete, styles, theme }) {
  if (entries.length === 0) {
    return (
      <div style={styles.emptyState}>
        <Package size={32} color={theme.iconMuted} strokeWidth={1.5} />
        <div style={styles.emptyText}>ما فيه عمليات بعد بهذا الدفتر</div>
        <div style={styles.emptySub}>اضغط "عملية جديدة" لتسجيل أول عملية بيع</div>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {entries.map((e) => (
        <div key={e.id} className="row-enter" style={styles.entryCard}>
          <div style={styles.entryMain}>
            <div style={styles.entryParties}>
              <span style={styles.buyerName}>{e.buyer}</span>
              <span style={styles.arrow}>←</span>
              <span style={styles.sellerName}>{e.seller}</span>
              {e.mesh_number && <span style={styles.meshBadge}># {e.mesh_number}</span>}
            </div>
            <div style={styles.entryMeta}>
              <Clock size={12} color={theme.iconMuted} />
              <span>{formatDateTime(e.time)}</span>
            </div>
            {e.notes && (
              <div style={styles.entryNotes}>
                <MessageSquare size={11} color={theme.iconMuted} />
                <span>{e.notes}</span>
              </div>
            )}
          </div>
          <div style={styles.entryNums}>
            <div style={styles.entryQty} className="mono">
              <span style={styles.qtyBadge}>{currency(e.qty)}</span>
              <span style={styles.qtyUnit}>× {currency(e.amount / e.qty)}</span>
            </div>
            <div style={styles.entryAmount} className="mono">{currency(e.amount)}</div>
          </div>
          <button style={styles.deleteBtn} onClick={() => onDelete(e.id)} aria-label="حذف العملية">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ReportView({ totals, maxSellerAmount, maxBuyerAmount, styles, theme }) {
  if (totals.sellerList.length === 0) {
    return (
      <div style={styles.emptyState}>
        <BarChart3 size={32} color={theme.iconMuted} strokeWidth={1.5} />
        <div style={styles.emptyText}>ما فيه بيانات للتقرير</div>
        <div style={styles.emptySub}>سجل عمليات بيع عشان تظهر لك الإحصائيات هنا</div>
      </div>
    );
  }

  return (
    <div style={styles.reportWrap}>
      <ReportSection icon={<TrendingUp size={16} color={theme.accent} />} title="حسب البائع" list={totals.sellerList} max={maxSellerAmount} color={theme.accent} styles={styles} />
      <ReportSection icon={<Users size={16} color={theme.accentAlt} />} title="حسب المشتري" list={totals.buyerList} max={maxBuyerAmount} color={theme.accentAlt} styles={styles} />
    </div>
  );
}

function ReportSection({ icon, title, list, max, color, styles }) {
  return (
    <div style={styles.reportSection}>
      <div style={styles.reportSectionTitle}>
        {icon}
        <span>{title}</span>
      </div>
      <div style={styles.reportList}>
        {list.map(([name, data]) => (
          <div key={name} style={styles.reportRow}>
            <div style={styles.reportRowTop}>
              <span style={styles.reportName}>{name}</span>
              <span style={styles.reportAmount} className="mono">{currency(data.amount)}</span>
            </div>
            <div style={styles.barTrack}>
              <div className="bar-fill" style={{ ...styles.barFill, width: `${Math.max(4, (data.amount / max) * 100)}%`, background: color }} />
            </div>
            <div style={styles.reportRowSub}>
              <span>{data.count} عملية</span>
              <span>الكمية: {currency(data.qty)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== الثيمات ====================

const lightPalette = {
  pageBg: '#FBF9F5',
  text: '#2B2621',
  headerBg: '#211D19',
  headerText: '#F5F1E9',
  headerTextMuted: '#8A9E93',
  statCardBg: '#2A251F',
  statLabel: '#9C9186',
  cardBg: '#FFFFFF',
  cardBorder: '#EDE8DF',
  inputBg: '#FFFFFF',
  inputBorder: '#E3DCD0',
  placeholder: '#9C9186',
  muted: '#9C9186',
  mutedText: '#6B6255',
  iconMuted: '#B5AA9C',
  accent: '#2F6F5E',
  accentSoft: '#E7F2ED',
  accentAlt: '#B5622E',
  danger: '#C4938A',
  deleteIcon: '#D6C9BC',
  notesBg: '#F7F4EE',
  notesText: '#8A8072',
  barTrack: '#F1ECE3',
  modalBackdrop: 'rgba(20,17,14,0.5)',
};

const darkPalette = {
  pageBg: '#15130F',
  text: '#EDE8DF',
  headerBg: '#0D0B09',
  headerText: '#F5F1E9',
  headerTextMuted: '#7A9086',
  statCardBg: '#1C1914',
  statLabel: '#8A8072',
  cardBg: '#211D19',
  cardBorder: '#332D26',
  inputBg: '#211D19',
  inputBorder: '#3A332B',
  placeholder: '#6B6255',
  muted: '#8A8072',
  mutedText: '#B5AA9C',
  iconMuted: '#6B6255',
  accent: '#5FBF9F',
  accentSoft: '#1E332B',
  accentAlt: '#E08A56',
  danger: '#D6938A',
  deleteIcon: '#4A4038',
  notesBg: '#26221C',
  notesText: '#A69C8E',
  barTrack: '#2A251F',
  modalBackdrop: 'rgba(0,0,0,0.65)',
};

// ==================== الأنماط (تتغير حسب الثيم) ====================

function getStyles(theme) {
  return {
    loginPage: { minHeight: '100vh', background: theme.headerBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative' },
    loginThemeToggle: { position: 'absolute', top: 20, left: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: theme.statCardBg, border: 'none', borderRadius: 10, color: theme.headerTextMuted, cursor: 'pointer' },
    loginCard: { background: theme.pageBg, borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 360, textAlign: 'center' },
    loginIcon: { width: 48, height: 48, background: theme.accentSoft, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
    loginTitle: { fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: theme.text },
    loginSub: { fontSize: 13, color: theme.muted, margin: '0 0 20px' },
    loginInput: { width: '100%', padding: '13px 44px 13px 14px', borderRadius: 12, border: `1px solid ${theme.inputBorder}`, fontSize: 15, background: theme.inputBg, color: theme.text, textAlign: 'center' },
    passwordWrap: { position: 'relative', marginBottom: 12 },
    eyeBtn: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: theme.muted, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' },

    page: { minHeight: '100vh', background: theme.pageBg, color: theme.text, paddingBottom: 40 },
    offlineBanner: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', background: theme.accentAlt, color: '#fff', fontSize: 12, padding: '6px 0' },
    header: { background: theme.headerBg, padding: '28px 20px 0', borderRadius: '0 0 24px 24px' },
    headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    headerBtns: { display: 'flex', gap: 8 },
    themeToggle: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.statCardBg, color: theme.headerTextMuted, border: 'none', borderRadius: 12, padding: '10px 12px', cursor: 'pointer' },
    notebookSwitcher: { display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: theme.headerTextMuted, fontSize: 12, letterSpacing: '0.02em', marginBottom: 4, cursor: 'pointer', padding: 0, maxWidth: '100%' },
    notebookSwitcherText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 },
    eyebrow: { fontSize: 12, letterSpacing: '0.05em', color: theme.headerTextMuted, marginBottom: 4, fontWeight: 500 },
    title: { fontSize: 26, fontWeight: 700, color: theme.headerText, margin: 0 },
    addBtn: { display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: theme.headerText, border: 'none', borderRadius: 12, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: `0 2px 8px ${theme.accent}59` },
    logoutBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.statCardBg, color: theme.mutedText, border: 'none', borderRadius: 12, padding: '10px 12px', cursor: 'pointer' },
    statsRow: { display: 'flex', gap: 10, marginBottom: 20 },
    statCard: { flex: 1.4, background: theme.statCardBg, borderRadius: 14, padding: '14px 16px' },
    statCardSm: { flex: 1, background: theme.statCardBg, borderRadius: 14, padding: '14px 16px' },
    statLabel: { fontSize: 11, color: theme.statLabel, marginBottom: 6 },
    statValueMain: { fontSize: 22, fontWeight: 600, color: theme.accent },
    statValue: { fontSize: 18, fontWeight: 600, color: theme.headerText },
    tabs: { display: 'flex', gap: 4 },
    tab: { display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center', padding: '12px 0', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: theme.headerTextMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    tabActive: { color: theme.headerText, borderBottom: `2px solid ${theme.accent}` },
    body: { padding: '18px 16px 0' },
    list: { display: 'flex', flexDirection: 'column', gap: 8 },
    entryCard: { display: 'flex', alignItems: 'flex-start', gap: 10, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: '12px 14px' },
    entryMain: { flex: 1, minWidth: 0 },
    entryParties: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, marginBottom: 4, flexWrap: 'wrap' },
    buyerName: { color: theme.text },
    arrow: { color: theme.iconMuted, fontSize: 12 },
    sellerName: { color: theme.mutedText },
    meshBadge: { fontSize: 11, fontWeight: 600, color: theme.accent, background: theme.accentSoft, borderRadius: 6, padding: '2px 6px' },
    entryMeta: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: theme.muted, marginBottom: 4 },
    entryNotes: { display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: 12, color: theme.notesText, background: theme.notesBg, borderRadius: 8, padding: '5px 8px', marginTop: 2 },
    entryNums: { textAlign: 'left', flexShrink: 0 },
    entryQty: { fontSize: 11, color: theme.muted, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' },
    qtyBadge: { fontWeight: 600 },
    qtyUnit: { color: theme.iconMuted },
    entryAmount: { fontSize: 15, fontWeight: 700, color: theme.accent },
    deleteBtn: { background: 'transparent', border: 'none', color: theme.deleteIcon, cursor: 'pointer', padding: 4, flexShrink: 0 },
    emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 8, textAlign: 'center' },
    emptyText: { fontSize: 15, fontWeight: 600, color: theme.mutedText },
    emptySub: { fontSize: 13, color: theme.muted },
    reportWrap: { display: 'flex', flexDirection: 'column', gap: 24 },
    reportSection: { background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 16 },
    reportSectionTitle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, marginBottom: 14, color: theme.text },
    reportList: { display: 'flex', flexDirection: 'column', gap: 14 },
    reportRow: {},
    reportRowTop: { display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 },
    reportName: { fontWeight: 600, color: theme.text },
    reportAmount: { fontWeight: 700, color: theme.text },
    barTrack: { height: 6, background: theme.barTrack, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
    reportRowSub: { display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: theme.muted },
    modalBackdrop: { position: 'fixed', inset: 0, background: theme.modalBackdrop, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 },
    modalCard: { background: theme.pageBg, borderRadius: '20px 20px 0 0', padding: '20px 20px 24px', width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 17, fontWeight: 700, margin: 0, color: theme.text },
    closeBtn: { background: theme.statCardBg, border: 'none', borderRadius: 10, padding: 6, cursor: 'pointer', color: theme.mutedText },
    formGroup: { marginBottom: 14 },
    formRow: { display: 'flex', gap: 10 },
    label: { display: 'block', fontSize: 12, fontWeight: 600, color: theme.mutedText, marginBottom: 6 },
    input: { width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${theme.inputBorder}`, fontSize: 15, background: theme.inputBg, color: theme.text },
    textarea: { width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${theme.inputBorder}`, fontSize: 14, background: theme.inputBg, color: theme.text, resize: 'none', fontFamily: 'inherit' },
    errorText: { color: theme.accentAlt, fontSize: 13, marginBottom: 12 },
    totalPreview: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.accentSoft, borderRadius: 12, padding: '12px 16px', marginBottom: 14, fontSize: 13, fontWeight: 600, color: theme.accent },
    totalPreviewValue: { fontSize: 17, fontWeight: 700 },
    submitBtn: { width: '100%', background: theme.accent, color: theme.headerText, border: 'none', borderRadius: 12, padding: '13px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },

    notebookList: { display: 'flex', flexDirection: 'column', gap: 6 },
    notebookItem: { display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: '4px', fontSize: 14, fontWeight: 600, color: theme.text },
    notebookItemMain: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, background: 'transparent', border: 'none', padding: '8px 10px', fontSize: 14, fontWeight: 600, color: 'inherit', cursor: 'pointer', textAlign: 'right' },
    notebookItemActive: { border: `1px solid ${theme.accent}`, background: theme.accentSoft, color: theme.accent },
    notebookActiveDot: { width: 8, height: 8, borderRadius: '50%', background: theme.accent },
    notebookDeleteBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: theme.danger, cursor: 'pointer', padding: 8, flexShrink: 0 },
    newNotebookBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', background: 'transparent', border: `1px dashed ${theme.inputBorder}`, borderRadius: 12, padding: '12px 0', fontSize: 13, fontWeight: 600, color: theme.mutedText, cursor: 'pointer', marginTop: 12 },
  };
}
