// Petbnb app — UI-kit screens + interactive state machine.
// A faithful cosmetic recreation of the real Expo screens (owner feed →
// listing detail → booking request → confirmation), plus the onboarding
// role chooser and a persona toggle that re-skins host mode honey/gold.
// Uses the cosmetic primitives from components.jsx.

const { Btn, Badge, Avatar, Card, TopBar, FilterChip } = window;
const A = '../../assets/breeds/'; // breed photos as host/home imagery

const HOSTS = [
  { id: 'h1', name: 'نورة العتيبي', photo: A + 'ragdoll.jpg', home: A + 'maine_coon.jpg',
    tier: 'gold', gender: 'female', district: 'الملقا', city: 'الرياض', km: '٣٫٢',
    title: 'منزل دافئ وهادئ لقطتك مع رعاية شخصية', price: '٤٥٠', max: '٢',
    desc: 'أستقبل قطتك في منزل هادئ ونظيف، مع متابعة يومية بالصور. خبرة ٥ سنوات في رعاية القطط، ولا يوجد لدي حيوانات مقيمة تزعجها.', grooming: true, resident: false },
  { id: 'h2', name: 'سارة القحطاني', photo: A + 'persian.jpg', home: A + 'british_shorthair.jpg',
    tier: 'silver', gender: 'female', district: 'النرجس', city: 'الرياض', km: '٥٫٨',
    title: 'رعاية محبة في بيت عائلي واسع', price: '٣٨٠', max: '٣',
    desc: 'بيت عائلي واسع مع حديقة آمنة. أحب القطط وأعاملها كأنها قططي. متاحة للتواصل في أي وقت خلال الإقامة.', grooming: false, resident: true },
  { id: 'h3', name: 'منى الدوسري', photo: A + 'siamese.jpg', home: A + 'scottish_fold.jpg',
    tier: 'bronze', gender: 'female', district: 'العقيق', city: 'الرياض', km: '٧٫١',
    title: 'شقة هادئة قريبة من العيادة البيطرية', price: '٣٢٠', max: '١',
    desc: 'شقة هادئة بإطلالة جميلة، قريبة من عيادة بيطرية موثوقة. مثالية لقطة واحدة تحتاج هدوءاً واهتماماً.', grooming: true, resident: false },
];

const ADDONS = [
  { key: 'grooming', label: 'استحمام', price: 80 },
  { key: 'vet', label: 'زيارة بيطرية', price: 150 },
  { key: 'transport', label: 'توصيل', price: 60 },
];

const toAr = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);

// ───────────────────────── Onboarding (role chooser) ─────────────────────
function Onboarding({ onPick }) {
  const [role, setRole] = React.useState('owner');
  const roles = [
    { v: 'owner', icon: '🐈', t: 'أبحث عن مكان لقطتي', d: 'ابحثي عن مضيفة موثوقة قريبة منكِ' },
    { v: 'host', icon: '🏠', t: 'أستضيف القطط في منزلي', d: 'استقبلي الحيوانات واكسبي دخلاً' },
    { v: 'both', icon: '⚭', t: 'كلاهما', d: 'أحتاج كلا الدورين' },
  ];
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div style={{ marginTop: 'var(--space-sm)' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-display)', color: 'var(--moss-deep)' }}>أهلاً بكِ في Petbnb</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-md)', color: 'var(--text-muted)', marginTop: 4 }}>كيف تريدين استخدام Petbnb؟</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {roles.map((r) => {
          const sel = role === r.v;
          return (
            <button key={r.v} onClick={() => setRole(r.v)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', width: '100%', textAlign: 'start',
                background: sel ? 'var(--surface-inert)' : 'var(--surface-card)',
                border: `2px solid ${sel ? 'var(--accent)' : 'var(--border-hairline)'}`,
                borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-card)', padding: 'var(--space-lg)', cursor: 'pointer' }}>
              <span style={{ fontSize: 32 }} aria-hidden="true">{r.icon}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--ink)' }}>{r.t}</span>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-sm)', color: 'var(--text-muted)', marginTop: 2 }}>{r.d}</span>
              </span>
              {sel ? <span style={{ fontSize: 22, color: 'var(--accent)', fontWeight: 700 }} aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
      <Btn label="متابعة" full onClick={() => onPick(role)} />
    </div>
  );
}

// ───────────────────────── Owner feed ─────────────────────
function Feed({ onOpen, greeting }) {
  const [fem, setFem] = React.useState(true);
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'var(--space-xl) var(--space-xl) var(--space-md)' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-title)', color: 'var(--moss-deep)' }}>المضيفون في الرياض</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption)', color: 'var(--text-muted)', marginTop: 2 }}>{greeting}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 var(--space-xl) var(--space-md)' }}>
        <FilterChip label="مضيفات فقط" active={fem} onClick={() => setFem((v) => !v)} />
        <FilterChip label="الأقرب إليك" active={false} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: '0 var(--space-xl) var(--space-xxl)' }}>
        {HOSTS.map((h) => (
          <Card key={h.id} pad={false} interactive onClick={() => onOpen(h)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}>
              <Avatar photoUrl={h.photo} name={h.name} size={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--moss-deep)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
                  <span style={{ color: 'var(--verified)', fontWeight: 700, fontSize: 14 }} aria-label="موثّق">✓</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <Badge label={{ gold: 'ذهبي', silver: 'فضي', bronze: 'برونزي' }[h.tier]} tone={h.tier} />
                  <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>مضيفة • 📍 {h.district}، {h.city} · {h.km} كم</span>
                </div>
                <div style={{ marginTop: 6 }}><Badge label="جديد" tone="new" /></div>
              </div>
            </div>
            <img src={h.home} alt="" style={{ width: '100%', aspectRatio: '5 / 2', objectFit: 'cover', display: 'block', background: 'var(--surface-inert)' }} />
            <div style={{ padding: 'var(--space-lg)' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-body-md)', color: 'var(--ink)' }}>{h.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--moss-deep)' }}>{h.price} ر.س <span style={{ fontWeight: 400, fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>/ ليلة</span></span>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-body-md)', color: 'var(--text-muted)' }}>🐈 {h.max}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Listing detail ─────────────────────
function Listing({ host, onBack, onRequest }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'var(--space-xxl)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', background: 'var(--surface-card)', margin: 'var(--space-xl)', marginBottom: 'var(--space-md)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-card)' }}>
        <Avatar photoUrl={host.photo} name={host.name} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-heading)', color: 'var(--moss-deep)' }}>{host.name}</span>
            <span style={{ color: 'var(--verified)', fontWeight: 700, fontSize: 16 }}>✓</span>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-sm)', color: 'var(--text-muted)', marginTop: 2 }}>مضيفة • 📍 {host.district}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Badge label={{ gold: 'ذهبي', silver: 'فضي', bronze: 'برونزي' }[host.tier]} tone={host.tier} />
            <Badge label="جديد" tone="new" />
          </div>
        </div>
      </div>

      <img src={host.home} alt="" style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block', background: 'var(--surface-inert)' }} />

      <div style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-title)', color: 'var(--moss-deep)' }}>{host.title}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--ink)' }}>{host.price} ر.س <span style={{ fontWeight: 400, fontSize: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>/ ليلة</span></div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-lg)', color: 'var(--ink)', lineHeight: 1.6 }}>{host.desc}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-hairline)' }}>
          <Amenity label={`يستوعب حتى ${host.max}`} />
          <Amenity label={host.resident ? 'يوجد حيوانات مقيمة' : 'لا يوجد حيوانات مقيمة'} />
          {host.grooming ? <Amenity label="خدمة الاستحمام متوفرة" /> : null}
        </div>
        <div style={{ marginTop: 'var(--space-lg)' }}><Btn label="اطلب الحجز" full onClick={onRequest} /></div>
      </div>
    </div>
  );
}

function Amenity({ label }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--moss)', fontWeight: 700, fontSize: 16, width: 18 }}>✓</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-md)', color: 'var(--ink)' }}>{label}</span>
    </div>
  );
}

// ───────────────────────── Booking request ─────────────────────
function Request({ host, onBack, onSubmit }) {
  const [nights, setNights] = React.useState(3);
  const [addon, setAddon] = React.useState(null);
  const base = +host.price.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) || 450;
  const baseTotal = base * nights;
  const addonObj = ADDONS.find((a) => a.key === addon);
  const total = baseTotal + (addonObj ? addonObj.price : 0);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-xl)', paddingBottom: 'var(--space-xxl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-title)', color: 'var(--moss-deep)' }}>طلب حجز</div>

      <Field label="عدد الليالي">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Stepper onClick={() => setNights((n) => Math.max(1, n - 1))}>−</Stepper>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-heading)', color: 'var(--ink)', minWidth: 60, textAlign: 'center' }}>{toAr(nights)} ليالٍ</span>
          <Stepper onClick={() => setNights((n) => n + 1)}>+</Stepper>
        </div>
      </Field>

      <Field label="قطتك">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-inert)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md)' }}>
          <Avatar glyph="🐈" size={44} rounded={false} />
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-body-md)', color: 'var(--ink)' }}>لولو · شيرازي</span>
          <span style={{ marginInlineStart: 'auto', color: 'var(--accent)', fontWeight: 700 }}>✓</span>
        </div>
      </Field>

      <Field label="خدمة إضافية (اختياري)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <FilterChip label="بدون" active={addon === null} onClick={() => setAddon(null)} />
          {ADDONS.map((a) => (
            <FilterChip key={a.key} label={`${a.label} +${toAr(a.price)}`} active={addon === a.key} onClick={() => setAddon(a.key)} />
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-hairline)' }}>
        <Row label={`الإقامة (${toAr(nights)} ليالٍ × ${host.price})`} value={`${toAr(baseTotal)} ر.س`} />
        {addonObj ? <Row label={addonObj.label} value={`${toAr(addonObj.price)} ر.س`} /> : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--ink)' }}>المجموع</span>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-title)', color: 'var(--moss-deep)' }}>{toAr(total)} ر.س</span>
        </div>
      </div>
      <Btn label="إرسال الطلب" full onClick={() => onSubmit({ nights, total, addon: addonObj })} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-caption)', color: 'var(--text-body)' }}>{label}</span>
      {children}
    </div>
  );
}
function Stepper({ children, onClick }) {
  return <button onClick={onClick} style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-ink)', background: 'transparent', color: 'var(--accent-ink)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 20, cursor: 'pointer' }}>{children}</button>;
}
function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-body-sm)', color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}

// ───────────────────────── Confirmation ─────────────────────
function Confirm({ host, info, onHome }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-md)', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--surface-inert)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: 'var(--moss)', fontWeight: 700 }}>✓</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-title)', color: 'var(--moss-deep)' }}>تم إرسال الطلب</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-md)', color: 'var(--text-muted)' }}>بانتظار رد المضيف</div>
      <Card style={{ width: '100%', marginTop: 'var(--space-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar photoUrl={host.photo} name={host.name} size={48} />
          <div style={{ flex: 1, textAlign: 'start' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--moss-deep)' }}>{host.name}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>{toAr(info.nights)} ليالٍ</div>
          </div>
          <Badge label="بانتظار الرد" color="var(--gold-deep)" />
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-hairline)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>المجموع</span>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--moss-deep)' }}>{toAr(info.total)} ر.س</span>
        </div>
      </Card>
      <div style={{ width: '100%', marginTop: 'var(--space-md)' }}><Btn label="العودة إلى الرئيسية" variant="secondary" full onClick={onHome} /></div>
    </div>
  );
}

Object.assign(window, { Onboarding, Feed, Listing, Request, Confirm, HOSTS });
