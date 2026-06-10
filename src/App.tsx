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

type Vault = {
  id: string; // 0x hex vaultId
  address: string;
  balance: bigint;
};

type Tab = "vaults" | "deposit" | "transfer" | "about";

function short(a: string) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function fmtEth(wei: bigint) {
  const s = ethers.formatEther(wei);
  const n = Number(s);
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export default function App() {
  const eth = (window as any).ethereum;

  const [account, setAccount] = useState<string>("");
  const [chainOk, setChainOk] = useState(false);
  const [quipSigner, setQuipSigner] = useState<QuipSigner | null>(null);
  const [client, setClient] = useState<QuipClient | null>(null);

  const [vaults, setVaults] = useState<Vault[]>([]);
  const [creationFee, setCreationFee] = useState<bigint | null>(null);
  const [loadingVaults, setLoadingVaults] = useState(false);

  const [tab, setTab] = useState<Tab>("vaults");
  const [busy, setBusy] = useState<string>("");
  const [log, setLog] = useState<{ msg: string; tx?: string; err?: boolean }[]>(
    []
  );

  // deposit form
  const [depVault, setDepVault] = useState("");
  const [depAmount, setDepAmount] = useState("");

  // transfer form
  const [trVault, setTrVault] = useState("");
  const [trTo, setTrTo] = useState("");
  const [trAmount, setTrAmount] = useState("");

  const provider = useMemo(
    () => (eth ? new ethers.BrowserProvider(eth) : null),
    [eth]
  );

  function addLog(msg: string, tx?: string, err = false) {
    setLog((l) => [{ msg, tx, err }, ...l].slice(0, 20));
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
      addLog("MetaMask bulunamadı. Lütfen MetaMask kur.", undefined, true);
      return;
    }
    setBusy("Cüzdan bağlanıyor…");
    try {
      const accounts: string[] = await eth.request({
        method: "eth_requestAccounts",
      });
      const ok = await ensureChain();
      if (!ok) {
        addLog("Base Sepolia ağına geçilemedi.", undefined, true);
        setBusy("");
        return;
      }
      setAccount(accounts[0]);
      setChainOk(true);

      // Derive a deterministic quantum secret from a wallet signature.
      setBusy("Quantum anahtar türetiliyor (imza iste)…");
      const p = new ethers.BrowserProvider(eth);
      const signer = await p.getSigner();
      const sig = await signer.signMessage(
        "Quip Quantum Vault — quantum key seed v1"
      );
      const secret = keccak_256(ethers.getBytes(sig));
      const qs = new QuipSigner(secret);
      setQuipSigner(qs);

      const c = new QuipClient(eth);
      setClient(c);
      const fee = await c.getCreationFee();
      setCreationFee(fee);
      addLog("Cüzdan bağlandı: " + short(accounts[0]));
      await refreshVaults(c, p);
    } catch (e: any) {
      addLog("Bağlantı hatası: " + (e?.message ?? e), undefined, true);
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
      if (list.length && !depVault) setDepVault(list[0].id);
      if (list.length && !trVault) setTrVault(list[0].id);
    } catch (e: any) {
      addLog("Vault listesi alınamadı: " + (e?.message ?? e), undefined, true);
    }
    setLoadingVaults(false);
  }

  async function createVault() {
    if (!client || !quipSigner) return;
    setBusy("Quantum vault oluşturuluyor (on-chain)…");
    try {
      const vaultId = new Uint8Array(32);
      crypto.getRandomValues(vaultId);
      const wallet = await client.createWallet(vaultId, quipSigner);
      const addr = await wallet.getAddress();
      addLog("Quantum vault oluşturuldu: " + short(addr));
      await refreshVaults();
      setTab("vaults");
    } catch (e: any) {
      addLog("Vault oluşturulamadı: " + (e?.message ?? e), undefined, true);
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
      addLog("Geçersiz miktar.", undefined, true);
      return;
    }
    setBusy("ETH vault'a yatırılıyor…");
    try {
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({ to: v.address, value: amount });
      const rc = await tx.wait();
      addLog(`Vault'a ${depAmount} ETH yatırıldı.`, rc?.hash);
      setDepAmount("");
      await refreshVaults();
    } catch (e: any) {
      addLog(
        "Yatırma başarısız: " + (e?.shortMessage ?? e?.message ?? e),
        undefined,
        true
      );
    }
    setBusy("");
  }

  async function transfer() {
    if (!client || !quipSigner) return;
    const v = vaults.find((x) => x.id === trVault);
    if (!v) return;
    if (!ethers.isAddress(trTo)) {
      addLog("Geçersiz alıcı adresi.", undefined, true);
      return;
    }
    let amount: bigint;
    try {
      amount = ethers.parseEther(trAmount);
    } catch {
      addLog("Geçersiz miktar.", undefined, true);
      return;
    }
    setBusy("Post-quantum imza (WOTS+) ile transfer yapılıyor…");
    try {
      const wallet = await client.getVault(ethers.getBytes(v.id), quipSigner);
      const rc = await wallet.transferWithWinternitz(trTo, amount);
      addLog(
        `Quantum-safe transfer: ${trAmount} ETH → ${short(trTo)}`,
        rc?.hash
      );
      setTrAmount("");
      await refreshVaults();
    } catch (e: any) {
      addLog(
        "Transfer başarısız: " + (e?.shortMessage ?? e?.message ?? e),
        undefined,
        true
      );
    }
    setBusy("");
  }

  useEffect(() => {
    if (!eth) return;
    const onAccounts = () => window.location.reload();
    const onChain = () => window.location.reload();
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [eth]);

  const totalLocked = vaults.reduce((a, v) => a + v.balance, 0n);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">⚛</span>
          <div>
            <h1>Quip Quantum Vault</h1>
            <p>Post-quantum güvenli kasalar · Base Sepolia</p>
          </div>
        </div>
        {account ? (
          <div className="acct">
            <span className="dot" /> {short(account)}
            {chainOk && <span className="chain">Base Sepolia</span>}
          </div>
        ) : (
          <button className="primary" onClick={connect} disabled={!!busy}>
            MetaMask Bağla
          </button>
        )}
      </header>

      {account && (
        <div className="stats">
          <div className="stat">
            <span>Quantum Vault</span>
            <b>{vaults.length}</b>
          </div>
          <div className="stat">
            <span>Korunan Toplam</span>
            <b>{fmtEth(totalLocked)} ETH</b>
          </div>
          <div className="stat">
            <span>Vault Oluşturma Ücreti</span>
            <b>{creationFee !== null ? fmtEth(creationFee) + " ETH" : "…"}</b>
          </div>
        </div>
      )}

      {account && (
        <nav className="tabs">
          {(
            [
              ["vaults", "🔐 Vaultlar"],
              ["deposit", "📥 Yatır"],
              ["transfer", "🚀 Quantum Transfer"],
              ["about", "ℹ️ Nasıl Çalışır"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              className={tab === t ? "tab active" : "tab"}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {busy && <div className="busy">{busy}</div>}

      {account && tab === "vaults" && (
        <section className="card">
          <div className="cardhead">
            <h2>Quantum Vaultların</h2>
            <div>
              <button onClick={() => refreshVaults()} disabled={loadingVaults}>
                {loadingVaults ? "Yükleniyor…" : "Yenile"}
              </button>{" "}
              <button
                className="primary"
                onClick={createVault}
                disabled={!!busy}
              >
                + Yeni Quantum Vault
              </button>
            </div>
          </div>
          {vaults.length === 0 ? (
            <p className="muted">
              Henüz vault yok. "Yeni Quantum Vault" ile ilk post-quantum kasanı
              oluştur — WOTS+ (Winternitz) imza anahtarın on-chain kaydedilir.
            </p>
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
          <h2>Vault'a ETH Yatır</h2>
          <label>Vault</label>
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
          <label>Miktar (ETH)</label>
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
            Yatır
          </button>
        </section>
      )}

      {account && tab === "transfer" && (
        <section className="card">
          <h2>Quantum-Safe Transfer</h2>
          <p className="muted">
            Transfer, tek kullanımlık WOTS+ post-quantum imzasıyla yapılır ve
            vault'un quantum anahtarı otomatik olarak yenilenir.
          </p>
          <label>Kaynak Vault</label>
          <select value={trVault} onChange={(e) => setTrVault(e.target.value)}>
            {vaults.map((v) => (
              <option key={v.id} value={v.id}>
                {short(v.address)} — {fmtEth(v.balance)} ETH
              </option>
            ))}
          </select>
          <label>Alıcı Adres</label>
          <input
            placeholder="0x…"
            value={trTo}
            onChange={(e) => setTrTo(e.target.value)}
          />
          <label>Miktar (ETH)</label>
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
            Quantum İmza ile Gönder
          </button>
        </section>
      )}

      {account && tab === "about" && (
        <section className="card">
          <h2>Nasıl Çalışır</h2>
          <ol className="how">
            <li>
              Cüzdan imzandan deterministik bir <b>quantum secret</b> türetilir
              (zincire hiç çıkmaz).
            </li>
            <li>
              <b>QuipFactory</b> ({short(QUIP_FACTORY_ADDRESS)}) üzerinden
              CREATE2 ile sana özel bir <b>QuipWallet</b> kontratı deploy
              edilir.
            </li>
            <li>
              Her vault'un sahibi bir{" "}
              <b>WOTS+ (Winternitz One-Time Signature)</b> public key hash'idir
              — hash tabanlı imzalar quantum bilgisayarlara dayanıklıdır.
            </li>
            <li>
              Her transferde tek kullanımlık imza harcanır ve bir sonraki
              quantum anahtar otomatik tanımlanır.
            </li>
          </ol>
        </section>
      )}

      {!account && (
        <section className="card hero">
          <h2>Varlıklarını quantum çağına hazırla</h2>
          <p className="muted">
            Quip Network'ün post-quantum kontratlarıyla Base Sepolia üzerinde
            quantum-dirençli kasalar oluştur, ETH yatır ve hash tabanlı WOTS+
            imzalarla transfer et.
          </p>
          <button className="primary big" onClick={connect}>
            MetaMask ile Başla
          </button>
        </section>
      )}

      {log.length > 0 && (
        <section className="card">
          <h2>İşlem Geçmişi</h2>
          <ul className="log">
            {log.map((l, i) => (
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
        Built by{" "}
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
