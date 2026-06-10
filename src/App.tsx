import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  QuipClient,
  QuipSigner,
  QUIP_FACTORY_ADDRESS,
} from "@quip.network/ethereum-sdk";
import "./App.css";

// ---- Base Sepolia ----
const CHAIN_ID_HEX = "0x14a34"; // 84532
const CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://sepolia.basescan.org"],
};
const EXPLORER = "https://sepolia.basescan.org";
const ACT_KEY = "qqv-activity-v1";

type Vault = { id: string; address: string; balance: bigint };
type Tab = "dashboard" | "vaults" | "deposit" | "transfer" | "execute" | "about";
type Act = {
  msg: string;
  tx?: string;
  err?: boolean;
  type: "create" | "deposit" | "transfer" | "execute" | "info" | "error";
  time: number;
};
type Lang = "en" | "tr";

const T = {
  en: {
    tagline: "Post-quantum secure vaults · Base Sepolia",
    connect: "Connect MetaMask",
    start: "Start with MetaMask",
    heroTitle: "Get your assets ready for the quantum era",
    heroText:
      "Create quantum-resistant vaults on Base Sepolia with Quip Network's post-quantum contracts. Deposit ETH and transfer with hash-based WOTS+ signatures.",
    statVaults: "Quantum Vaults",
    statProtected: "Total Protected",
    statFee: "Vault Creation Fee",
    tabs: {
      dashboard: "📊 Dashboard",
      vaults: "🔐 Vaults",
      deposit: "📥 Deposit",
      transfer: "🚀 Quantum Transfer",
      execute: "⚙️ Execute",
      about: "ℹ️ How It Works",
    } as Record<Tab, string>,
    yourVaults: "Your Quantum Vaults",
    refresh: "Refresh",
    loading: "Loading…",
    newVault: "+ New Quantum Vault",
    noVaults:
      'No vaults yet. Create your first post-quantum vault with "New Quantum Vault" — your WOTS+ (Winternitz) signature key gets registered on-chain.',
    depositTitle: "Deposit ETH to Vault",
    vault: "Vault",
    amount: "Amount (ETH)",
    depositBtn: "Deposit",
    transferTitle: "Quantum-Safe Transfer",
    transferText:
      "Transfers are signed with a one-time WOTS+ post-quantum signature, and the vault's quantum key rotates automatically.",
    sourceVault: "Source Vault",
    recipient: "Recipient Address",
    transferBtn: "Send with Quantum Signature",
    executeTitle: "Execute Contract Call",
    executeText:
      "Advanced: call any contract from your vault, authorized by a WOTS+ post-quantum signature.",
    target: "Target Contract Address",
    calldata: "Calldata (hex, 0x… — leave 0x for plain call)",
    valueOpt: "Value (ETH, optional)",
    executeBtn: "Execute with Quantum Signature",
    activity: "Activity",
    clear: "Clear",
    dashTitle: "Quantum Security Dashboard",
    score: "Quantum Security Score",
    dVaults: "Vaults",
    dProtected: "Protected ETH",
    dTxs: "On-chain Txs",
    dRotations: "Key Rotations",
    dBreakdown: "Activity Breakdown",
    bCreate: "Vault Created",
    bDeposit: "Deposits",
    bTransfer: "Quantum Transfers",
    bExecute: "Executions",
    howTitle: "How It Works",
    how1: () =>
      `A deterministic quantum secret is derived from your wallet signature (it never touches the chain).`,
    how2: (s: string) =>
      `A personal QuipWallet contract is deployed for you via CREATE2 through QuipFactory (${s}).`,
    how3:
      "Each vault is owned by a WOTS+ (Winternitz One-Time Signature) public key hash — hash-based signatures are resistant to quantum computers.",
    how4:
      "Every transfer spends a one-time signature and the next quantum key is registered automatically.",
    busyConnect: "Connecting wallet…",
    busyKey: "Deriving quantum key (sign the message)…",
    busyCreate: "Creating quantum vault (on-chain)…",
    busyDeposit: "Depositing ETH to vault…",
    busyTransfer: "Transferring with post-quantum (WOTS+) signature…",
    busyExecute: "Executing with post-quantum (WOTS+) signature…",
    logConnected: "Wallet connected: ",
    logCreated: "Quantum vault created: ",
    logDeposited: (a: string) => `Deposited ${a} ETH to vault.`,
    logTransferred: (a: string, to: string) =>
      `Quantum-safe transfer: ${a} ETH → ${to}`,
    logExecuted: (to: string) => `Quantum-signed execution → ${to}`,
    errNoMM: "MetaMask not found. Please install MetaMask.",
    errChain: "Could not switch to Base Sepolia.",
    errConn: "Connection error: ",
    errVaults: "Could not load vaults: ",
    errCreate: "Vault creation failed: ",
    errAmount: "Invalid amount.",
    errAddr: "Invalid recipient address.",
    errTarget: "Invalid target address.",
    errCalldata: "Invalid calldata hex.",
    errDeposit: "Deposit failed: ",
    errTransfer: "Transfer failed: ",
    errExecute: "Execution failed: ",
    footerBuilt: "Built by",
  },
  tr: {
    tagline: "Post-quantum güvenli kasalar · Base Sepolia",
    connect: "MetaMask Bağla",
    start: "MetaMask ile Başla",
    heroTitle: "Varlıklarını quantum çağına hazırla",
    heroText:
      "Quip Network'ün post-quantum kontratlarıyla Base Sepolia üzerinde quantum-dirençli kasalar oluştur, ETH yatır ve hash tabanlı WOTS+ imzalarla transfer et.",
    statVaults: "Quantum Vault",
    statProtected: "Korunan Toplam",
    statFee: "Vault Oluşturma Ücreti",
    tabs: {
      dashboard: "📊 Panel",
      vaults: "🔐 Vaultlar",
      deposit: "📥 Yatır",
      transfer: "🚀 Quantum Transfer",
      execute: "⚙️ Çalıştır",
      about: "ℹ️ Nasıl Çalışır",
    } as Record<Tab, string>,
    yourVaults: "Quantum Vaultların",
    refresh: "Yenile",
    loading: "Yükleniyor…",
    newVault: "+ Yeni Quantum Vault",
    noVaults:
      'Henüz vault yok. "Yeni Quantum Vault" ile ilk post-quantum kasanı oluştur — WOTS+ (Winternitz) imza anahtarın on-chain kaydedilir.',
    depositTitle: "Vault'a ETH Yatır",
    vault: "Vault",
    amount: "Miktar (ETH)",
    depositBtn: "Yatır",
    transferTitle: "Quantum-Safe Transfer",
    transferText:
      "Transfer, tek kullanımlık WOTS+ post-quantum imzasıyla yapılır ve vault'un quantum anahtarı otomatik yenilenir.",
    sourceVault: "Kaynak Vault",
    recipient: "Alıcı Adres",
    transferBtn: "Quantum İmza ile Gönder",
    executeTitle: "Kontrat Çağrısı Çalıştır",
    executeText:
      "İleri seviye: vault'undan herhangi bir kontratı WOTS+ post-quantum imzasıyla çağır.",
    target: "Hedef Kontrat Adresi",
    calldata: "Calldata (hex, 0x… — düz çağrı için 0x bırak)",
    valueOpt: "Değer (ETH, opsiyonel)",
    executeBtn: "Quantum İmza ile Çalıştır",
    activity: "İşlem Geçmişi",
    clear: "Temizle",
    dashTitle: "Quantum Güvenlik Paneli",
    score: "Quantum Güvenlik Skoru",
    dVaults: "Vault",
    dProtected: "Korunan ETH",
    dTxs: "On-chain İşlem",
    dRotations: "Anahtar Yenileme",
    dBreakdown: "Aktivite Dağılımı",
    bCreate: "Vault Oluşturma",
    bDeposit: "Yatırma",
    bTransfer: "Quantum Transfer",
    bExecute: "Çalıştırma",
    howTitle: "Nasıl Çalışır",
    how1: () =>
      "Cüzdan imzandan deterministik bir quantum secret türetilir (zincire hiç çıkmaz).",
    how2: (s: string) =>
      `QuipFactory (${s}) üzerinden CREATE2 ile sana özel bir QuipWallet kontratı deploy edilir.`,
    how3:
      "Her vault'un sahibi bir WOTS+ (Winternitz One-Time Signature) public key hash'idir — hash tabanlı imzalar quantum bilgisayarlara dayanıklıdır.",
    how4:
      "Her transferde tek kullanımlık imza harcanır ve bir sonraki quantum anahtar otomatik tanımlanır.",
    busyConnect: "Cüzdan bağlanıyor…",
    busyKey: "Quantum anahtar türetiliyor (imzayı onayla)…",
    busyCreate: "Quantum vault oluşturuluyor (on-chain)…",
    busyDeposit: "ETH vault'a yatırılıyor…",
    busyTransfer: "Post-quantum imza (WOTS+) ile transfer yapılıyor…",
    busyExecute: "Post-quantum imza (WOTS+) ile çalıştırılıyor…",
    logConnected: "Cüzdan bağlandı: ",
    logCreated: "Quantum vault oluşturuldu: ",
    logDeposited: (a: string) => `Vault'a ${a} ETH yatırıldı.`,
    logTransferred: (a: string, to: string) =>
      `Quantum-safe transfer: ${a} ETH → ${to}`,
    logExecuted: (to: string) => `Quantum imzalı çağrı → ${to}`,
    errNoMM: "MetaMask bulunamadı. Lütfen MetaMask kur.",
    errChain: "Base Sepolia ağına geçilemedi.",
    errConn: "Bağlantı hatası: ",
    errVaults: "Vault listesi alınamadı: ",
    errCreate: "Vault oluşturulamadı: ",
    errAmount: "Geçersiz miktar.",
    errAddr: "Geçersiz alıcı adresi.",
    errTarget: "Geçersiz hedef adres.",
    errCalldata: "Geçersiz calldata.",
    errDeposit: "Yatırma başarısız: ",
    errTransfer: "Transfer başarısız: ",
    errExecute: "Çalıştırma başarısız: ",
    footerBuilt: "Built by",
  },
};

function short(a: string) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function fmtEth(wei: bigint) {
  const n = Number(ethers.formatEther(wei));
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function loadActs(): Act[] {
  try {
    return JSON.parse(localStorage.getItem(ACT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function App() {
  const eth = (window as any).ethereum;

  const [lang, setLang] = useState<Lang>(
    (localStorage.getItem("qqv-lang") as Lang) || "en"
  );
  const t = T[lang];

  const [account, setAccount] = useState("");
  const [chainOk, setChainOk] = useState(false);
  const [quipSigner, setQuipSigner] = useState<QuipSigner | null>(null);
  const [client, setClient] = useState<QuipClient | null>(null);

  const [vaults, setVaults] = useState<Vault[]>([]);
  const [creationFee, setCreationFee] = useState<bigint | null>(null);
  const [loadingVaults, setLoadingVaults] = useState(false);

  const [tab, setTab] = useState<Tab>("dashboard");
  const [busy, setBusy] = useState("");
  const [acts, setActs] = useState<Act[]>(loadActs());

  const [depVault, setDepVault] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [trVault, setTrVault] = useState("");
  const [trTo, setTrTo] = useState("");
  const [trAmount, setTrAmount] = useState("");
  const [exVault, setExVault] = useState("");
  const [exTarget, setExTarget] = useState("");
  const [exData, setExData] = useState("0x");
  const [exValue, setExValue] = useState("");

  const provider = useMemo(
    () => (eth ? new ethers.BrowserProvider(eth) : null),
    [eth]
  );

  function addAct(a: Omit<Act, "time">) {
    setActs((l) => {
      const next = [{ ...a, time: Date.now() }, ...l].slice(0, 50);
      localStorage.setItem(ACT_KEY, JSON.stringify(next));
      return next;
    });
  }

  function setLanguage(l: Lang) {
    setLang(l);
    localStorage.setItem("qqv-lang", l);
  }

  async function ensureChain(): Promise<boolean> {
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
      return true;
    } catch (e: any) {
      if (e?.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [CHAIN_PARAMS],
        });
        return true;
      }
      return false;
    }
  }

  async function connect() {
    if (!eth) {
      addAct({ msg: t.errNoMM, err: true, type: "error" });
      return;
    }
    setBusy(t.busyConnect);
    try {
      const accounts: string[] = await eth.request({
        method: "eth_requestAccounts",
      });
      const ok = await ensureChain();
      if (!ok) {
        addAct({ msg: t.errChain, err: true, type: "error" });
        setBusy("");
        return;
      }
      setAccount(accounts[0]);
      setChainOk(true);

      setBusy(t.busyKey);
      const p = new ethers.BrowserProvider(eth);
      const signer = await p.getSigner();
      const sig = await signer.signMessage(
        "Quip Quantum Vault — quantum key seed v1"
      );
      const secret = keccak_256(ethers.getBytes(sig));
      setQuipSigner(new QuipSigner(secret));

      const c = new QuipClient(eth);
      setClient(c);
      setCreationFee(await c.getCreationFee());
      addAct({ msg: t.logConnected + short(accounts[0]), type: "info" });
      await refreshVaults(c, p);
    } catch (e: any) {
      addAct({
        msg: t.errConn + (e?.message ?? e),
        err: true,
        type: "error",
      });
    }
    setBusy("");
  }

  async function refreshVaults(
    c?: QuipClient | null,
    p?: ethers.BrowserProvider | null
  ) {
    const cl = c ?? client;
    const pr = p ?? provider;
    if (!cl || !pr) return;
    setLoadingVaults(true);
    try {
      const map = await cl.getVaults();
      const list: Vault[] = [];
      for (const [id, address] of map.entries()) {
        const balance = await pr.getBalance(address);
        list.push({ id, address, balance });
      }
      setVaults(list);
      if (list.length) {
        if (!depVault) setDepVault(list[0].id);
        if (!trVault) setTrVault(list[0].id);
        if (!exVault) setExVault(list[0].id);
      }
    } catch (e: any) {
      addAct({
        msg: t.errVaults + (e?.message ?? e),
        err: true,
        type: "error",
      });
    }
    setLoadingVaults(false);
  }

  async function createVault() {
    if (!client || !quipSigner) return;
    setBusy(t.busyCreate);
    try {
      const vaultId = new Uint8Array(32);
      crypto.getRandomValues(vaultId);
      const wallet = await client.createWallet(vaultId, quipSigner);
      const addr = await wallet.getAddress();
      addAct({ msg: t.logCreated + short(addr), type: "create" });
      await refreshVaults();
      setTab("vaults");
    } catch (e: any) {
      addAct({
        msg: t.errCreate + (e?.message ?? e),
        err: true,
        type: "error",
      });
    }
    setBusy("");
  }

  async function deposit() {
    if (!provider) return;
    const v = vaults.find((x) => x.id === depVault);
    if (!v) return;
    let amount: bigint;
    try {
      amount = ethers.parseEther(depAmount);
    } catch {
      addAct({ msg: t.errAmount, err: true, type: "error" });
      return;
    }
    setBusy(t.busyDeposit);
    try {
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({ to: v.address, value: amount });
      const rc = await tx.wait();
      addAct({ msg: t.logDeposited(depAmount), tx: rc?.hash, type: "deposit" });
      setDepAmount("");
      await refreshVaults();
    } catch (e: any) {
      addAct({
        msg: t.errDeposit + (e?.shortMessage ?? e?.message ?? e),
        err: true,
        type: "error",
      });
    }
    setBusy("");
  }

  async function transfer() {
    if (!client || !quipSigner) return;
    const v = vaults.find((x) => x.id === trVault);
    if (!v) return;
    if (!ethers.isAddress(trTo)) {
      addAct({ msg: t.errAddr, err: true, type: "error" });
      return;
    }
    let amount: bigint;
    try {
      amount = ethers.parseEther(trAmount);
    } catch {
      addAct({ msg: t.errAmount, err: true, type: "error" });
      return;
    }
    setBusy(t.busyTransfer);
    try {
      const wallet = await client.getVault(ethers.getBytes(v.id), quipSigner);
      const rc = await wallet.transferWithWinternitz(trTo, amount);
      addAct({
        msg: t.logTransferred(trAmount, short(trTo)),
        tx: rc?.hash,
        type: "transfer",
      });
      setTrAmount("");
      await refreshVaults();
    } catch (e: any) {
      addAct({
        msg: t.errTransfer + (e?.shortMessage ?? e?.message ?? e),
        err: true,
        type: "error",
      });
    }
    setBusy("");
  }

  async function execute() {
    if (!client || !quipSigner) return;
    const v = vaults.find((x) => x.id === exVault);
    if (!v) return;
    if (!ethers.isAddress(exTarget)) {
      addAct({ msg: t.errTarget, err: true, type: "error" });
      return;
    }
    let opdata: Uint8Array;
    try {
      opdata = ethers.getBytes(exData || "0x");
    } catch {
      addAct({ msg: t.errCalldata, err: true, type: "error" });
      return;
    }
    let value = 0n;
    if (exValue) {
      try {
        value = ethers.parseEther(exValue);
      } catch {
        addAct({ msg: t.errAmount, err: true, type: "error" });
        return;
      }
    }
    setBusy(t.busyExecute);
    try {
      const wallet = await client.getVault(ethers.getBytes(v.id), quipSigner);
      const rc = await wallet.executeWithWinternitz(exTarget, opdata, {
        value,
      });
      addAct({
        msg: t.logExecuted(short(exTarget)),
        tx: rc?.hash,
        type: "execute",
      });
      await refreshVaults();
    } catch (e: any) {
      addAct({
        msg: t.errExecute + (e?.shortMessage ?? e?.message ?? e),
        err: true,
        type: "error",
      });
    }
    setBusy("");
  }

  useEffect(() => {
    if (!eth) return;
    const reload = () => window.location.reload();
    eth.on?.("accountsChanged", reload);
    eth.on?.("chainChanged", reload);
    return () => {
      eth.removeListener?.("accountsChanged", reload);
      eth.removeListener?.("chainChanged", reload);
    };
  }, [eth]);

  const totalLocked = vaults.reduce((a, v) => a + v.balance, 0n);
  const counts = {
    create: acts.filter((a) => a.type === "create").length,
    deposit: acts.filter((a) => a.type === "deposit").length,
    transfer: acts.filter((a) => a.type === "transfer").length,
    execute: acts.filter((a) => a.type === "execute").length,
  };
  const txCount =
    counts.create + counts.deposit + counts.transfer + counts.execute;
  const score = Math.min(
    100,
    vaults.length * 20 +
      counts.transfer * 10 +
      counts.execute * 10 +
      counts.deposit * 5
  );
  const R = 52;
  const CIRC = 2 * Math.PI * R;

  const maxCount = Math.max(
    1,
    counts.create,
    counts.deposit,
    counts.transfer,
    counts.execute
  );
  const bars: [string, number, string][] = [
    [t.bCreate, counts.create, "#a78bfa"],
    [t.bDeposit, counts.deposit, "#60a5fa"],
    [t.bTransfer, counts.transfer, "#34d399"],
    [t.bExecute, counts.execute, "#f472b6"],
  ];

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">⚛</span>
          <div>
            <h1>Quip Quantum Vault</h1>
            <p>{t.tagline}</p>
          </div>
        </div>
        <div className="headright">
          <div className="langs">
            <button
              className={lang === "en" ? "lng on" : "lng"}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
            <button
              className={lang === "tr" ? "lng on" : "lng"}
              onClick={() => setLanguage("tr")}
            >
              TR
            </button>
          </div>
          {account ? (
            <div className="acct">
              <span className="dot" /> {short(account)}
              {chainOk && <span className="chain">Base Sepolia</span>}
            </div>
          ) : (
            <button className="primary" onClick={connect} disabled={!!busy}>
              {t.connect}
            </button>
          )}
        </div>
      </header>

      {account && (
        <div className="stats">
          <div className="stat">
            <span>{t.statVaults}</span>
            <b>{vaults.length}</b>
          </div>
          <div className="stat">
            <span>{t.statProtected}</span>
            <b>{fmtEth(totalLocked)} ETH</b>
          </div>
          <div className="stat">
            <span>{t.statFee}</span>
            <b>{creationFee !== null ? fmtEth(creationFee) + " ETH" : "…"}</b>
          </div>
        </div>
      )}

      {account && (
        <nav className="tabs">
          {(Object.keys(t.tabs) as Tab[]).map((k) => (
            <button
              key={k}
              className={tab === k ? "tab active" : "tab"}
              onClick={() => setTab(k)}
            >
              {t.tabs[k]}
            </button>
          ))}
        </nav>
      )}

      {busy && <div className="busy">{busy}</div>}

      {account && tab === "dashboard" && (
        <section className="card">
          <h2>{t.dashTitle}</h2>
          <div className="dash">
            <div className="ringwrap">
              <svg width="140" height="140" viewBox="0 0 140 140">
                <circle
                  cx="70"
                  cy="70"
                  r={R}
                  stroke="#23264a"
                  strokeWidth="12"
                  fill="none"
                />
                <circle
                  cx="70"
                  cy="70"
                  r={R}
                  stroke="url(#g)"
                  strokeWidth="12"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC - (CIRC * score) / 100}
                  transform="rotate(-90 70 70)"
                  className="ring"
                />
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <text
                  x="70"
                  y="66"
                  textAnchor="middle"
                  fill="#e7e9f5"
                  fontSize="26"
                  fontWeight="700"
                >
                  {score}
                </text>
                <text
                  x="70"
                  y="86"
                  textAnchor="middle"
                  fill="#8b8fa3"
                  fontSize="10"
                >
                  / 100
                </text>
              </svg>
              <div className="ringlabel">{t.score}</div>
            </div>
            <div className="dgrid">
              <div className="dstat">
                <b>{vaults.length}</b>
                <span>{t.dVaults}</span>
              </div>
              <div className="dstat">
                <b>{fmtEth(totalLocked)}</b>
                <span>{t.dProtected}</span>
              </div>
              <div className="dstat">
                <b>{txCount}</b>
                <span>{t.dTxs}</span>
              </div>
              <div className="dstat">
                <b>{counts.transfer + counts.execute}</b>
                <span>{t.dRotations}</span>
              </div>
            </div>
          </div>
          <h3 className="subh">{t.dBreakdown}</h3>
          <div className="bars">
            {bars.map(([label, n, color]) => (
              <div className="barrow" key={label}>
                <span className="barlabel">{label}</span>
                <div className="bartrack">
                  <div
                    className="barfill"
                    style={{
                      width: `${(n / maxCount) * 100}%`,
                      background: color,
                    }}
                  />
                </div>
                <span className="barnum">{n}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {account && tab === "vaults" && (
        <section className="card">
          <div className="cardhead">
            <h2>{t.yourVaults}</h2>
            <div>
              <button onClick={() => refreshVaults()} disabled={loadingVaults}>
                {loadingVaults ? t.loading : t.refresh}
              </button>{" "}
              <button
                className="primary"
                onClick={createVault}
                disabled={!!busy}
              >
                {t.newVault}
              </button>
            </div>
          </div>
          {vaults.length === 0 ? (
            <p className="muted">{t.noVaults}</p>
          ) : (
            <ul className="vaults">
              {vaults.map((v) => (
                <li key={v.id}>
                  <div>
                    <b>{short(v.address)}</b>
                    <span className="muted"> · id {short(v.id)}</span>
                  </div>
                  <div className="bal">{fmtEth(v.balance)} ETH</div>
                  <a
                    href={`${EXPLORER}/address/${v.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Explorer ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {account && tab === "deposit" && (
        <section className="card">
          <h2>{t.depositTitle}</h2>
          <label>{t.vault}</label>
          <select
            value={depVault}
            onChange={(e) => setDepVault(e.target.value)}
          >
            {vaults.map((v) => (
              <option key={v.id} value={v.id}>
                {short(v.address)} — {fmtEth(v.balance)} ETH
              </option>
            ))}
          </select>
          <label>{t.amount}</label>
          <input
            placeholder="0.001"
            value={depAmount}
            onChange={(e) => setDepAmount(e.target.value)}
          />
          <button
            className="primary"
            onClick={deposit}
            disabled={!!busy || !vaults.length}
          >
            {t.depositBtn}
          </button>
        </section>
      )}

      {account && tab === "transfer" && (
        <section className="card">
          <h2>{t.transferTitle}</h2>
          <p className="muted">{t.transferText}</p>
          <label>{t.sourceVault}</label>
          <select value={trVault} onChange={(e) => setTrVault(e.target.value)}>
            {vaults.map((v) => (
              <option key={v.id} value={v.id}>
                {short(v.address)} — {fmtEth(v.balance)} ETH
              </option>
            ))}
          </select>
          <label>{t.recipient}</label>
          <input
            placeholder="0x…"
            value={trTo}
            onChange={(e) => setTrTo(e.target.value)}
          />
          <label>{t.amount}</label>
          <input
            placeholder="0.0005"
            value={trAmount}
            onChange={(e) => setTrAmount(e.target.value)}
          />
          <button
            className="primary"
            onClick={transfer}
            disabled={!!busy || !vaults.length}
          >
            {t.transferBtn}
          </button>
        </section>
      )}

      {account && tab === "execute" && (
        <section className="card">
          <h2>{t.executeTitle}</h2>
          <p className="muted">{t.executeText}</p>
          <label>{t.sourceVault}</label>
          <select value={exVault} onChange={(e) => setExVault(e.target.value)}>
            {vaults.map((v) => (
              <option key={v.id} value={v.id}>
                {short(v.address)} — {fmtEth(v.balance)} ETH
              </option>
            ))}
          </select>
          <label>{t.target}</label>
          <input
            placeholder="0x…"
            value={exTarget}
            onChange={(e) => setExTarget(e.target.value)}
          />
          <label>{t.calldata}</label>
          <input
            placeholder="0x"
            value={exData}
            onChange={(e) => setExData(e.target.value)}
          />
          <label>{t.valueOpt}</label>
          <input
            placeholder="0"
            value={exValue}
            onChange={(e) => setExValue(e.target.value)}
          />
          <button
            className="primary"
            onClick={execute}
            disabled={!!busy || !vaults.length}
          >
            {t.executeBtn}
          </button>
        </section>
      )}

      {account && tab === "about" && (
        <section className="card">
          <h2>{t.howTitle}</h2>
          <ol className="how">
            <li>{t.how1()}</li>
            <li>{t.how2(short(QUIP_FACTORY_ADDRESS))}</li>
            <li>{t.how3}</li>
            <li>{t.how4}</li>
          </ol>
        </section>
      )}

      {!account && (
        <section className="card hero">
          <h2>{t.heroTitle}</h2>
          <p className="muted">{t.heroText}</p>
          <button className="primary big" onClick={connect}>
            {t.start}
          </button>
        </section>
      )}

      {acts.length > 0 && (
        <section className="card">
          <div className="cardhead">
            <h2>{t.activity}</h2>
            <button
              onClick={() => {
                setActs([]);
                localStorage.removeItem(ACT_KEY);
              }}
            >
              {t.clear}
            </button>
          </div>
          <ul className="log">
            {acts.map((l, i) => (
              <li key={i} className={l.err ? "err" : ""}>
                {l.msg}{" "}
                {l.tx && (
                  <a
                    href={`${EXPLORER}/tx/${l.tx}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    tx ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer>
        {t.footerBuilt}{" "}
        <a href="https://twitter.com/Dnyelfy" target="_blank" rel="noreferrer">
          @Dnyelfy
        </a>{" "}
        · Powered by Quip Network · QuipFactory{" "}
        <a
          href={`${EXPLORER}/address/${QUIP_FACTORY_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
        >
          {short(QUIP_FACTORY_ADDRESS)}
        </a>
      </footer>
    </div>
  );
}
