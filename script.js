/* =========================================================================
   MATH ASCENSION — script.js
   Struktur modular:
   1. Helpers & RNG
   2. State (localStorage)
   3. Data: node materi (skill tree) — TAMBAH NODE BARU DI SINI SAJA
   4. Generator soal (per node, tanpa hardcode angka)
   5. XP / Level / Coin engine
   6. Achievement engine
   7. Navigation & screen rendering
   8. Skill tree render + lock system
   9. Halaman materi
   10. Quiz engine
   11. Hasil quiz
   12. Dashboard (+ mini chart)
   13. Shop kosmetik
   14. Achievements render
   15. Toast / popup
   16. Init
   ========================================================================= */

/* ================= 1. HELPERS & RNG ================= */
function randInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr){ return arr[randInt(0, arr.length - 1)]; }
function shuffle(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function gcd(a, b){ a = Math.abs(a); b = Math.abs(b); while(b){ [a, b] = [b, a % b]; } return a || 1; }
function fmtFrac(n, d){
  const g = gcd(n, d);
  n /= g; d /= g;
  if(d < 0){ n = -n; d = -d; }
  return d === 1 ? `${n}` : `${n}/${d}`;
}
function todayStr(){ return new Date().toISOString().slice(0, 10); }
function uniq(arr){ return [...new Set(arr)]; }

/* Bangun 4 pilihan ganda dari 1 jawaban benar + beberapa distraktor, lalu acak urutan */
function buildChoices(correct, distractors){
  const pool = uniq([correct, ...distractors]).slice(0, 4);
  while(pool.length < 4) pool.push(correct + randInt(1, 5) * (Math.random() < 0.5 ? 1 : -1));
  const shuffled = shuffle(pool);
  return { choices: shuffled.map(String), answerIndex: shuffled.indexOf(correct) };
}

/* ================= 2. STATE ================= */
const STORAGE_KEY = 'mathAscension_v1';

function defaultState(){
  return {
    xpTotal: 0,
    coins: 0,
    streak: 0,
    lastLoginDate: null,
    totalAnswered: 0,
    totalCorrect: 0,
    studySeconds: 0,
    materi: {},          // { [nodeId]: { read, bestScore, attempts, quizHistory:[], master90Dates:[] } }
    achievements: {},    // { [achId]: dateUnlocked }
    cosmeticsOwned: ['theme-default', 'avatar-default', 'border-default'],
    cosmeticsEquipped: { theme: 'theme-default', avatar: 'avatar-default', border: 'border-default' }
  };
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  }catch(e){ return defaultState(); }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function getMateriState(id){
  if(!state.materi[id]) state.materi[id] = { read: false, bestScore: 0, attempts: 0, quizHistory: [], master90Dates: [] };
  return state.materi[id];
}

let state = loadState();

/* ================= 3. DATA: NODE MATERI ================= */
const MATERI = [
  {
    id: 'bilangan', title: 'Operasi Bilangan', difficulty: 'easy', prereq: [],
    concept: 'Operasi bilangan adalah aturan dasar untuk menjumlah, mengurang, mengalikan, dan membagi bilangan bulat maupun pecahan. Semua materi matematika lain dibangun di atas fondasi ini.',
    intuitive: 'Bayangkan bilangan sebagai posisi di garis angka. Penjumlahan bergerak ke kanan, pengurangan ke kiri, sedangkan perkalian adalah penjumlahan berulang yang dipercepat.',
    illustration: 'Garis bilangan: ...-2, -1, 0, 1, 2, 3... — posisi bergerak sesuai operasi yang dilakukan.',
    formula: 'Urutan operasi: kerjakan tanda kurung → pangkat/akar → kali/bagi (kiri ke kanan) → tambah/kurang (kiri ke kanan)',
    examples: [{ problem: '2 + 3 × 4', solution: '3 × 4 dikerjakan dulu = 12, lalu 2 + 12 = 14' }],
    mistakes: ['Menjumlah dulu sebelum mengalikan padahal urutan operasi mendahulukan perkalian.', 'Salah tanda saat mengurangi bilangan negatif, misalnya 5 − (−3) dianggap 5 − 3.'],
    tips: ['Ingat singkatan "KaBaTaKu terbalik": Kurung, Pangkat, Kali/Bagi, Tambah/Kurang.', 'Selalu tulis ulang soal dengan tanda kurung jika ragu urutan operasinya.']
  },
  {
    id: 'pangkat', title: 'Pangkat', difficulty: 'easy', prereq: ['bilangan'],
    concept: 'Pangkat (eksponen) adalah cara singkat menuliskan perkalian berulang suatu bilangan dengan dirinya sendiri.',
    intuitive: 'a pangkat n berarti "kalikan a sebanyak n kali". Semakin besar pangkatnya, semakin cepat nilainya membesar (pertumbuhan eksponensial).',
    illustration: '2³ = 2 × 2 × 2 = 8 — tiga salinan angka 2 dikalikan bersama.',
    formula: 'aᵐ × aⁿ = aᵐ⁺ⁿ,  aᵐ ÷ aⁿ = aᵐ⁻ⁿ,  (aᵐ)ⁿ = aᵐⁿ,  a⁰ = 1',
    examples: [{ problem: '2³ × 2²', solution: 'Basis sama, tambahkan pangkat: 2³⁺² = 2⁵ = 32' }],
    mistakes: ['Mengalikan basis dan pangkat sekaligus, misalnya 2³ × 2² dianggap 4⁵.', 'Lupa bahwa a⁰ selalu 1, bukan 0.'],
    tips: ['Saat basis sama dan dikali, pangkat dijumlah — bukan basisnya yang dikali.', 'Tuliskan perkalian berulang jika ragu, lalu hitung manual.']
  },
  {
    id: 'bentuk-akar', title: 'Bentuk Akar', difficulty: 'med', prereq: ['pangkat'],
    concept: 'Bentuk akar adalah kebalikan dari pangkat — mencari bilangan yang jika dipangkatkan menghasilkan nilai di dalam akar.',
    intuitive: '√a bertanya "bilangan apa yang jika dikalikan dirinya sendiri menghasilkan a?" Ini kebalikan langsung dari mengkuadratkan.',
    illustration: '√36 = 6 karena 6 × 6 = 36.',
    formula: '√(a×b) = √a × √b,  √a + √a = 2√a (suku sejenis)',
    examples: [{ problem: '√50', solution: '50 = 25 × 2, sehingga √50 = √25 × √2 = 5√2' }],
    mistakes: ['Menganggap √a + √b = √(a+b), padahal akar tidak bisa dijumlah langsung kecuali suku sejenis.', 'Lupa menyederhanakan akar ke bentuk paling sederhana.'],
    tips: ['Cari faktor kuadrat sempurna terbesar (4, 9, 16, 25, ...) sebelum menyederhanakan.', 'Akar hanya bisa dijumlah jika bagian dalam akarnya sama persis.']
  },
  {
    id: 'aljabar', title: 'Operasi Aljabar', difficulty: 'easy', prereq: ['bilangan'],
    concept: 'Aljabar menggunakan huruf (variabel) untuk mewakili bilangan yang belum diketahui, lalu menggabungkan suku-suku sejenis.',
    intuitive: 'Variabel seperti "wadah kosong" yang bisa diisi bilangan apa saja. Suku sejenis (variabel dan pangkat sama) bisa digabung seperti menggabungkan buah yang sama jenis.',
    illustration: '3x + 2x = 5x — dua kelompok "x" digabung menjadi satu kelompok besar berisi 5 buah x.',
    formula: 'ax + bx = (a+b)x,  a(x+y) = ax + ay (sifat distributif)',
    examples: [{ problem: '4x + 3 − x + 5', solution: 'Gabungkan suku x: 4x − x = 3x. Gabungkan konstanta: 3+5=8. Hasil: 3x + 8' }],
    mistakes: ['Menggabungkan suku yang berbeda variabel, misalnya 3x + 2y dianggap 5xy.', 'Lupa mendistribusikan tanda minus ke semua suku dalam kurung.'],
    tips: ['Garis bawahi suku sejenis dengan warna yang sama sebelum digabung.', 'Saat ada tanda minus di depan kurung, balik semua tanda di dalamnya.']
  },
  {
    id: 'persamaan-linear', title: 'Persamaan Linear', difficulty: 'med', prereq: ['aljabar'],
    concept: 'Persamaan linear adalah kalimat matematika dengan tanda "=" yang mengandung variabel berpangkat satu, dan tujuannya mencari nilai variabel tersebut.',
    intuitive: 'Bayangkan persamaan sebagai timbangan yang seimbang. Apa pun operasi yang dilakukan di satu sisi, harus dilakukan juga di sisi lain agar tetap seimbang.',
    illustration: '2x + 3 = 11 → kurangi 3 di kedua sisi → 2x = 8 → bagi 2 → x = 4',
    formula: 'ax + b = c  →  x = (c − b) / a',
    examples: [{ problem: '3x − 5 = 10', solution: 'Tambah 5 kedua sisi: 3x = 15. Bagi 3: x = 5' }],
    mistakes: ['Hanya melakukan operasi di satu sisi persamaan sehingga timbangan tidak seimbang.', 'Salah memindahkan tanda saat memindahkan suku ke sisi lain.'],
    tips: ['Setiap kali "memindahkan" suku ke sisi lain, tandanya berubah menjadi lawannya.', 'Selalu cek jawaban dengan mensubstitusi kembali ke persamaan awal.']
  },
  {
    id: 'perbandingan', title: 'Perbandingan', difficulty: 'easy', prereq: ['bilangan'],
    concept: 'Perbandingan membandingkan dua besaran menggunakan rasio, dan digunakan untuk menyelesaikan masalah skala dan proporsi.',
    intuitive: 'Jika 2 apel seharga Rp4.000, maka rasio harga terhadap jumlah tetap sama meskipun jumlah apel berubah — ini disebut perbandingan senilai.',
    illustration: '2 : 4 = 1 : 2 — kedua rasio ini setara meski angkanya berbeda.',
    formula: 'a/b = c/d  →  a × d = b × c (perkalian silang)',
    examples: [{ problem: 'Jika 3 buku seharga Rp15.000, berapa harga 5 buku?', solution: '3/15000 = 5/x → x = 5 × 15000 / 3 = 25000' }],
    mistakes: ['Menukar posisi pembilang dan penyebut saat perkalian silang.', 'Mencampur perbandingan senilai dengan berbalik nilai.'],
    tips: ['Tulis rasio dengan satuan yang sama di posisi yang konsisten (atas-atas, bawah-bawah).', 'Cek apakah soal menaikkan atau menurunkan nilai untuk menentukan jenis perbandingan.']
  },
  {
    id: 'pecahan-aljabar', title: 'Pecahan Aljabar', difficulty: 'med', prereq: ['aljabar'],
    concept: 'Pecahan aljabar adalah pecahan yang pembilang atau penyebutnya mengandung variabel, dan disederhanakan dengan mencari faktor sekutu.',
    intuitive: 'Sama seperti pecahan biasa, pecahan aljabar disederhanakan dengan membagi pembilang dan penyebut dengan faktor yang sama.',
    illustration: '(6x) / (3) = 2x — angka 3 membagi habis 6, menyisakan 2x.',
    formula: '(a/x) + (b/x) = (a+b)/x  (penyebut sama, gabungkan pembilang)',
    examples: [{ problem: '(8x) / (4)', solution: '8 dibagi 4 = 2, sehingga hasilnya 2x' }],
    mistakes: ['Menyederhanakan hanya pembilang tanpa membagi penyebut dengan angka yang sama.', 'Menjumlahkan pecahan aljabar tanpa menyamakan penyebut terlebih dahulu.'],
    tips: ['Cari FPB dari koefisien sebelum menyederhanakan.', 'Penyebut harus sama sebelum pembilang boleh dijumlahkan.']
  },
  {
    id: 'relasi', title: 'Relasi', difficulty: 'easy', prereq: ['aljabar'],
    concept: 'Relasi adalah hubungan antara anggota dua himpunan, biasanya dituliskan sebagai pasangan berurutan (x, y).',
    intuitive: 'Relasi seperti daftar pasangan "siapa terhubung dengan siapa" — satu anggota domain bisa terhubung ke satu atau lebih anggota kodomain.',
    illustration: '{(1,2), (2,4), (3,6)} — setiap x dipasangkan dengan 2x.',
    formula: 'Relasi disebut fungsi jika setiap x hanya punya tepat satu pasangan y',
    examples: [{ problem: 'Apakah {(1,2),(1,3),(2,4)} sebuah fungsi?', solution: 'Bukan, karena x=1 punya dua pasangan berbeda (2 dan 3)' }],
    mistakes: ['Menganggap semua relasi otomatis adalah fungsi.', 'Salah membaca urutan pasangan (x,y) sebagai (y,x).'],
    tips: ['Cek apakah ada nilai x yang muncul lebih dari sekali dengan y berbeda — jika ada, bukan fungsi.', 'Gambar diagram panah untuk memvisualisasikan pasangan.']
  },
  {
    id: 'fungsi', title: 'Fungsi', difficulty: 'med', prereq: ['relasi'],
    concept: 'Fungsi adalah relasi khusus di mana setiap input (x) menghasilkan tepat satu output f(x).',
    intuitive: 'Fungsi seperti mesin: masukkan angka x, mesin memprosesnya dengan aturan tertentu, dan keluar satu hasil f(x).',
    illustration: 'f(x) = 2x + 1 → masukkan x=3 → keluar f(3) = 2(3)+1 = 7',
    formula: 'f(x) = ax + b — substitusi nilai x untuk mendapatkan f(x)',
    examples: [{ problem: 'f(x) = 3x − 2, tentukan f(4)', solution: 'f(4) = 3(4) − 2 = 12 − 2 = 10' }],
    mistakes: ['Salah urutan operasi saat mensubstitusi nilai x.', 'Menganggap f(x) sebagai perkalian f dan x.'],
    tips: ['f(x) hanyalah nama fungsi, bukan f dikali x.', 'Substitusi nilai x dengan tanda kurung agar tidak salah tanda.']
  },
  {
    id: 'pythagoras', title: 'Pythagoras', difficulty: 'med', prereq: ['aljabar', 'pangkat', 'bentuk-akar'],
    concept: 'Teorema Pythagoras menghubungkan panjang tiga sisi segitiga siku-siku: kuadrat sisi miring sama dengan jumlah kuadrat kedua sisi lainnya.',
    intuitive: 'Bayangkan dua persegi kecil di sisi tegak dan mendatar; luas gabungan keduanya persis sama dengan luas persegi besar di sisi miring.',
    illustration: 'Segitiga siku-siku dengan sisi 3, 4, dan 5: 3² + 4² = 9 + 16 = 25 = 5².',
    formula: 'c² = a² + b²  (c = sisi miring/hipotenusa)',
    examples: [{ problem: 'Sisi tegak 6 dan 8, cari sisi miring', solution: 'c² = 6²+8² = 36+64 = 100 → c = 10' }],
    mistakes: ['Menggunakan rumus pada segitiga yang bukan siku-siku.', 'Salah menentukan mana sisi miring (harus di depan sudut siku-siku).'],
    tips: ['Sisi miring selalu yang terpanjang dan berhadapan dengan sudut 90°.', 'Hafalkan triple Pythagoras umum: 3-4-5, 6-8-10, 5-12-13.']
  },
  {
    id: 'splcv', title: 'SPLDV', difficulty: 'hard', prereq: ['persamaan-linear'],
    concept: 'Sistem Persamaan Linear Dua Variabel (SPLDV) adalah dua persamaan linear dengan dua variabel yang diselesaikan secara bersamaan.',
    intuitive: 'Dua persamaan adalah dua petunjuk tentang dua bilangan rahasia (x dan y). Menggabungkan kedua petunjuk memungkinkan kita menemukan nilai pastinya.',
    illustration: 'x + y = 10 dan x − y = 2 → jumlahkan kedua persamaan: 2x = 12 → x = 6, lalu y = 4',
    formula: 'Metode eliminasi: jumlah/kurangkan persamaan untuk menghilangkan satu variabel',
    examples: [{ problem: 'x+y=7, x−y=1', solution: 'Jumlahkan: 2x=8 → x=4, substitusi: y=3' }],
    mistakes: ['Lupa mengalikan seluruh persamaan saat menyamakan koefisien sebelum eliminasi.', 'Salah tanda saat mengurangkan dua persamaan.'],
    tips: ['Samakan koefisien salah satu variabel dulu sebelum eliminasi.', 'Selalu cek jawaban dengan mensubstitusi ke kedua persamaan asli.']
  },
  {
    id: 'statistika', title: 'Statistika', difficulty: 'easy', prereq: ['bilangan'],
    concept: 'Statistika mempelajari cara mengumpulkan, mengolah, dan menyimpulkan data menggunakan ukuran seperti rata-rata (mean).',
    intuitive: 'Rata-rata adalah cara meratakan semua nilai data menjadi satu angka yang mewakili "nilai tengah" kumpulan data tersebut.',
    illustration: 'Data 4, 6, 8 → jumlah 18, dibagi 3 data → rata-rata 6.',
    formula: 'Mean = (jumlah semua data) / (banyak data)',
    examples: [{ problem: 'Data: 5, 7, 9', solution: '(5+7+9)/3 = 21/3 = 7' }],
    mistakes: ['Lupa membagi dengan banyak data, hanya menjumlahkan saja.', 'Salah menghitung banyak data ketika ada nilai yang berulang.'],
    tips: ['Selalu hitung dulu berapa banyak data sebelum membagi.', 'Tuliskan jumlah total secara terpisah agar tidak salah hitung.']
  },
  {
    id: 'fungsi-kuadrat', title: 'Fungsi Kuadrat', difficulty: 'hard', prereq: ['fungsi', 'bentuk-akar'],
    concept: 'Fungsi kuadrat adalah fungsi berpangkat dua yang grafiknya berbentuk parabola, dengan titik puncak sebagai nilai maksimum atau minimum.',
    intuitive: 'Bayangkan lintasan bola yang dilempar ke atas — bentuk lintasannya adalah parabola, dan titik tertinggi lintasan itu adalah titik puncak fungsi kuadrat.',
    illustration: 'f(x) = x² − 4x + 3 → akar-akarnya x=1 dan x=3, titik puncak di x=2.',
    formula: 'f(x) = ax² + bx + c,  sumbu simetri: x = −b / (2a)',
    examples: [{ problem: 'f(x) = x² − 6x + 8, cari sumbu simetri', solution: 'x = −(−6)/(2×1) = 6/2 = 3' }],
    mistakes: ['Lupa tanda negatif pada rumus sumbu simetri.', 'Tertukar antara koefisien a, b, dan c saat substitusi rumus.'],
    tips: ['Tulis nilai a, b, c terpisah sebelum substitusi ke rumus.', 'Sumbu simetri selalu berada tepat di tengah dua akar fungsi kuadrat.']
  }
];

/* Hitung tier (kedalaman dependency) & usedBy secara otomatis dari data prereq di atas */
function buildGraphMeta(){
  const byId = Object.fromEntries(MATERI.map(m => [m.id, m]));
  function depth(id, seen = new Set()){
    const node = byId[id];
    if(!node.prereq.length) return 0;
    if(seen.has(id)) return 0; // guard cycle
    seen.add(id);
    return 1 + Math.max(...node.prereq.map(p => depth(p, seen)));
  }
  MATERI.forEach(m => { m.tier = depth(m.id); m.usedBy = []; });
  MATERI.forEach(m => m.prereq.forEach(p => byId[p].usedBy.push(m.id)));
  return byId;
}
const MATERI_BY_ID = buildGraphMeta();

/* ================= 4. GENERATOR SOAL (per node) ================= */
const GENERATORS = {
  bilangan(){
    const variant = pick(['order', 'fraction']);
    if(variant === 'order'){
      const a = randInt(2, 12), b = randInt(2, 9), c = randInt(2, 9);
      const correct = a + b * c;
      const wrong1 = (a + b) * c;
      const distractors = [wrong1, correct + randInt(1, 4), correct - randInt(1, 4)];
      const { choices, answerIndex } = buildChoices(correct, distractors);
      return { text: `Hasil dari ${a} + ${b} × ${c} adalah?`, choices, answerIndex,
        explanation: `Kalikan dulu: ${b} × ${c} = ${b*c}, lalu jumlahkan: ${a} + ${b*c} = ${correct}.` };
    } else {
      const n1 = randInt(1, 5), d1 = randInt(2, 6), n2 = randInt(1, 5), d2 = d1;
      const correctN = n1 + n2;
      const { choices, answerIndex } = buildChoices(fmtFrac(correctN, d1), [fmtFrac(n1*d2+n2*d1, d1*d2), fmtFrac(correctN+1, d1), fmtFrac(correctN-1, d1)]);
      return { text: `Hasil dari ${n1}/${d1} + ${n2}/${d2} adalah?`, choices, answerIndex,
        explanation: `Penyebut sudah sama (${d1}), jumlahkan pembilang: ${n1}+${n2}=${correctN}, hasil ${fmtFrac(correctN, d1)}.` };
    }
  },
  pangkat(){
    const base = randInt(2, 5), m = randInt(2, 4), n = randInt(2, 3);
    const variant = pick(['mul', 'div']);
    if(variant === 'mul'){
      const correct = m + n;
      const { choices, answerIndex } = buildChoices(`${base}^${correct}`, [`${base*base}^${m+n}`, `${base}^${m*n}`, `${base}^${correct+1}`]);
      return { text: `Sederhanakan: ${base}^${m} × ${base}^${n}`, choices, answerIndex,
        explanation: `Basis sama, pangkat dijumlahkan: ${base}^(${m}+${n}) = ${base}^${correct}.` };
    } else {
      const total = m + n;
      const { choices, answerIndex } = buildChoices(`${base}^${m}`, [`${base}^${total}`, `${base}^${n-m}`, `${base}^${m+1}`]);
      return { text: `Sederhanakan: ${base}^${total} ÷ ${base}^${n}`, choices, answerIndex,
        explanation: `Basis sama, pangkat dikurangkan: ${base}^(${total}-${n}) = ${base}^${m}.` };
    }
  },
  'bentuk-akar'(){
    const sq = pick([2,3,4,5]);
    const factor = pick([2,3,5,6,7]);
    const inside = sq * sq * factor;
    const correct = `${sq}√${factor}`;
    const { choices, answerIndex } = buildChoices(correct, [`√${inside}`, `${sq*factor}√${factor}`, `${sq}√${inside}`]);
    return { text: `Bentuk paling sederhana dari √${inside} adalah?`, choices, answerIndex,
      explanation: `${inside} = ${sq}² × ${factor}, sehingga √${inside} = ${sq}√${factor}.` };
  },
  aljabar(){
    const variant = pick(['combine', 'distribute']);
    if(variant === 'combine'){
      const a = randInt(2, 9), b = randInt(1, 6), c = randInt(1, 8), d = randInt(1, 8);
      const coefX = a - b, konst = c + d;
      const correct = `${coefX}x + ${konst}`;
      const { choices, answerIndex } = buildChoices(correct, [`${a+b}x + ${konst}`, `${coefX}x + ${c-d}`, `${coefX}x - ${konst}`]);
      return { text: `Sederhanakan: ${a}x + ${c} − ${b}x + ${d}`, choices, answerIndex,
        explanation: `Gabungkan suku x: ${a}x−${b}x=${coefX}x. Gabungkan konstanta: ${c}+${d}=${konst}. Hasil: ${correct}.` };
    } else {
      const a = randInt(2, 6), x1 = randInt(1, 6), x2 = randInt(1, 6);
      const correct = `${a}x + ${a*x1}`;
      const { choices, answerIndex } = buildChoices(correct, [`${a}x + ${x1}`, `x + ${a*x1}`, `${a}x + ${a+x1}`]);
      return { text: `Bentuk distributif dari ${a}(x + ${x1}) adalah?`, choices, answerIndex,
        explanation: `Kalikan ${a} ke setiap suku dalam kurung: ${a}×x=${a}x, ${a}×${x1}=${a*x1}. Hasil: ${correct}.` };
    }
  },
  'persamaan-linear'(){
    const a = randInt(2, 8), x = randInt(2, 12), b = randInt(1, 15);
    const c = a * x + b;
    const { choices, answerIndex } = buildChoices(x, [x+1, x-1, Math.round((c+b)/a)]);
    return { text: `Tentukan nilai x dari ${a}x + ${b} = ${c}`, choices, answerIndex,
      explanation: `${a}x = ${c} − ${b} = ${c-b}. Maka x = ${c-b} ÷ ${a} = ${x}.` };
  },
  pertidaksamaan(){
    const a = randInt(2, 6), x = randInt(2, 10), b = randInt(1, 10);
    const c = a * x + b;
    const correct = `x > ${x}`;
    const { choices, answerIndex } = buildChoices(correct, [`x < ${x}`, `x > ${x+1}`, `x ≥ ${x}`]);
    return { text: `Selesaikan: ${a}x + ${b} > ${c}`, choices, answerIndex,
      explanation: `${a}x > ${c-b} → x > ${(c-b)}/${a} → x > ${x}. Tanda tidak berubah karena dibagi bilangan positif.` };
  },
  perbandingan(){
    const unit = randInt(2, 6), harga = randInt(2, 9) * 1000, target = unit * randInt(2, 4);
    const correct = (harga / unit) * target;
    const { choices, answerIndex } = buildChoices(correct, [(harga/unit)*(target-unit), correct+harga, correct-harga]);
    return { text: `Jika ${unit} buku seharga Rp${harga.toLocaleString('id-ID')}, berapa harga ${target} buku?`, choices: choices.map(c => 'Rp' + Number(c).toLocaleString('id-ID')), answerIndex,
      explanation: `Harga per buku = Rp${harga}/${unit} = Rp${harga/unit}. Untuk ${target} buku: Rp${harga/unit} × ${target} = Rp${correct.toLocaleString('id-ID')}.` };
  },
  'pecahan-aljabar'(){
    const coefN = randInt(2, 9), coefD = pick([2,3,4]);
    const n = coefN * coefD;
    const correct = `${coefN}x`;
    const { choices, answerIndex } = buildChoices(correct, [`${n}x`, `${coefN+1}x`, `${Math.round(n/(coefD+1))}x`]);
    return { text: `Sederhanakan pecahan aljabar: (${n}x) / ${coefD}`, choices, answerIndex,
      explanation: `${n} ÷ ${coefD} = ${coefN}, sehingga hasilnya ${coefN}x.` };
  },
  relasi(){
    const isFunction = pick([true, false]);
    let pairs;
    if(isFunction){
      const m = randInt(2,4);
      pairs = [1,2,3].map(x => `(${x}, ${x*m})`).join(', ');
    } else {
      const x0 = randInt(1,3);
      pairs = `(${x0}, ${randInt(1,9)}), (${x0}, ${randInt(1,9)}), (${x0+1}, ${randInt(1,9)})`;
    }
    const correct = isFunction ? 'Ya, merupakan fungsi' : 'Bukan fungsi';
    const { choices, answerIndex } = buildChoices(correct, ['Ya, merupakan fungsi', 'Bukan fungsi', 'Tidak bisa ditentukan']);
    return { text: `Apakah himpunan pasangan {${pairs}} merupakan fungsi?`, choices, answerIndex,
      explanation: isFunction ? 'Setiap nilai x hanya memiliki tepat satu pasangan y, sehingga ini fungsi.' : 'Ada nilai x yang memiliki lebih dari satu pasangan y berbeda, sehingga ini bukan fungsi.' };
  },
  fungsi(){
    const a = randInt(2, 6), b = randInt(1, 10), x = randInt(1, 8);
    const correct = a * x + b;
    const { choices, answerIndex } = buildChoices(correct, [a*x - b, a*(x+b), correct+randInt(1,3)]);
    return { text: `Diketahui f(x) = ${a}x + ${b}. Tentukan f(${x}).`, choices, answerIndex,
      explanation: `f(${x}) = ${a}×${x} + ${b} = ${a*x} + ${b} = ${correct}.` };
  },
  pythagoras(){
    const triples = [[3,4,5],[6,8,10],[5,12,13],[9,12,15],[8,15,17]];
    const [p,q,r] = pick(triples);
    const askHyp = pick([true, false]);
    if(askHyp){
      const { choices, answerIndex } = buildChoices(r, [r-1, r+1, p+q]);
      return { text: `Segitiga siku-siku memiliki sisi tegak ${p} dan sisi mendatar ${q}. Berapa sisi miringnya?`, choices, answerIndex,
        explanation: `c² = ${p}²+${q}² = ${p*p}+${q*q} = ${r*r}. Maka c = √${r*r} = ${r}.` };
    } else {
      const { choices, answerIndex } = buildChoices(p, [p-1, p+1, q]);
      return { text: `Segitiga siku-siku memiliki sisi miring ${r} dan salah satu sisi tegak ${q}. Berapa panjang sisi lainnya?`, choices, answerIndex,
        explanation: `a² = ${r}²−${q}² = ${r*r}−${q*q} = ${p*p}. Maka a = √${p*p} = ${p}.` };
    }
  },
  splcv(){
    const x = randInt(2, 9), y = randInt(2, 9);
    const s1 = x + y, s2 = x - y;
    const { choices, answerIndex } = buildChoices(x, [x+1, x-1, y]);
    return { text: `Diketahui x + y = ${s1} dan x − y = ${s2}. Tentukan nilai x.`, choices, answerIndex,
      explanation: `Jumlahkan kedua persamaan: 2x = ${s1+s2} → x = ${(s1+s2)/2} = ${x}.` };
  },
  statistika(){
    const n = 4;
    const data = Array.from({length:n}, () => randInt(2, 20));
    const sum = data.reduce((a,b)=>a+b,0);
    const correct = Math.round((sum / n) * 100) / 100;
    const { choices, answerIndex } = buildChoices(correct, [Math.round(sum/(n-1)*100)/100, correct+1, correct-1]);
    return { text: `Tentukan rata-rata dari data: ${data.join(', ')}`, choices, answerIndex,
      explanation: `Jumlah data = ${sum}. Banyak data = ${n}. Rata-rata = ${sum}/${n} = ${correct}.` };
  },
  'fungsi-kuadrat'(){
    const a = randInt(1, 3), b = randInt(2, 12) * (pick([1,-1]));
    const correct = fmtFrac(-b, 2*a);
    const { choices, answerIndex } = buildChoices(correct, [fmtFrac(b, 2*a), fmtFrac(-b, a), fmtFrac(-b, 2*a+1)]);
    return { text: `Tentukan sumbu simetri dari f(x) = ${a}x² + (${b})x + 3`, choices, answerIndex,
      explanation: `Sumbu simetri x = −b/(2a) = −(${b})/(2×${a}) = ${correct}.` };
  }
};

function generateQuestion(nodeId){
  return GENERATORS[nodeId] ? GENERATORS[nodeId]() : { text: 'Soal belum tersedia', choices: ['-'], answerIndex: 0, explanation: '' };
}
function generateQuizSet(nodeId, count = 10){
  const set = [];
  const seenTexts = new Set();
  let guard = 0;
  while(set.length < count && guard < count * 8){
    guard++;
    const q = generateQuestion(nodeId);
    if(seenTexts.has(q.text) && guard < count * 6) continue;
    seenTexts.add(q.text);
    set.push(q);
  }
  return set;
}

/* ================= 5. XP / LEVEL / COIN ENGINE ================= */
function xpForLevel(level){ return 100 + (level - 1) * 50; }
function levelInfo(xpTotal){
  let level = 1, remaining = xpTotal;
  while(remaining >= xpForLevel(level)){ remaining -= xpForLevel(level); level++; }
  return { level, xpIntoLevel: remaining, xpNeeded: xpForLevel(level) };
}
function addXP(amount, reason){
  const before = levelInfo(state.xpTotal).level;
  state.xpTotal += amount;
  const after = levelInfo(state.xpTotal).level;
  showToast('xp', `+${amount} XP${reason ? ' · ' + reason : ''}`);
  if(after > before){
    showToast('level', `Naik Level! Sekarang Level ${after} 🎉`);
  }
  saveState();
  updateHUD();
}
function addCoins(amount, reason){
  state.coins += amount;
  showToast('coin', `+${amount} Coins${reason ? ' · ' + reason : ''}`);
  saveState();
  updateHUD();
}

/* ================= 6. ACHIEVEMENT ENGINE ================= */
const ACHIEVEMENTS = [
  { id: 'first-lesson', name: 'Langkah Pertama', desc: 'Selesaikan materi pertamamu', icon: '🌱', check: s => Object.values(s.materi).some(m => m.read) },
  { id: 'soal-100', name: '100 Soal', desc: 'Jawab 100 soal latihan', icon: '💯', check: s => s.totalAnswered >= 100 },
  { id: 'soal-1000', name: '1000 Soal', desc: 'Jawab 1000 soal latihan', icon: '🏆', check: s => s.totalAnswered >= 1000 },
  { id: 'perfect-quiz', name: 'Perfect Quiz', desc: 'Dapatkan nilai 100 dalam satu quiz', icon: '⭐', check: s => Object.values(s.materi).some(m => m.quizHistory.some(q => q.score === 100)) },
  { id: 'streak-7', name: '7 Day Streak', desc: 'Belajar 7 hari berturut-turut', icon: '🔥', check: s => s.streak >= 7 },
  { id: 'streak-30', name: '30 Day Streak', desc: 'Belajar 30 hari berturut-turut', icon: '🔥', check: s => s.streak >= 30 },
  { id: 'master-aljabar', name: 'Master Aljabar', desc: 'Raih status MASTER di materi Aljabar', icon: '🧠', check: s => (s.materi['aljabar']?.master90Dates.length || 0) >= 3 },
  { id: 'master-pythagoras', name: 'Master Pythagoras', desc: 'Raih status MASTER di materi Pythagoras', icon: '📐', check: s => (s.materi['pythagoras']?.master90Dates.length || 0) >= 3 },
  { id: 'master-fungsi', name: 'Master Fungsi', desc: 'Raih status MASTER di materi Fungsi', icon: '🎯', check: s => (s.materi['fungsi']?.master90Dates.length || 0) >= 3 },
  { id: 'never-give-up', name: 'Never Give Up', desc: 'Coba quiz yang sama 5 kali', icon: '💪', check: s => Object.values(s.materi).some(m => m.attempts >= 5) },
  { id: 'speed-runner', name: 'Speed Runner', desc: 'Selesaikan quiz dalam waktu kurang dari 90 detik', icon: '⚡', check: s => Object.values(s.materi).some(m => m.quizHistory.some(q => q.timeSeconds < 90)) },
  { id: 'night-owl', name: 'Night Owl', desc: 'Belajar di antara jam 00:00–04:00', icon: '🦉', check: s => Object.values(s.materi).some(m => m.quizHistory.some(q => q.hour >= 0 && q.hour < 4)) },
  { id: 'early-bird', name: 'Early Bird', desc: 'Belajar di antara jam 05:00–07:00', icon: '🐦', check: s => Object.values(s.materi).some(m => m.quizHistory.some(q => q.hour >= 5 && q.hour < 7)) }
];
function checkAchievements(){
  ACHIEVEMENTS.forEach(a => {
    if(!state.achievements[a.id] && a.check(state)){
      state.achievements[a.id] = todayStr();
      showToast('achievement', `Lencana baru: ${a.name} 🏅`);
    }
  });
  saveState();
}

/* ================= 7. NAVIGATION ================= */
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
  document.getElementById('screen-' + name).classList.add('active-screen');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if(name === 'skilltree') renderSkillTree();
  if(name === 'dashboard') renderDashboard();
  if(name === 'shop') renderShop();
  if(name === 'achievements') renderAchievements();
}

/* ================= 8. SKILL TREE RENDER ================= */
function isUnlocked(nodeId){
  const node = MATERI_BY_ID[nodeId];
  return node.prereq.every(p => getMateriState(p).bestScore >= 60);
}
function nodeStatusLabel(nodeId){
  const ms = getMateriState(nodeId);
  if(ms.master90Dates.length >= 3) return 'MASTER';
  if(ms.bestScore >= 90) return 'Master Candidate';
  if(ms.bestScore >= 80) return 'Paham';
  if(ms.bestScore >= 60) return 'Cukup';
  if(ms.attempts > 0) return 'Belum Paham';
  return ms.read ? 'Dipelajari' : 'Belum Dimulai';
}
function nodeCompletionPct(nodeId){
  const ms = getMateriState(nodeId);
  return Math.min(100, Math.round((ms.read ? 30 : 0) + Math.min(ms.bestScore, 100) * 0.7));
}
function renderSkillTree(){
  const tiers = {};
  MATERI.forEach(m => { (tiers[m.tier] ||= []).push(m); });
  const canvas = document.getElementById('tree-canvas');
  canvas.innerHTML = '';
  Object.keys(tiers).sort((a,b) => a - b).forEach(tierKey => {
    const row = document.createElement('div');
    row.className = 'tier-row';
    const label = document.createElement('div');
    label.className = 'tier-label';
    label.textContent = `Tahap ${Number(tierKey) + 1}`;
    row.appendChild(label);
    tiers[tierKey].forEach(node => row.appendChild(buildNodeCard(node)));
    canvas.appendChild(row);
  });
  requestAnimationFrame(drawTreeLines);
}
function buildNodeCard(node){
  const unlocked = isUnlocked(node.id);
  const ms = getMateriState(node.id);
  const isMastered = ms.master90Dates.length >= 3;
  const card = document.createElement('div');
  card.className = 'node-card' + (unlocked ? '' : ' locked') + (isMastered ? ' mastered' : '');
  card.dataset.nodeId = node.id;
  card.innerHTML = `
    <div class="node-top">
      <span class="node-diff ${node.difficulty}">${node.difficulty === 'easy' ? 'Mudah' : node.difficulty === 'med' ? 'Sedang' : 'Sulit'}</span>
      ${unlocked ? '' : '<span class="node-lock-icon">🔒</span>'}
    </div>
    <div class="node-title">${node.title}</div>
    <div class="node-status ${isMastered ? 'status-master' : ''}">${nodeStatusLabel(node.id)}</div>
    <div class="node-progress-track"><div class="node-progress-fill" style="width:${nodeCompletionPct(node.id)}%"></div></div>
    <div class="node-progress-pct">${nodeCompletionPct(node.id)}%</div>
  `;
  card.addEventListener('click', () => {
    if(unlocked) openMateri(node.id);
    else showLockModal(node);
  });
  return card;
}
function drawTreeLines(){
  const svg = document.getElementById('tree-lines');
  const wrap = document.querySelector('.tree-wrap');
  svg.innerHTML = '';
  const wrapRect = wrap.getBoundingClientRect();
  MATERI.forEach(node => {
    const toEl = document.querySelector(`.node-card[data-node-id="${node.id}"]`);
    if(!toEl) return;
    const toRect = toEl.getBoundingClientRect();
    node.prereq.forEach(pId => {
      const fromEl = document.querySelector(`.node-card[data-node-id="${pId}"]`);
      if(!fromEl) return;
      const fromRect = fromEl.getBoundingClientRect();
      const x1 = fromRect.right - wrapRect.left + wrap.scrollLeft;
      const y1 = fromRect.top + fromRect.height/2 - wrapRect.top + wrap.scrollTop;
      const x2 = toRect.left - wrapRect.left + wrap.scrollLeft;
      const y2 = toRect.top + toRect.height/2 - wrapRect.top + wrap.scrollTop;
      const midX = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
      const done = getMateriState(pId).bestScore >= 60;
      path.setAttribute('stroke', done ? '#4fe3c1' : '#2a3260');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', done ? '0.7' : '0.5');
      svg.appendChild(path);
    });
  });
}
window.addEventListener('resize', () => { if(document.getElementById('screen-skilltree').classList.contains('active-screen')) drawTreeLines(); });

/* ---- Lock modal ---- */
let pendingLockGoto = null;
function showLockModal(node){
  const missing = node.prereq.filter(p => getMateriState(p).bestScore < 60);
  const missingNames = missing.map(p => MATERI_BY_ID[p].title).join(', ');
  document.getElementById('lock-title').textContent = `${node.title} Terkunci`;
  document.getElementById('lock-message').textContent = `Kamu belum menguasai ${missingNames}. Materi ini akan jauh lebih mudah dipahami setelah menyelesaikan prasyaratnya terlebih dahulu.`;
  pendingLockGoto = missing[0];
  document.getElementById('lock-modal').classList.add('show');
}
document.getElementById('lock-close-btn').addEventListener('click', () => document.getElementById('lock-modal').classList.remove('show'));
document.getElementById('lock-goto-btn').addEventListener('click', () => {
  document.getElementById('lock-modal').classList.remove('show');
  if(pendingLockGoto) openMateri(pendingLockGoto);
});

/* ================= 9. HALAMAN MATERI ================= */
function openMateri(nodeId){
  const node = MATERI_BY_ID[nodeId];
  const ms = getMateriState(nodeId);
  ms.read = true;
  saveState();
  checkAchievements();

  const prereqChips = node.prereq.map(p => `<span class="rel-chip ${getMateriState(p).bestScore>=60?'done':''}">${MATERI_BY_ID[p].title}</span>`).join('') || '<span class="rel-chip done">Tidak ada</span>';
  const usedByChips = node.usedBy.map(u => `<span class="rel-chip">${MATERI_BY_ID[u].title}</span>`).join('') || '<span class="rel-chip">Belum ada</span>';

  document.getElementById('materi-content').innerHTML = `
    <div class="lesson-header">
      <h1>${node.title}</h1>
      <div class="lesson-meta">
        <span>Tingkat kesulitan: ${node.difficulty === 'easy' ? 'Mudah' : node.difficulty === 'med' ? 'Sedang' : 'Sulit'}</span>
        <span>•</span>
        <span>Progres: ${nodeCompletionPct(nodeId)}%</span>
        <span>•</span>
        <span>Status: ${nodeStatusLabel(nodeId)}</span>
      </div>
    </div>
    <div class="lesson-grid">
      <div>
        <div class="card"><h3>💡 Konsep</h3><p>${node.concept}</p></div>
        <div class="card"><h3>🧭 Penjelasan Intuitif</h3><p>${node.intuitive}</p></div>
        <div class="card"><h3>🖼 Ilustrasi</h3><div class="example-box">${node.illustration}</div></div>
        <div class="card"><h3>📐 Rumus</h3><div class="formula-box">${node.formula}</div></div>
        <div class="card"><h3>✏️ Contoh Soal</h3>
          ${node.examples.map(ex => `<div class="example-box"><b>${ex.problem}</b><br><span style="color:var(--ink-2)">${ex.solution}</span></div>`).join('')}
        </div>
        <div class="card mistake-box"><h3>⚠️ Kesalahan Umum</h3><ul>${node.mistakes.map(m => `<li>${m}</li>`).join('')}</ul></div>
        <div class="card tip-box"><h3>🎯 Tips Mengingat</h3><ul>${node.tips.map(t => `<li>${t}</li>`).join('')}</ul></div>
      </div>
      <div>
        <div class="card"><h3>⬅ Prasyarat</h3><div class="rel-chip-row">${prereqChips}</div></div>
        <div class="card"><h3>➡ Dipakai Untuk</h3><div class="rel-chip-row">${usedByChips}</div></div>
        <div class="card">
          <h3>📊 Riwayat</h3>
          <p>Percobaan quiz: ${ms.attempts}<br>Skor terbaik: ${ms.bestScore}<br>Nilai 90+ (hari berbeda): ${ms.master90Dates.length}/3</p>
        </div>
        <div class="lesson-actions">
          <button class="btn btn-primary" onclick="startQuiz('${nodeId}')">Mulai Quiz (10 Soal)</button>
          <button class="btn btn-ghost" data-back="skilltree">Kembali</button>
        </div>
      </div>
    </div>
  `;
  showScreen('materi');
}

/* ================= 10. QUIZ ENGINE ================= */
let quizState = null;
function startQuiz(nodeId){
  quizState = {
    nodeId,
    questions: generateQuizSet(nodeId, 10),
    index: 0,
    correctCount: 0,
    wrongConcepts: [],
    reviewLog: [],
    startedAt: Date.now(),
    answered: false
  };
  showScreen('quiz');
  renderQuizQuestion();
}
function renderQuizQuestion(){
  const q = quizState.questions[quizState.index];
  quizState.answered = false;
  const pct = Math.round((quizState.index / quizState.questions.length) * 100);
  document.getElementById('quiz-content').innerHTML = `
    <div class="quiz-topbar">
      <span style="color:var(--ink-2);font-size:13px;">Soal ${quizState.index + 1} / ${quizState.questions.length}</span>
      <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${pct}%"></div></div>
      <span class="quiz-timer">${MATERI_BY_ID[quizState.nodeId].title}</span>
    </div>
    <div class="quiz-question-card">
      <div class="quiz-question-text">${q.text}</div>
      <div class="quiz-choices" id="quiz-choices">
        ${q.choices.map((c, i) => `
          <button class="quiz-choice" data-idx="${i}">
            <span class="qc-letter">${String.fromCharCode(65+i)}</span><span>${c}</span>
          </button>`).join('')}
      </div>
      <div id="quiz-explain-wrap"></div>
    </div>
  `;
  document.querySelectorAll('#quiz-choices .quiz-choice').forEach(btn => {
    btn.addEventListener('click', () => selectAnswer(Number(btn.dataset.idx)));
  });
}
function selectAnswer(idx){
  if(quizState.answered) return;
  quizState.answered = true;
  const q = quizState.questions[quizState.index];
  const correct = idx === q.answerIndex;
  state.totalAnswered++;
  if(correct){ state.totalCorrect++; quizState.correctCount++; addXP(10, 'Jawaban benar'); addCoins(2); }
  else { quizState.wrongConcepts.push(q.text); }
  quizState.reviewLog.push({ text: q.text, correct, explanation: q.explanation });
  saveState();

  document.querySelectorAll('#quiz-choices .quiz-choice').forEach((btn, i) => {
    btn.disabled = true;
    if(i === q.answerIndex) btn.classList.add('correct');
    else if(i === idx) btn.classList.add('wrong');
  });
  document.getElementById('quiz-explain-wrap').innerHTML = `<div class="quiz-explain">${q.explanation}</div>
    <div class="lesson-actions" style="margin-top:16px;">
      <button class="btn btn-primary" id="quiz-next-btn">${quizState.index + 1 < quizState.questions.length ? 'Soal Berikutnya' : 'Lihat Hasil'}</button>
    </div>`;
  document.getElementById('quiz-next-btn').addEventListener('click', nextQuestion);
}
function nextQuestion(){
  quizState.index++;
  if(quizState.index >= quizState.questions.length) finishQuiz();
  else renderQuizQuestion();
}
function finishQuiz(){
  const total = quizState.questions.length;
  const score = Math.round((quizState.correctCount / total) * 100);
  const timeSeconds = Math.round((Date.now() - quizState.startedAt) / 1000);
  const now = new Date();
  const ms = getMateriState(quizState.nodeId);
  ms.attempts++;
  ms.bestScore = Math.max(ms.bestScore, score);
  const entry = { date: todayStr(), score, timeSeconds, accuracy: score, hour: now.getHours() };
  ms.quizHistory.push(entry);
  if(score >= 90 && !ms.master90Dates.includes(todayStr())) ms.master90Dates.push(todayStr());

  let xpGain = 0, coinGain = 0;
  if(score === 100){ xpGain += 50; coinGain += 15; showToast('xp', 'Perfect Quiz! +50 XP'); }
  if(ms.master90Dates.length >= 3 && !ms.masterRewarded){ xpGain += 100; coinGain += 30; ms.masterRewarded = true; showToast('achievement', `${MATERI_BY_ID[quizState.nodeId].title} MASTER! +100 XP`); }
  saveState();
  if(xpGain) addXP(xpGain, 'Bonus quiz');
  if(coinGain) addCoins(coinGain, 'Bonus quiz');
  checkAchievements();
  renderResult(score, timeSeconds, quizState.reviewLog);
}

/* ================= 11. HASIL QUIZ ================= */
function statusForScore(score){
  if(score >= 90) return { label: 'Master Candidate', cls: 'status-master' };
  if(score >= 80) return { label: 'Paham', cls: 'status-paham' };
  if(score >= 60) return { label: 'Cukup', cls: 'status-cukup' };
  return { label: 'Belum Paham', cls: 'status-belum' };
}
function renderResult(score, timeSeconds, reviewLog){
  const status = statusForScore(score);
  const wrongCount = reviewLog.filter(r => !r.correct).length;
  const node = MATERI_BY_ID[quizState.nodeId];
  const recommendation = score < 60
    ? `Ulangi materi <b>${node.title}</b> serta tinjau kembali prasyaratnya: ${node.prereq.map(p => MATERI_BY_ID[p].title).join(', ') || '-'}.`
    : score < 80
      ? `Coba quiz <b>${node.title}</b> sekali lagi untuk memperkuat pemahaman sebelum lanjut ke materi berikutnya.`
      : `Kamu siap lanjut ke: ${node.usedBy.map(u => MATERI_BY_ID[u].title).join(', ') || 'materi lanjutan lainnya'}.`;

  document.getElementById('result-content').innerHTML = `
    <div class="result-hero">
      <div class="result-badge">${score>=90?'🏆':score>=80?'🎉':score>=60?'👍':'📘'}</div>
      <div class="result-score">${score}</div>
      <div class="result-status ${status.cls}">${status.label}</div>
    </div>
    <div class="result-stats">
      <div class="result-stat"><div class="num">${score}%</div><div class="lbl">Akurasi</div></div>
      <div class="result-stat"><div class="num">${timeSeconds}s</div><div class="lbl">Waktu</div></div>
      <div class="result-stat"><div class="num">${wrongCount}</div><div class="lbl">Konsep Salah</div></div>
    </div>
    <div class="card">
      <h3>📌 Rekomendasi</h3>
      <p>${recommendation}</p>
    </div>
    <div class="card">
      <h3>📝 Pembahasan</h3>
      ${reviewLog.map(r => `
        <div class="review-item">
          <span class="review-tag ${r.correct?'tag-benar':'tag-salah'}">${r.correct?'BENAR':'SALAH'}</span>
          ${r.text}<br><span style="color:var(--ink-2);font-size:13px;">${r.explanation}</span>
        </div>`).join('')}
    </div>
    <div class="lesson-actions">
      <button class="btn btn-primary" onclick="startQuiz('${quizState.nodeId}')">Coba Lagi</button>
      <button class="btn btn-secondary" data-back="skilltree">Kembali ke Peta</button>
    </div>
  `;
  showScreen('result');
}

/* ================= 12. DASHBOARD ================= */
function renderDashboard(){
  const li = levelInfo(state.xpTotal);
  const completed = Object.values(state.materi).filter(m => m.bestScore >= 60).length;
  const mastered = Object.values(state.materi).filter(m => m.master90Dates.length >= 3).length;
  const hours = (state.studySeconds / 3600).toFixed(1);

  const attempted = MATERI.filter(m => getMateriState(m.id).attempts > 0)
    .map(m => ({ title: m.title, score: getMateriState(m.id).bestScore }))
    .sort((a,b) => a.score - b.score);
  const weakest = attempted.slice(0, 3);
  const strongest = attempted.slice(-3).reverse();

  const allHistory = [];
  Object.entries(state.materi).forEach(([id, m]) => m.quizHistory.forEach(q => allHistory.push({ ...q, id })));
  allHistory.sort((a,b) => a.date.localeCompare(b.date));
  const last10 = allHistory.slice(-10);

  document.getElementById('dashboard-content').innerHTML = `
    <div class="dash-grid">
      <div class="dash-stat c-violet"><div class="lbl">Level</div><div class="num">${li.level}</div></div>
      <div class="dash-stat c-cyan"><div class="lbl">Total XP</div><div class="num">${state.xpTotal}</div></div>
      <div class="dash-stat c-amber"><div class="lbl">Coins</div><div class="num">${state.coins}</div></div>
      <div class="dash-stat c-rose"><div class="lbl">Streak</div><div class="num">${state.streak}🔥</div></div>
      <div class="dash-stat"><div class="lbl">Materi Selesai</div><div class="num">${completed}/${MATERI.length}</div></div>
      <div class="dash-stat"><div class="lbl">Materi Master</div><div class="num">${mastered}</div></div>
      <div class="dash-stat"><div class="lbl">Jam Belajar</div><div class="num">${hours}</div></div>
      <div class="dash-stat"><div class="lbl">Soal Dijawab</div><div class="num">${state.totalAnswered}</div></div>
    </div>
    <div class="dash-row">
      <div class="card chart-wrap">
        <h3>📈 Grafik Nilai Quiz Terakhir</h3>
        <canvas id="score-chart" width="600" height="180"></canvas>
      </div>
      <div class="card">
        <h3>💪 Bab Terkuat & Terlemah</h3>
        <p style="color:var(--ink-2);font-size:12.5px;margin-bottom:8px;">TERLEMAH</p>
        <div class="weak-strong-list">
          ${weakest.length ? weakest.map(w => `<div class="ws-item"><span>${w.title}</span><div class="ws-bar-mini"><div style="width:${w.score}%;background:var(--rose)"></div></div></div>`).join('') : '<p style="color:var(--ink-2);font-size:13px;">Belum ada data</p>'}
        </div>
        <p style="color:var(--ink-2);font-size:12.5px;margin:14px 0 8px;">TERKUAT</p>
        <div class="weak-strong-list">
          ${strongest.length ? strongest.map(w => `<div class="ws-item"><span>${w.title}</span><div class="ws-bar-mini"><div style="width:${w.score}%;background:var(--cyan)"></div></div></div>`).join('') : '<p style="color:var(--ink-2);font-size:13px;">Belum ada data</p>'}
        </div>
      </div>
    </div>
  `;
  drawScoreChart(last10);
}
function drawScoreChart(history){
  const canvas = document.getElementById('score-chart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, pad = 24;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = '#2a3260'; ctx.lineWidth = 1;
  for(let i=0;i<=4;i++){
    const y = pad + (h - pad*2) * (i/4);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w-pad, y); ctx.stroke();
  }
  if(!history.length){
    ctx.fillStyle = '#7d84b0'; ctx.font = '13px sans-serif'; ctx.fillText('Belum ada data quiz', pad, h/2);
    return;
  }
  const stepX = (w - pad*2) / Math.max(1, history.length - 1);
  ctx.beginPath();
  history.forEach((pt, i) => {
    const x = pad + stepX * i;
    const y = pad + (h - pad*2) * (1 - pt.score/100);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle = '#4fe3c1'; ctx.lineWidth = 2.5; ctx.stroke();
  history.forEach((pt, i) => {
    const x = pad + stepX * i;
    const y = pad + (h - pad*2) * (1 - pt.score/100);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2);
    ctx.fillStyle = pt.score>=80 ? '#4fe3c1' : pt.score>=60 ? '#ffc65c' : '#ff7a90';
    ctx.fill();
  });
}

/* ================= 13. SHOP KOSMETIK ================= */
const COSMETICS = [
  { id: 'theme-default', cat: 'Tema', name: 'Ink Default', price: 0, icon: '🌑' },
  { id: 'theme-sakura', cat: 'Tema', name: 'Sakura Dusk', price: 120, icon: '🌸' },
  { id: 'theme-forest', cat: 'Tema', name: 'Forest Rune', price: 120, icon: '🌲' },
  { id: 'avatar-default', cat: 'Avatar', name: 'Pelajar', price: 0, icon: '🧑‍🎓' },
  { id: 'avatar-wizard', cat: 'Avatar', name: 'Penyihir Angka', price: 80, icon: '🧙' },
  { id: 'avatar-robot', cat: 'Avatar', name: 'Robot Logika', price: 80, icon: '🤖' },
  { id: 'border-default', cat: 'Border', name: 'Polos', price: 0, icon: '⬜' },
  { id: 'border-gold', cat: 'Border', name: 'Emas Berkilau', price: 150, icon: '🟨' },
  { id: 'border-neon', cat: 'Border', name: 'Neon Cyan', price: 150, icon: '🟦' },
  { id: 'cursor-star', cat: 'Cursor', name: 'Bintang Jatuh', price: 60, icon: '✨' },
  { id: 'effect-correct-spark', cat: 'Efek Benar', name: 'Percikan Cahaya', price: 70, icon: '💥' },
  { id: 'effect-levelup-fire', cat: 'Efek Level Up', name: 'Ledakan Api', price: 100, icon: '🔥' },
  { id: 'font-mono', cat: 'Font', name: 'Monospace Klasik', price: 50, icon: '🔤' },
  { id: 'badge-scholar', cat: 'Badge', name: 'Sarjana Muda', price: 90, icon: '🎓' }
];
function renderShop(activeCat){
  const cats = uniq(COSMETICS.map(c => c.cat));
  activeCat = activeCat || cats[0];
  const tabs = cats.map(c => `<button class="shop-tab ${c===activeCat?'active':''}" data-cat="${c}">${c}</button>`).join('');
  const items = COSMETICS.filter(c => c.cat === activeCat).map(item => {
    const owned = state.cosmeticsOwned.includes(item.id);
    const equipped = Object.values(state.cosmeticsEquipped).includes(item.id);
    return `
      <div class="shop-item">
        <div class="shop-item-preview">${item.icon}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price">${item.price === 0 ? 'Gratis' : '◆ ' + item.price}</div>
        <button class="btn ${equipped ? 'btn-ghost' : 'btn-primary'}" data-item="${item.id}" ${equipped ? 'disabled' : ''}>
          ${equipped ? 'Terpakai' : owned ? 'Pakai' : 'Beli'}
        </button>
      </div>`;
  }).join('');
  document.getElementById('shop-content').innerHTML = `
    <div class="shop-tabs">${tabs}</div>
    <div class="shop-grid">${items}</div>
  `;
  document.querySelectorAll('.shop-tab').forEach(btn => btn.addEventListener('click', () => renderShop(btn.dataset.cat)));
  document.querySelectorAll('.shop-item [data-item]').forEach(btn => btn.addEventListener('click', () => handleShopAction(btn.dataset.item, activeCat)));
}
function handleShopAction(itemId, activeCat){
  const item = COSMETICS.find(c => c.id === itemId);
  const owned = state.cosmeticsOwned.includes(itemId);
  if(!owned){
    if(state.coins < item.price){ showToast('coin', 'Coins tidak cukup!'); return; }
    state.coins -= item.price;
    state.cosmeticsOwned.push(itemId);
    showToast('coin', `Dibeli: ${item.name}`);
  }
  const slot = item.cat.toLowerCase().includes('tema') ? 'theme' : item.cat.toLowerCase().includes('avatar') ? 'avatar' : item.cat.toLowerCase().includes('border') ? 'border' : itemId;
  state.cosmeticsEquipped[slot] = itemId;
  saveState();
  updateHUD();
  renderShop(activeCat);
}

/* ================= 14. ACHIEVEMENTS RENDER ================= */
function renderAchievements(){
  document.getElementById('achievements-content').innerHTML = ACHIEVEMENTS.map(a => {
    const unlocked = !!state.achievements[a.id];
    return `
      <div class="ach-card ${unlocked ? 'unlocked' : 'locked'}">
        <div class="ach-icon">${a.icon}</div>
        <div>
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
          ${unlocked ? `<div class="ach-desc" style="color:var(--cyan);margin-top:4px;">Diraih ${state.achievements[a.id]}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

/* ================= 15. TOAST ================= */
function showToast(type, text){
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  document.getElementById('toast-layer').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

/* ================= HUD ================= */
function updateHUD(){
  const li = levelInfo(state.xpTotal);
  document.getElementById('hud-level').textContent = li.level;
  document.getElementById('hud-xp-text').textContent = `${li.xpIntoLevel}/${li.xpNeeded}`;
  document.getElementById('hud-xp-fill').style.width = `${Math.round((li.xpIntoLevel/li.xpNeeded)*100)}%`;
  document.getElementById('hud-coins').textContent = state.coins;
  document.getElementById('hud-streak').textContent = state.streak;
}

/* ================= 16. INIT ================= */
function handleDailyLogin(){
  const today = todayStr();
  if(state.lastLoginDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  state.streak = state.lastLoginDate === yesterday ? state.streak + 1 : 1;
  state.lastLoginDate = today;
  saveState();
  addXP(20, 'Login harian');
  addCoins(5, 'Login harian');
  if(state.streak > 1) showToast('level', `Streak ${state.streak} hari berturut-turut! 🔥`);
}

function bindGlobalNav(){
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showScreen(btn.dataset.screen)));
  document.body.addEventListener('click', e => {
    const backBtn = e.target.closest('[data-back]');
    if(backBtn) showScreen(backBtn.dataset.back);
  });
}

function init(){
  bindGlobalNav();
  updateHUD();
  handleDailyLogin();
  updateHUD();
  checkAchievements();
  showScreen('skilltree');
}
document.addEventListener('DOMContentLoaded', init);
